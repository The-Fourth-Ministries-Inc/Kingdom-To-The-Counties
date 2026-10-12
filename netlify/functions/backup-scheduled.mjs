/* Nightly copy of the church roster and every Tech I/O blob (v1.25.0).
   Writes bak-day-<YYYY-MM-DD>-churches and bak-day-<YYYY-MM-DD>-io in the
   same Blobs store; 60 days of each are kept. Leaders restore the church
   list from Pre-Crusade → Backups, and a lineup from Tech I/O → Restore.
   Netlify runs scheduled functions on the production deploy only. */
import { nightlyBackup } from "./data.mjs";

export default async () => {
  try {
    const r = await nightlyBackup();
    console.log("nightly backup:", JSON.stringify(r));
  } catch (e) {
    console.log("nightly backup failed:", (e && e.message) || "error");
  }
  return new Response("ok");
};

export const config = { schedule: "@daily" };
