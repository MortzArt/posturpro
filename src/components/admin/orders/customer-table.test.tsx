/**
 * CustomerTable row-link tests (T18 AC-1). The T18 change makes each customer's
 * NAME cell a link to the detail page (`${ADMIN_CUSTOMERS_PATH}/{id}`) in BOTH
 * the desktop table and the mobile card list, while the email stays plain
 * selectable text (only the identifier cell links, mirroring OrderTable). These
 * tests pin the href + data-testid so a future refactor cannot silently break
 * the drill-in affordance the Customers list exists to provide.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CustomerTable } from "./customer-table";
import { ADMIN_CUSTOMERS_PATH } from "@/lib/admin/constants";
import type { AdminCustomerRow } from "@/lib/admin/orders/customer-list-query";
import type { CustomerListFilters } from "@/lib/admin/orders/customer-list-filters";

afterEach(cleanup);

const CUSTOMER_ID = "22222222-2222-2222-2222-222222222222";

const ROW: AdminCustomerRow = {
  id: CUSTOMER_ID,
  email: "maria.gonzalez@example.com",
  fullName: "María González Hernández",
  phone: "55 1234 5678",
  orderCount: 3,
};

const FILTERS: CustomerListFilters = { search: "", rawPage: "" };

function renderTable(rows: AdminCustomerRow[] = [ROW]) {
  return render(
    <CustomerTable rows={rows} totalCount={rows.length} page={1} lastPage={1} filters={FILTERS} />,
  );
}

describe("CustomerTable — name links to the detail page (AC-1)", () => {
  it("renders BOTH a desktop and a mobile name link to the customer detail", () => {
    renderTable();
    // Desktop table + mobile card each carry the same testid → two matches.
    const links = screen.getAllByTestId(`admin-customer-row-${CUSTOMER_ID}`);
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link.getAttribute("href")).toBe(`${ADMIN_CUSTOMERS_PATH}/${CUSTOMER_ID}`);
      expect(link.textContent).toBe("María González Hernández");
    }
  });

  it("keeps a visible focus affordance on the name link", () => {
    renderTable();
    const [link] = screen.getAllByTestId(`admin-customer-row-${CUSTOMER_ID}`);
    expect(link.className).toContain("focus-visible:underline");
  });

  it("leaves the email as plain selectable text, not a link", () => {
    renderTable();
    const emails = screen.getAllByText("maria.gonzalez@example.com");
    for (const email of emails) {
      expect(email.tagName).not.toBe("A");
      expect(email.closest("a")).toBeNull();
    }
  });

  it("renders no rows (and no links) for an empty page", () => {
    renderTable([]);
    expect(screen.queryByTestId(`admin-customer-row-${CUSTOMER_ID}`)).toBeNull();
  });
});
