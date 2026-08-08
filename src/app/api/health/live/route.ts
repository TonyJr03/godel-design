export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store",
};

export function GET() {
  return Response.json({ status: "ok" }, { headers: noStoreHeaders });
}
