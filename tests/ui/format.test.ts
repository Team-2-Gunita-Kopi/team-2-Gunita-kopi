import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatPeso,
  formatTime,
  toDayKey,
} from "@/ui/format";

describe("formatPeso", () => {
  it("formats with peso sign, grouping and 2 decimals", () => {
    expect(formatPeso(1234.5)).toBe("₱1,234.50");
    expect(formatPeso(0)).toBe("₱0.00");
    expect(formatPeso(1234567.891)).toBe("₱1,234,567.89");
  });
});

describe("date helpers", () => {
  const iso = new Date(2026, 10, 3, 14, 22).toISOString();

  it("formats date-time", () => {
    expect(formatDateTime(iso)).toBe("Nov 3, 2026 2:22 PM");
  });
  it("formats date and time separately", () => {
    expect(formatDate(iso)).toBe("Nov 3, 2026");
    expect(formatTime(iso)).toBe("2:22 PM");
  });
  it("formats midnight as 12:00 AM", () => {
    expect(formatTime(new Date(2026, 10, 3, 0, 0).toISOString())).toBe("12:00 AM");
  });
  it("builds a local YYYY-MM-DD day key", () => {
    expect(toDayKey(new Date(2026, 0, 5, 23, 59).toISOString())).toBe("2026-01-05");
    expect(toDayKey(new Date(2026, 0, 5, 0, 1).toISOString())).toBe("2026-01-05");
  });
});
