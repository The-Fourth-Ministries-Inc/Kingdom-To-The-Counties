/* Hourly Planning Center refresh of the live event's worship sets (v1.23.0).
   Skips quietly when Planning Center isn't connected (no PCO_APP_ID /
   PCO_SECRET), and never overwrites an event a leader has edited by hand.
   Netlify runs scheduled functions on the production deploy only. */
import { pcoScheduledSync } from "./data.mjs";

export default async () => {
  try {
    const r = await pcoScheduledSync();
    console.log("pco-sync:", JSON.stringify({ ok: !!(r && r.ok), skipped: r && r.skipped || false, songs: r && r.songs || 0 }));
  } catch (e) {
    console.log("pco-sync failed:", (e && e.status) || (e && e.message) || "error");
  }
  return new Response("ok");
};

export const config = { schedule: "@hourly" };
