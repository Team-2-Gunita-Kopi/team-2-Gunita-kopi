import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ apiAllPages: vi.fn(), apiData: vi.fn() }));
vi.mock("@/owner/lib/api-client", () => api);

import { getOrder, listOrders } from "@/owner/features/orders/api";

describe("listOrders", () => {
  beforeEach(() => {
    api.apiAllPages.mockReset().mockResolvedValue([]);
    api.apiData.mockReset().mockResolvedValue(null);
  });

  it("uses server-side status and Manila-date filters", async () => {
    await listOrders({ status: "preparing", date: "2026-11-03" });

    expect(api.apiAllPages).toHaveBeenCalledWith(
      "/api/orders?status=preparing&from=2026-11-03&to=2026-11-03",
      expect.anything(),
    );
  });

  it("loads an order by its queue number", async () => {
    await getOrder(12);

    expect(api.apiData).toHaveBeenCalledWith(
      "/api/orders/12",
      expect.anything(),
    );
  });
});
