import { afterEach, describe, expect, it, vi } from "vitest";
import { apiAllPages } from "@/owner/lib/api-client";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

afterEach(() => vi.unstubAllGlobals());

const anySchema = { safeParse: (v: unknown) => ({ success: true as const, data: v as { items: number[]; total: number } }) };

describe("apiAllPages", () => {
  // Why: busy days have several pages of orders. Waiting for each page before asking for the next
  // adds a full round trip per page; after page 1 the rest must load together.
  it("loads every page, in order, and requests pages 2+ in parallel", async () => {
    const events: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const n = Number(new URL(url, "http://x").searchParams.get("page"));
        events.push(`start:${n}`);
        await new Promise((r) => setTimeout(r, 20));
        events.push(`end:${n}`);
        const items = Array.from({ length: n < 3 ? 100 : 50 }, (_, i) => (n - 1) * 100 + i);
        return new Response(JSON.stringify({ success: true, data: { items, total: 250 } }));
      }),
    );
    const all = await apiAllPages("/api/orders?status=pending", anySchema);
    expect(all).toHaveLength(250);
    expect(all[0]).toBe(0);
    expect(all[249]).toBe(249);
    expect(events.indexOf("start:3")).toBeLessThan(events.indexOf("end:2"));
  });

  it("makes one request when everything fits on one page", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { items: [1, 2], total: 2 } })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await apiAllPages("/api/suppliers", anySchema)).toEqual([1, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("Admin sign-in guard", () => {
  // Why: the app icon must load on the sign-in page, so it skips the guard; pages must not.
  it("guards pages but not the app icon", async () => {
    for (const path of ["/admin/icon.svg", "/admin/icon-ghawdk.svg"]) {
      const icon = await middleware(new NextRequest(`http://shop.local${path}`));
      expect(icon.headers.get("location")).toBeNull();
    }
    const page = await middleware(new NextRequest("http://shop.local/admin/dashboard"));
    expect(page.headers.get("location")).toBe("http://shop.local/admin/login?redirect=%2Fadmin%2Fdashboard");
  });
});
