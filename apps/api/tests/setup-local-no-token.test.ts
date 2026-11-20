import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canUseLocalOwnerSetupWithoutToken } from "../src/modules/setup/local-no-token";

const SECRET = "local-proxy-secret-value-long-enough";
const ENV_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "INTERNAL_PROXY_SECRET"] as const;
const saved = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof ENV_KEYS)[number], string | undefined>;

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.INTERNAL_PROXY_SECRET = SECRET;
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("local Owner setup without a setup token", () => {
  it("requires a trusted local proxy and local Supabase", () => {
    const req = new Request("http://localhost:3002/api/setup/owner", {
      headers: { "x-gunita-proxy-secret": SECRET },
    });
    expect(canUseLocalOwnerSetupWithoutToken(req)).toBe(true);

    expect(
      canUseLocalOwnerSetupWithoutToken(
        new Request("http://localhost:3002/api/setup/owner"),
      ),
    ).toBe(false);
    expect(
      canUseLocalOwnerSetupWithoutToken(
        new Request("http://192.168.1.20:3002/api/setup/owner", {
          headers: { "x-gunita-proxy-secret": SECRET },
        }),
      ),
    ).toBe(false);
  });

  it("is disabled outside local development or when a setup token is supplied", () => {
    const req = new Request("http://localhost:3002/api/setup/owner", {
      headers: { "x-gunita-proxy-secret": SECRET },
    });

    vi.stubEnv("NODE_ENV", "production");
    expect(canUseLocalOwnerSetupWithoutToken(req)).toBe(false);
    vi.stubEnv("NODE_ENV", "development");
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    expect(canUseLocalOwnerSetupWithoutToken(req)).toBe(false);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    const withSetupToken = new Request(
      "http://localhost:3002/api/setup/owner",
      {
        headers: {
          "x-gunita-proxy-secret": SECRET,
          "x-setup-token": "provided",
        },
      },
    );
    expect(canUseLocalOwnerSetupWithoutToken(withSetupToken)).toBe(false);
  });
});
