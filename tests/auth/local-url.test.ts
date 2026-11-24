import { describe, expect, it } from "vitest";
import { isLoopbackHost, isLoopbackUrl } from "@/auth/local-url";

describe("loopback URL checks", () => {
  it("accepts localhost URLs and rejects remote hosts", () => {
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackUrl("http://localhost:3000")).toBe(true);
    expect(isLoopbackUrl("http://127.0.0.1:3002")).toBe(true);
    expect(isLoopbackUrl("https://example.com")).toBe(false);
    expect(isLoopbackUrl("not a URL")).toBe(false);
  });
});
