import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadCsv, toCsv } from "@/owner/features/reports/api";

describe("report CSV export (FR-35)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("uses the table headers, keeps column order and quotes commas", () => {
    const csv = toCsv(
      [{ date: "2026-11-21", orders: 3, sales: "₱1,250.00", extra: "dropped" }],
      [
        { key: "date", header: "Date" },
        { key: "orders", header: "Orders" },
        { key: "sales", header: "Sales" },
      ],
    );
    expect(csv).toBe('Date,Orders,Sales\r\n2026-11-21,3,"₱1,250.00"');
  });

  it("returns an empty string for no rows", () => {
    expect(toCsv([])).toBe("");
  });

  it("downloads a UTF-8 file with a BOM through an attached link", async () => {
    vi.useFakeTimers();
    let blob: Blob | undefined;
    const create = vi.fn((b: Blob) => ((blob = b), "blob:report"));
    const revoke = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
    const attachedWhenClicked: boolean[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      attachedWhenClicked.push(document.body.contains(this));
    });

    downloadCsv("gunita-kopi-daily-2026-11-21.csv", "Date\r\n2026-11-21");

    const clicked = click.mock.contexts[0] as HTMLAnchorElement;
    expect(attachedWhenClicked).toEqual([true]);
    expect(clicked.download).toBe("gunita-kopi-daily-2026-11-21.csv");
    expect(document.body.contains(clicked)).toBe(false);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revoke).toHaveBeenCalledWith("blob:report");

    vi.useRealTimers();
    const buffer = await new Promise<ArrayBuffer>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(blob!);
    });
    expect([...new Uint8Array(buffer).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });
});
