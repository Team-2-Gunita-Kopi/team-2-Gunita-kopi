import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { GET } from "../src/app/api/health/route";
import { GET as ROOT } from "../src/app/route";

describe("GET / (status page)", () => {
  const URL = "https://example-project.supabase.co";
  const KEY = "sb_publishable_test_key_value";
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", KEY);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("shows the running API and a reachable Supabase as HTML, without configuration", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await ROOT();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(fetchMock).toHaveBeenCalledWith(`${URL}/auth/v1/health`, expect.anything());
    expect(html).toContain("Gunita Kopi API");
    expect(html).toContain("Running");
    expect(html).toContain("Reachable");
    expect(html).toContain('href="/api/health"');
    expect(html).not.toContain(URL);
    expect(html).not.toContain(KEY);
  });

  it("reports Supabase as unreachable instead of healthy when the check fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const response = await ROOT();
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Running");
    expect(html).toContain("Unreachable");
    expect(html).not.toContain(">Reachable<");
  });
});

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
