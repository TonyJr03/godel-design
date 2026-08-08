import {
  getSupabasePublishableKey,
  getSupabaseServerUrl,
} from "@/lib/supabase/server-config";

export const dynamic = "force-dynamic";

const dependencyPath = "/auth/v1/health";
const readinessTimeoutMs = 2000;
const noStoreHeaders = {
  "Cache-Control": "no-store",
};

function readyResponse() {
  return Response.json({ status: "ready" }, { headers: noStoreHeaders });
}

function notReadyResponse() {
  return Response.json(
    { status: "not_ready" },
    { status: 503, headers: noStoreHeaders },
  );
}

export async function GET() {
  try {
    const dependencyUrl = new URL(dependencyPath, getSupabaseServerUrl());
    getSupabasePublishableKey();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), readinessTimeoutMs);

    try {
      const response = await fetch(dependencyUrl, {
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        return notReadyResponse();
      }
    } finally {
      clearTimeout(timeout);
    }

    return readyResponse();
  } catch {
    return notReadyResponse();
  }
}
