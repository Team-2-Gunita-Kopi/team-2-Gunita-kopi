import { describe, expect, it } from "vitest";
import {
  ORDER_STATUS_LABEL,
  ORDER_TYPE_LABEL,
  canCancel,
  nextQueueNo,
  nextStatus,
  provisionalQueueNo,
} from "../src";

describe("order flow", () => {
  it("advances status", () => {
    expect(nextStatus("pending")).toBe("preparing");
    expect(nextStatus("preparing")).toBe("completed");
    expect(nextStatus("completed")).toBeNull();
    expect(nextStatus("cancelled")).toBeNull();
  });
  it("guards cancel", () => {
    expect(canCancel("completed")).toBe(false);
    expect(canCancel("cancelled")).toBe(false);
    expect(canCancel("preparing")).toBe(true);
    expect(canCancel("pending")).toBe(true);
  });
  it("has labels", () => {
    expect(ORDER_TYPE_LABEL["take-out"]).toBe("Take-out");
    expect(ORDER_TYPE_LABEL["pre-order"]).toBe("Pre-order");
    expect(ORDER_STATUS_LABEL.pending).toBeTruthy();
  });
});

describe("queue numbers", () => {
  const now = new Date(2026, 10, 16, 9);
  it("starts at 1", () => {
    expect(nextQueueNo(null, now).queueNo).toBe("20261116-A-001");
  });
  it("increments same day", () => {
    expect(nextQueueNo({ day: "20261116", seq: 41 }, now)).toEqual({
      queueNo: "20261116-A-042",
      day: "20261116",
      seq: 42,
    });
  });
  it("resets on new day", () => {
    expect(nextQueueNo({ day: "20261115", seq: 41 }, now).seq).toBe(1);
  });
  it("provisional", () => {
    expect(provisionalQueueNo(1)).toBe("OFF-001");
  });
});
