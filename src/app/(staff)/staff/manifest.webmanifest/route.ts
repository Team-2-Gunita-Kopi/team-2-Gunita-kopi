import manifest from "@/staff/manifest";

// The POS install manifest, served under /staff so the installed app stays inside the POS area.
export function GET() {
  return Response.json(manifest(), { headers: { "content-type": "application/manifest+json" } });
}
