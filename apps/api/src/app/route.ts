// Human-readable status page at the API root. /api/health stays the JSON check for tools.
// Answering at all proves the process is running; Supabase is checked separately so a down
// database never shows as healthy. Shows no URLs, keys or other configuration.

export const dynamic = "force-dynamic";

type Dependency = { ok: boolean; label: string };

async function supabaseStatus(): Promise<Dependency> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { ok: false, label: "Not configured" };
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    return res.ok
      ? { ok: true, label: "Reachable" }
      : { ok: false, label: `Unavailable (HTTP ${res.status})` };
  } catch {
    return { ok: false, label: "Unreachable" };
  }
}

const row = (name: string, ok: boolean, label: string) =>
  `<li><span class="dot ${ok ? "ok" : "bad"}"></span><span class="name">${name}</span><span class="val">${label}</span></li>`;

export async function GET() {
  const supabase = await supabaseStatus();
  const checkedAt = new Date().toISOString();
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gunita Kopi API</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f1410;color:#ede6d6;font:16px/1.5 system-ui,sans-serif}
main{width:min(420px,calc(100% - 32px));background:#1b251c;border:1px solid #34433a;border-radius:14px;padding:24px}
h1{margin:0 0 4px;font-size:1.4rem}p{margin:0 0 16px;color:#a9b3a3}
ul{list-style:none;margin:0 0 16px;padding:0}li{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid #2a362b}
.dot{width:12px;height:12px;border-radius:50%;flex:none}.ok{background:#7fae68}.bad{background:#e0715a}
.name{flex:1}.val{color:#a9b3a3}a{color:#a7c98b}small{display:block;margin-top:12px;color:#a9b3a3}
</style></head><body><main>
<h1>Gunita Kopi API</h1>
<p>The API server is running and reachable.</p>
<ul>
${row("API server", true, "Running")}
${row("Supabase", supabase.ok, supabase.label)}
</ul>
<a href="/api/health">Detailed JSON health check (/api/health)</a>
<small>Last checked: <time datetime="${checkedAt}">${checkedAt}</time></small>
</main></body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
