import "fake-indexeddb/auto";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { MOCK_SESSION_COOKIE, encodeMockSession } from "@gunita/auth";
import { createOwnerMockDb, createPosView } from "@gunita/mocks/owner";
import { useCartStore } from "@/features/pos/cart.store";
import { connectivityStore } from "@/lib/connectivity";
import { posDb } from "@/offline/db";
import { renderWithProviders } from "@/test/render";
import PosPage from "@/app/(pos)/pos/page";

let rpcCalls: string[] = [];
let failOps = new Set<string>();

function stubService() {
  const db = createOwnerMockDb({ storage: null, now: () => new Date("2026-11-16T06:00:00Z") });
  const view = createPosView(db) as unknown as Record<string, (...a: unknown[]) => unknown>;
  rpcCalls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      const { op, args } = JSON.parse(init.body) as { op: string; args: unknown[] };
      rpcCalls.push(op);
      if (failOps.has(op)) return { json: async () => ({ ok: false, error: { code: "X", message: `${op} failed` } }) } as Response;
      return { json: async () => ({ ok: true, data: view[op]!(...args) ?? null }) } as Response;
    }),
  );
}

async function openPayment(offline = false) {
  renderWithProviders(<PosPage />);
  const tile = await screen.findByRole("button", { name: /^Iced Spanish Latte/ });
  if (offline) connectivityStore.setState({ simulatedOffline: true });
  await userEvent.click(tile);
  await userEvent.click(tile);
  await userEvent.click(screen.getByRole("button", { name: "Charge ₱290.00" }));
  return await screen.findByRole("dialog", { name: "Payment" });
}

beforeEach(async () => {
  useCartStore.setState({ lines: [] });
  connectivityStore.setState({ browserOnline: true, simulatedOffline: false });
  document.cookie = `${MOCK_SESSION_COOKIE}=${encodeMockSession({ userId: "u-barista", role: "barista", fullName: "Test Barista", username: "barista" })}; path=/`;
  await posDb.ordersOutbox.clear();
  await posDb.meta.clear();
  failOps = new Set();
  stubService();
});
afterEach(() => vi.unstubAllGlobals());

describe("payment", () => {
  it("rejects empty and non-numeric amounts, shows change for a valid one", async () => {
    const dialog = await openPayment();
    const confirm = within(dialog).getByRole("button", { name: "Confirm" });
    const input = within(dialog).getByLabelText("Amount paid");
    expect(input).toHaveAttribute("inputmode", "decimal");
    expect(confirm).toBeDisabled();
    await userEvent.type(input, "abc");
    expect(confirm).toBeDisabled();
    await userEvent.clear(input);
    await userEvent.type(input, "100");
    expect(confirm).toBeDisabled();
    expect(within(dialog).getByText("Amount paid is less than the total.")).toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.type(input, "300");
    expect(confirm).toBeEnabled();
    expect(within(dialog).getByText("₱10.00")).toBeInTheDocument();
    expect(within(dialog).getByText("Cash")).toBeInTheDocument();
  });

  it("double confirm creates one outbox record", async () => {
    const dialog = await openPayment();
    await userEvent.type(within(dialog).getByLabelText("Amount paid"), "300");
    const confirm = within(dialog).getByRole("button", { name: "Confirm" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await screen.findByRole("dialog", { name: "Receipt" });
    expect(await posDb.ordersOutbox.count()).toBe(1);
  });
});

describe("checkout", () => {
  it("online: receipt shows the server queue number, no Pending sync, then New order clears the cart", async () => {
    const dialog = await openPayment();
    await userEvent.type(within(dialog).getByLabelText("Amount paid"), "300");
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    const receipt = await screen.findByRole("dialog", { name: "Receipt" });
    expect(await within(receipt).findByText(/^20261116-A-/)).toBeInTheDocument();
    expect(within(receipt).queryByText("Pending sync")).not.toBeInTheDocument();
    expect(rpcCalls).toContain("syncOrders");
    const [rec] = await posDb.ordersOutbox.toArray();
    expect(rec!.status).toBe("synced");
    await userEvent.click(within(receipt).getByRole("button", { name: "New order" }));
    expect(useCartStore.getState().lines).toHaveLength(0);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("offline: receipt shows OFF-001 and Pending sync, record stays pending", async () => {
    const dialog = await openPayment(true);
    await userEvent.type(within(dialog).getByLabelText("Amount paid"), "300");
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    const receipt = await screen.findByRole("dialog", { name: "Receipt" });
    expect(within(receipt).getByText("OFF-001")).toBeInTheDocument();
    expect(within(receipt).getByText("Pending sync")).toBeInTheDocument();
    const [rec] = await posDb.ordersOutbox.toArray();
    expect(rec).toMatchObject({ status: "pending", provisionalNo: "OFF-001" });
    expect(rpcCalls).not.toContain("syncOrders");
  });

  it("Print calls window.print", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    const dialog = await openPayment();
    await userEvent.type(within(dialog).getByLabelText("Amount paid"), "300");
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    const receipt = await screen.findByRole("dialog", { name: "Receipt" });
    await userEvent.click(within(receipt).getByRole("button", { name: "Print" }));
    expect(print).toHaveBeenCalledTimes(1);
  });

  async function confirmAndGetReceipt(offline = false) {
    const dialog = await openPayment(offline);
    await userEvent.type(within(dialog).getByLabelText("Amount paid"), "300");
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    return await screen.findByRole("dialog", { name: "Receipt" });
  }

  it("online sync failure: OFF number, Pending sync, one record", async () => {
    failOps.add("syncOrders");
    const receipt = await confirmAndGetReceipt();
    expect(within(receipt).getByText("OFF-001")).toBeInTheDocument();
    expect(within(receipt).getByText("Pending sync")).toBeInTheDocument();
    const recs = await posDb.ordersOutbox.toArray();
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ status: "failed", provisionalNo: "OFF-001" });
  });

  it("synced but getOrder fails: no OFF number, no Pending sync, record untouched", async () => {
    failOps.add("getOrder");
    const receipt = await confirmAndGetReceipt();
    expect(within(receipt).queryByText("Pending sync")).not.toBeInTheDocument();
    expect(within(receipt).queryByText(/^OFF-/)).not.toBeInTheDocument();
    const recs = await posDb.ordersOutbox.toArray();
    expect(recs).toHaveLength(1);
    expect(recs[0]!.status).toBe("synced");
    expect(recs[0]!.provisionalNo).toBeUndefined();
  });

  it("a numbering failure after the save still resolves the checkout with one record", async () => {
    failOps.add("syncOrders");
    vi.spyOn(posDb.meta, "put").mockRejectedValue(new Error("quota"));
    const receipt = await confirmAndGetReceipt();
    expect(within(receipt).getByText("Pending sync")).toBeInTheDocument();
    expect(await posDb.ordersOutbox.count()).toBe(1);
    vi.restoreAllMocks();
  });
});
