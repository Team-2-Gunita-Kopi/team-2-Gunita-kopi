import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor, within } from "@testing-library/react";
import type { Ingredient, Supplier } from "@/contracts";
import { renderWithProviders } from "@/owner/test/render";

// Real mode: the suppliers page against the (mocked) API modules.
vi.mock("@/owner/lib/use-mocks", () => ({ USE_MOCKS: false }));

const suppliersApi = vi.hoisted(() => ({ listSuppliers: vi.fn(), createSupplier: vi.fn(), updateSupplier: vi.fn() }));
vi.mock("@/owner/features/suppliers/api", () => suppliersApi);
const inventoryApi = vi.hoisted(() => ({ listIngredients: vi.fn() }));
vi.mock("@/owner/features/inventory/api", () => inventoryApi);

import SuppliersPage from "@/app/(owner)/admin/(app)/suppliers/page";

const BEAN_CO = {
  id: 1, name: "Bean Co", contactPerson: "Ana Cruz", contactNumber: "09171234567",
  address: "Quezon City", status: "active",
} as unknown as Supplier;
const DAIRY = {
  id: 2, name: "Dairy Farm", contactPerson: null, contactNumber: null, address: null, status: "inactive",
} as unknown as Supplier;

describe("Suppliers page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    suppliersApi.listSuppliers.mockResolvedValue([BEAN_CO, DAIRY]);
    suppliersApi.updateSupplier.mockResolvedValue({ ...BEAN_CO, status: "inactive" });
    inventoryApi.listIngredients.mockResolvedValue([
      { id: 10, supplierId: 1 },
      { id: 11, supplierId: 1 },
      { id: 12, supplierId: null },
    ] as unknown as Ingredient[]);
  });

  // Why: the Owner picks suppliers by who supplies what; the count must come from the ingredients.
  it("lists suppliers with contact details, status and how many ingredients each supplies", async () => {
    renderWithProviders(<SuppliersPage />);
    const row = (await screen.findByText("Bean Co")).closest("tr")!;
    expect(within(row).getByText("Ana Cruz")).toBeInTheDocument();
    expect(within(row).getByText("Active")).toBeInTheDocument();
    expect(within(row).getByText("2")).toBeInTheDocument();
    const inactive = screen.getByText("Dairy Farm").closest("tr")!;
    expect(within(inactive).getByText("Inactive")).toBeInTheDocument();
    expect(within(inactive).getByRole("button", { name: /Activate/ })).toBeInTheDocument();
  });

  // Why: deactivating must send only the status. A body that also carried defaults would wipe
  // the supplier's other details (the zod 4 .partial() trap fixed in patchOf).
  it("deactivates with a status-only update the API accepts", async () => {
    renderWithProviders(<SuppliersPage />);
    const row = (await screen.findByText("Bean Co")).closest("tr")!;
    await userEvent.click(within(row).getByRole("button", { name: /Deactivate/ }));
    await waitFor(() => expect(suppliersApi.updateSupplier).toHaveBeenCalledWith(1, { status: "inactive" }));
    expect(await screen.findByText("Bean Co deactivated.")).toBeInTheDocument();
  });

  // Why: the dialog closes on success; the toast is the only sign the supplier was saved.
  it("reports a saved supplier", async () => {
    suppliersApi.createSupplier.mockResolvedValue({ ...BEAN_CO, id: 3, name: "Cup Co" });
    renderWithProviders(<SuppliersPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Add supplier" }));
    await userEvent.type(screen.getByLabelText("Supplier Name"), "Cup Co");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(suppliersApi.createSupplier).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Supplier added.")).toBeInTheDocument();
  });
});
