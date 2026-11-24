import React from "react";
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardStats } from "@gunita/contracts";
import { mockRouter } from "@/test/setup";
import { renderWithProviders } from "@/test/render";

vi.mock("@/lib/use-mocks", () => ({ USE_MOCKS: false }));

const reports = vi.hoisted(() => ({ getDashboard: vi.fn() }));
vi.mock("@/features/reports/api", () => reports);

import DashboardPage from "@/app/(app)/dashboard/page";

const dashboard: DashboardStats = {
  date: "2026-11-20",
  todaySales: 1130,
  todayOrdersCount: 4,
  todayCompletedOrders: 3,
  pendingOrders: 1,
  preparingOrders: 0,
  stock: { available: 5, lowStock: 3, outOfStock: 1 },
  stockAlerts: [
    {
      ingredientId: 1,
      ingredientName: "Hazelnut syrup",
      currentStock: 0,
      unit: "mL",
      reorderLevel: 100,
      stockStatus: "out-of-stock",
    },
  ],
  bestSellers: [
    {
      productId: 1,
      productName: "Iced Spanish Latte",
      unitsSold: 2,
      revenue: 320,
      currentUnitCost: null,
    },
  ],
  recentOrders: [
    {
      orderId: 12,
      orderDate: "2026-11-20T14:22:00+08:00",
      orderType: "dine-in",
      status: "preparing",
      itemCount: 1,
      total: 160,
    },
  ],
};

describe("Owner dashboard", () => {
  beforeEach(() => {
    reports.getDashboard.mockReset().mockResolvedValue(dashboard);
    mockRouter.push.mockReset();
  });

  it("shows today's KPIs, product chart, restock action, and recent orders", async () => {
    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText("₱1,130.00")).toBeInTheDocument();
    expect(screen.getByText("Orders Today")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Best selling products" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Low stock alerts")).toBeInTheDocument();
    expect(screen.getByText("Hazelnut syrup")).toBeInTheDocument();
    expect(screen.getByText("012")).toBeInTheDocument();
    expect(screen.getByText("Nov 20, 2:22 PM")).toBeInTheDocument();
    expect(screen.getByText("Cash")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Restock" }));
    expect(mockRouter.push).toHaveBeenCalledWith("/inventory");
  });
});
