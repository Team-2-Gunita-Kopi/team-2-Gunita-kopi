import { describe, it, expect } from "vitest";
import { GET } from "../src/app/api/health/route";

describe("GET /api/health", () => {
  it("returns status ok with 200 HTTP code and shared response structure", async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.status).toBe("ok");
    expect(body.meta?.timestamp).toBeDefined();
  });
});
