import type { NextConfig } from "next";

/**
 * Supabase Storage host derived from the project URL. Product images are
 * served from `https://<ref>.supabase.co/storage/v1/object/public/...`, so
 * that host must be allow-listed for `next/image` (AC-16). We also allow the
 * seed placeholder image host (Unsplash) used before real photography lands.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseHost = supabaseUrl ? new URL(supabaseUrl).hostname : undefined;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      ...(supabaseHost
        ? ([
            {
              protocol: "https" as const,
              hostname: supabaseHost,
              pathname: "/storage/v1/object/public/**",
            },
          ] as const)
        : []),
      {
        protocol: "https" as const,
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
