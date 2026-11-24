import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { requestIdFrom } from "@/server/lib/request-id";
import { escapeLike } from "@/server/lib/request";

describe("requestIdFrom", () => {
  // Why: the id is echoed back in a response header; a caller must not inject newlines or huge values.
  it("keeps a short, plain id", () => {
    expect(requestIdFrom("abc-123_X")).toBe("abc-123_X");
  });
  it.each([["x".repeat(65)], ["a\nb"], ['{"level":"error"}'], [null]])("replaces %j", (h) => {
    expect(requestIdFrom(h)).toMatch(/^req_\d+_[a-z0-9]+$/);
  });
});

describe("escapeLike", () => {
  // Why: a search for "50%" must find "50%", not every row.
  it("escapes %, _ and the escape character", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
    expect(escapeLike("Spanish Latte")).toBe("Spanish Latte");
  });
});

