import { expect, test } from "@playwright/test";

import { loginAs } from "./helpers/auth";
import {
  createQaSupabaseClient,
  signOutQaSupabaseClient,
} from "./helpers/supabase";

const FROZEN_ORDER_NUMBER = "P-26-0344";
const FROZEN_PDF_LENGTH = 131_075;

test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);
test.use({
  trace: "off",
  video: "off",
  screenshot: "off",
});

test(
  "self-hosted frozen production baseline remains readable",
  async ({ page }) => {
    test.skip(
      process.env.PLAYWRIGHT_EXTERNAL_SERVER !== "1",
      "This read-only frozen baseline probe requires the external self-hosted runtime.",
    );

    const supabase = await createQaSupabaseClient("admin");
    try {
      const { data: orders, error: orderError } = await supabase
        .from("pedidos")
        .select("id, order_number, status")
        .eq("order_number", FROZEN_ORDER_NUMBER);
      if (orderError || orders?.length !== 1) {
        throw new Error("frozen order missing");
      }

      const order = orders[0];
      expect(order.order_number).toBe(FROZEN_ORDER_NUMBER);
      expect(order.status).toBe("en_revision");

      const { data: files, error: fileError } = await supabase
        .from("archivos")
        .select("id, pedido_id, file_name")
        .eq("pedido_id", order.id);
      if (fileError) throw new Error("frozen file discovery failed");

      const candidates = (files ?? []).filter((file) => /\.pdf$/i.test(file.file_name));
      if (candidates.length === 0) throw new Error("no PDF candidates");

      await loginAs(page, "admin");
      let matched = false;
      for (const file of candidates) {
        try {
          const route = `/dashboard/pedidos/${order.id}/archivos/${file.id}/download`;
          const firstHop = await page.context().request.get(route, { maxRedirects: 0 });
          if (firstHop.status() < 300 || firstHop.status() >= 400) continue;

          const location = firstHop.headers().location;
          if (!location) continue;
          const signedLocation = new URL(location, new URL(page.url()).origin);
          const browserOrigin = new URL(page.url()).origin;
          if (
            !signedLocation.pathname.startsWith("/storage/v1/") ||
            signedLocation.origin !== browserOrigin ||
            signedLocation.hostname === "api-gw" ||
            signedLocation.port === "8000"
          ) {
            continue;
          }

          const response = await page.context().request.get(signedLocation.toString());
          const body = await response.body();
          if (
            response.ok() &&
            body.byteLength === FROZEN_PDF_LENGTH &&
            body.subarray(0, 4).toString() === "%PDF"
          ) {
            matched = true;
            break;
          }
        } catch {
          continue;
        }
      }

      expect(matched, "no frozen PDF integrity match").toBe(true);
    } finally {
      await signOutQaSupabaseClient(supabase);
    }
  },
);
