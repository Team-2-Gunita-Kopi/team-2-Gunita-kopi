import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor, within } from "@testing-library/react";
import type { Ingredient, Supplier } from "@/contracts";
import { renderWithProviders } from "@/owner/test/render";

// Real mode: the suppliers page against the (mocked) API modules.
vi.mock("@/owner/lib/use-mocks", () => ({ USE_MOCKS: false }));

const suppliersApi = vi.hoisted(() => ({
  listSuppliers: vi.fn(), createSupplier: vi.fn(), updateSupplier: vi.fn(), deleteSupplier: vi.fn(),
}));
vi.mock("@/owner/features/suppliers/api", () => suppliersApi);
const inventoryApi = vi.hoisted(() => ({ listIngredients: vi.fn() }));
vi.mock("@/owner/features/inventory/api", () => inventoryApi);

import SuppliersPage from "@/app/(owner)/admin/(app)/suppliers/page";

const NO_ADDRESS = { street: null, barangay: null, city: null, province: null, zipCode: null, region: null };
const BEAN_CO = {
  id: 1, name: "Bean Co", contactPerson: "Ana Cruz", contactNumber: "09171234567", address: null,
  street: "12 Mabini St.", barangay: "Poblacion", city: "La Trinidad", province: "Benguet",
  zipCode: "2601", region: "CAR (Cordillera Administrative Region)", status: "active",
} as Supplier;
// Saved before the address fields: only the old one-line address.
const DAIRY = {
  id: 2, name: "Dairy Farm", contactPerson: null, contactNumber: null, address: "Calamba, Laguna",
  ...NO_ADDRESS, status: "inactive",
} as Supplier;
const PINE = {
  id: 3, name: "Pine Mill", contactPerson: "Jo Reyes", contactNumber: null, address: null,
  street: "Session Rd.", barangay: "Session Road Area", city: "Baguio", province: "benguet",
  zipCode: "2600", region: "CAR (Cordillera Administrative Region)", status: "active",
} as Supplier;
const LAGUNA = {
  id: 4, name: "Laguna Milk", contactPerson: null, contactNumber: null, address: null,
  street: "National Hwy.", barangay: "Parian", city: "Calamba", province: "Laguna",
  zipCode: "4027", region: "Region IV-A (CALABARZON)", status: "active",
} as Supplier;

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

  // Why: the dialog closes on success; the toast is the only sign the supplier was saved. Every
  // address field is required, so suppliers can be searched and filtered by place.
  it("saves a supplier with every address field and reports it", async () => {
    suppliersApi.createSupplier.mockResolvedValue({ ...BEAN_CO, id: 5, name: "Cup Co" });
    renderWithProviders(<SuppliersPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Add supplier" }));
    // The filter bar has Province and City too; the form fields are the ones in the dialog.
    const form = within(await screen.findByRole("dialog"));
    await userEvent.type(form.getByLabelText("Supplier Name"), "Cup Co");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    expect(suppliersApi.createSupplier).not.toHaveBeenCalled();

    await userEvent.type(form.getByLabelText("Street / Building"), "5 Rizal Ave.");
    await userEvent.type(form.getByLabelText("Barangay"), "San Jose");
    await userEvent.type(form.getByLabelText("City / Municipality"), "Lipa");
    await userEvent.type(form.getByLabelText("Province"), "Batangas");
    await userEvent.type(form.getByLabelText("ZIP Code"), "4217");
    await userEvent.selectOptions(form.getByLabelText("Region"), "Region IV-A (CALABARZON)");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(suppliersApi.createSupplier).toHaveBeenCalledWith({
        name: "Cup Co", contactPerson: "", contactNumber: "", street: "5 Rizal Ave.", barangay: "San Jose",
        city: "Lipa", province: "Batangas", zipCode: "4217", region: "Region IV-A (CALABARZON)",
      }),
    );
    expect(await screen.findByText("Supplier added.")).toBeInTheDocument();
  });

  // Why: older suppliers keep their one-line address until the Owner fills in the fields.
  it("shows the old address of a supplier saved before the address fields", async () => {
    renderWithProviders(<SuppliersPage />);
    const row = (await screen.findByText("Dairy Farm")).closest("tr")!;
    expect(within(row).getByText("Calamba, Laguna")).toBeInTheDocument();
    const bean = screen.getByText("Bean Co").closest("tr")!;
    expect(within(bean).getByText("12 Mabini St., Poblacion, La Trinidad, Benguet 2601")).toBeInTheDocument();
    await userEvent.click(within(row).getByRole("button", { name: /Edit/ }));
    const form = within(await screen.findByRole("dialog"));
    expect(form.getByText("Old address: Calamba, Laguna")).toBeInTheDocument();
    expect(form.getByLabelText("Street / Building")).toHaveValue("");
  });
});

