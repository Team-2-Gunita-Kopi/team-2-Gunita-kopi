import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SidebarNav } from "@/ui/SidebarNav";

describe("SidebarNav hrefFor", () => {
  // Why: the POS lives under /staff. A middle-click or a copied menu link must open the POS page,
  // not the Owner page with the same path. Active state still uses the plain path.
  it("builds hrefs with hrefFor and keeps active matching on the plain path", () => {
    render(
      <SidebarNav
        items={[{ label: "Orders", href: "/orders" } as never]}
        currentPath="/orders"
        hrefFor={(h) => `/staff${h}`}
        collapsed={false}
        onToggle={() => {}}
      />,
    );
    const link = screen.getByRole("link", { name: /orders/i });
    expect(link.getAttribute("href")).toBe("/staff/orders");
    expect(link.getAttribute("aria-current")).toBe("page");
  });
});
