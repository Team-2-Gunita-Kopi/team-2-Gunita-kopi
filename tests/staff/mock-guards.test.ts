import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("mock guards", () => {
  it("mockRpc turns a non-JSON response into a friendly error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => { throw new SyntaxError("bad"); } }) as unknown as Response));
    const { mockRpc } = await import("@/staff/lib/mock-db");
    await expect(mockRpc("authenticate")).rejects.toThrow("Demo data service returned an unexpected response.");
  });

  it("signIn and getSession are inert when mocks are off", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "false");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const mock = await import("@/staff/features/auth/mock");
    await expect(mock.signIn("a", "b")).rejects.toThrow("Mock sign-in is disabled.");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mock.getSession()).toBeNull();
  });
});