describe("Suppliers page: search and filter by place", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    suppliersApi.listSuppliers.mockResolvedValue([BEAN_CO, DAIRY, PINE, LAGUNA]);
    inventoryApi.listIngredients.mockResolvedValue([]);
  });

  const rowNames = () =>
    screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => row.querySelector("strong")?.textContent);

  it("searches name, contact and every part of the address", async () => {
    renderWithProviders(<SuppliersPage />);
    await screen.findByText("Bean Co");
    const search = screen.getByLabelText("Search");
    await userEvent.type(search, "poblacion");
    expect(rowNames()).toEqual(["Bean Co"]);
    await userEvent.clear(search);
    await userEvent.type(search, "2600");
    expect(rowNames()).toEqual(["Pine Mill"]);
    await userEvent.clear(search);
    await userEvent.type(search, "calamba");
    expect(rowNames()).toEqual(["Dairy Farm", "Laguna Milk"]);
    await userEvent.clear(search);
    await userEvent.type(search, "jo baguio");
    expect(rowNames()).toEqual(["Pine Mill"]);
    await userEvent.clear(search);
    await userEvent.type(search, "cebu");
    expect(screen.getByText("No suppliers match these filters.")).toBeInTheDocument();
  });

  // Why: the same province typed with different capitals must be one choice, and the city list
  // must follow the province so the two filters never contradict each other.
  it("filters by province, then by a city of that province", async () => {
    renderWithProviders(<SuppliersPage />);
    await screen.findByText("Bean Co");
    const province = screen.getByLabelText("Province");
    const city = screen.getByLabelText("City / Municipality");
    expect(within(province).getAllByRole("option").map((o) => o.textContent)).toEqual(["All", "Benguet", "Laguna"]);

    await userEvent.selectOptions(province, "Benguet");
    expect(rowNames()).toEqual(["Bean Co", "Pine Mill"]);
    expect(within(city).getAllByRole("option").map((o) => o.textContent)).toEqual(["All", "Baguio", "La Trinidad"]);

    await userEvent.selectOptions(city, "Baguio");
    expect(rowNames()).toEqual(["Pine Mill"]);

    await userEvent.selectOptions(province, "Laguna");
    expect(city).toHaveValue("");
    expect(rowNames()).toEqual(["Laguna Milk"]);
  });
});

describe("Suppliers page: delete a supplier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    suppliersApi.listSuppliers.mockResolvedValue([BEAN_CO, DAIRY]);
    suppliersApi.deleteSupplier.mockResolvedValue({ id: 1, unlinkedIngredients: 2 });
    inventoryApi.listIngredients.mockResolvedValue([
      { id: 10, supplierId: 1 },
      { id: 11, supplierId: 1 },
    ] as unknown as Ingredient[]);
  });

  async function clickDelete() {
    renderWithProviders(<SuppliersPage />);
    const row = (await screen.findByText("Bean Co")).closest("tr")!;
    await userEvent.click(within(row).getByRole("button", { name: "Delete Bean Co" }));
    return screen.findByRole("dialog");
  }

  // Why: delete cannot be undone from the app and unlinks ingredients, so the Owner must read both
  // before confirming, and must see that it worked.
  it("warns that it cannot be undone, says how many ingredients lose it, deletes on confirm and says so", async () => {
    const dialog = await clickDelete();
    expect(within(dialog).getByText(/cannot be undone/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/2 ingredients will no longer have a supplier/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(suppliersApi.deleteSupplier).toHaveBeenCalledWith(1));
    expect(await screen.findByText("Bean Co deleted.")).toBeInTheDocument();
  });

  it("does nothing when the Owner cancels", async () => {
    const dialog = await clickDelete();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(suppliersApi.deleteSupplier).not.toHaveBeenCalled();
  });

  // Why: a failed delete must not look like a success.
  it("shows the API error as an error toast", async () => {
    suppliersApi.deleteSupplier.mockRejectedValue(new Error("Supplier not found"));
    const dialog = await clickDelete();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Could not delete Bean Co: Supplier not found")).toBeInTheDocument();
  });
});
