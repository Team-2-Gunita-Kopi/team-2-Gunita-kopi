import { afterEach, describe, expect, it, vi } from "vitest";
import { registerOwner } from "@/features/auth/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("registerOwner", () => {
  it("posts the account details and setup code to the site's /auth/setup", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        success: true,
        data: {
          id: "owner-id",
          authUserId: "auth-owner-id",
          email: "owner@example.com",
          fullName: "Owner Name",
          username: "owner",
          role: "owner_admin",
          isActive: true,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await registerOwner({
      fullName: "Owner Name",
      email: "owner@example.com",
      username: "owner",
      password: "password123",
      setupCode: "  setup-secret  ",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/auth/setup");
    expect(new Headers(options.headers).get("X-Setup-Token")).toBe(
      "setup-secret",
    );
    expect(JSON.parse(options.body as string)).toEqual({
      email: "owner@example.com",
      fullName: "Owner Name",
      username: "owner",
      password: "password123",
      confirmPassword: "password123",
    });
  });

  it("submits without a setup code for the local-only setup flow", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        success: true,
        data: {
          id: "owner-id",
          authUserId: "auth-owner-id",
          email: "owner@example.com",
          fullName: "Owner Name",
          username: "owner",
          role: "owner_admin",
          isActive: true,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await registerOwner({
      fullName: "Owner Name",
      email: "owner@example.com",
      username: "owner",
      password: "password123",
    });

    const [, options] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(new Headers(options.headers).get("X-Setup-Token")).toBeNull();
  });
});
