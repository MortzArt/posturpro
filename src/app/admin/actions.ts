"use server";

/**
 * Admin server actions (T10) — login, logout, saveStoreSettings. The admin trust
 * boundary's write path. Each mutation re-verifies the session server-side before
 * touching anything (never trusts the middleware alone, AC-9 / edge 9). Cookies
 * are set/cleared via Next 16 async `cookies()`. Raw errors are never echoed.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MissingEnvVarError } from "@/lib/env";
import { clientIp } from "@/lib/request/client-ip";
import { verifyCredentials } from "@/lib/admin/auth";
import { createSessionCookieValue, isSessionValid } from "@/lib/admin/session";
import { checkLoginRateLimit } from "@/lib/admin/login-rate-limit";
import {
  ADMIN_COOKIE_PATH,
  ADMIN_LOGIN_PATH,
  ADMIN_ROOT_PATH,
  ADMIN_SESSION_COOKIE_NAME,
  getSessionMaxAgeSeconds,
} from "@/lib/admin/constants";
import {
  parseStoreSettingsInput,
  type AdminSettingsRawInput,
} from "@/lib/admin/settings-input";
import { updateStoreSettings } from "@/lib/store-settings";
import type {
  AdminLoginState,
  AdminSettingsState,
  AdminSettingsValues,
} from "./admin-form-state";

/** Whether we are running in production (drives the cookie `Secure` flag). */
const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Authenticate the Owner. On success sets the signed HttpOnly session cookie and
 * redirects to `/admin` (the redirect IS the confirmation — success is never a
 * rendered state). On any failure returns a generic state (no user enumeration,
 * AC-3). Missing admin env → generic "unavailable", never a stack trace, never
 * grants access (edge 4 / R5).
 */
export async function login(
  prevState: AdminLoginState,
  formData: FormData,
): Promise<AdminLoginState> {
  const submissionId = prevState.submissionId + 1;
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const values = { email };

  const ip = await clientIp();
  if (!checkLoginRateLimit(ip)) {
    console.warn(`[admin-login] rate-limited from ${ip} at ${new Date().toISOString()}`);
    return { status: "rate-limited", values, submissionId };
  }

  let authenticated: boolean;
  try {
    authenticated = verifyCredentials(email, password);
  } catch (caught) {
    if (caught instanceof MissingEnvVarError) {
      console.error(`[admin-login] admin env not configured: ${caught.variableName}`);
      return { status: "unavailable", values, submissionId };
    }
    throw caught;
  }

  if (!authenticated) {
    console.warn(`[admin-login] failed attempt from ${ip} at ${new Date().toISOString()}`);
    return { status: "error", values, submissionId };
  }

  await setSessionCookie();
  redirect(ADMIN_ROOT_PATH);
}

/** Issue a fresh signed session cookie (scoped to `/admin`, HttpOnly, Lax). */
async function setSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE_NAME, createSessionCookieValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PRODUCTION,
    path: ADMIN_COOKIE_PATH,
    maxAge: getSessionMaxAgeSeconds(),
  });
}

/**
 * Clear the session cookie (maxAge=0) and redirect to `/admin/login` (AC-6).
 * After logout AC-1 holds again. Submitted via a real `<form action={logout}>`
 * POST so it works without JS.
 */
export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PRODUCTION,
    path: ADMIN_COOKIE_PATH,
    maxAge: 0,
  });
  redirect(ADMIN_LOGIN_PATH);
}

/**
 * Save the store settings (AC-9, AC-10, edges 6/7/8/9). Re-verifies the session
 * first (rejects a direct POST without a valid cookie → redirect to login, edge
 * 9; the DB is never touched). Validates via the pure parser; field errors keep
 * the form filled. On success the write busts the storefront cache tag.
 */
export async function saveStoreSettings(
  prevState: AdminSettingsState,
  formData: FormData,
): Promise<AdminSettingsState> {
  const submissionId = prevState.submissionId + 1;
  await requireSession();

  const values = readSettingsValues(formData);
  const parsed = parseStoreSettingsInput(values);
  if (!parsed.ok) {
    return { status: "invalid", fieldErrors: parsed.fieldErrors, values, submissionId };
  }

  const result = await updateStoreSettings({
    store_name: parsed.values.store_name,
    contact_email: parsed.values.contact_email,
    shipping_flat_rate_cents: parsed.values.shipping_flat_rate_cents,
    free_shipping_threshold_cents: parsed.values.free_shipping_threshold_cents,
  });
  if (!result.ok) {
    return { status: "error", values, submissionId };
  }
  return { status: "success", values, submissionId };
}

/**
 * Authoritatively re-verify the admin session server-side. Redirects to
 * `/admin/login` when absent/invalid/expired — so a direct POST to a mutation
 * without a session never reaches the DB (edge 9). A missing session secret
 * (env failure) is treated as unauthenticated, never as "valid".
 */
async function requireSession(): Promise<void> {
  const cookieStore = await cookies();
  const value = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  let valid = false;
  try {
    valid = isSessionValid(value);
  } catch (caught) {
    if (!(caught instanceof MissingEnvVarError)) {
      throw caught;
    }
    console.error("[admin] session verification unavailable (missing env)");
  }
  if (!valid) {
    redirect(ADMIN_LOGIN_PATH);
  }
}

/** Read the four settings fields from the form as the preserved value shape. */
function readSettingsValues(formData: FormData): AdminSettingsValues {
  const raw: AdminSettingsRawInput = {
    store_name: String(formData.get("store_name") ?? ""),
    contact_email: String(formData.get("contact_email") ?? ""),
    shipping_flat_rate: String(formData.get("shipping_flat_rate") ?? ""),
    free_shipping_threshold: String(formData.get("free_shipping_threshold") ?? ""),
  };
  return raw;
}
