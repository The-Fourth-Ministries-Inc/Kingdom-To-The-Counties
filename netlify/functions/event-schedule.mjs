/* Event-day times live separately from the board, so older app copies and
   end-of-day reset cannot erase a leader's schedule. */
export function normalizeSegments(value){
 if(!Array.isArray(value) || !value.length || value.length > 60) return null;
 const segments = [];
 for(const row of value){
  if(!row || !Number.isInteger(row.s) || !Number.isInteger(row.e) ||
     row.s < 0 || row.e > 1439 || row.s >= row.e ||
     (segments.length && row.s < segments[segments.length - 1].e) ||
     !["setup", "program"].includes(row.group) ||
     !["setup", "soft", "acoustic", "fullband"].includes(row.music) ||
     typeof row.name !== "string" || !row.name.trim()) return null;
  segments.push({
   s: row.s, e: row.e, name: row.name.trim().slice(0, 80),
   group: row.group, music: row.music, altar: row.altar === true,
   meta: typeof row.meta === "string" ? row.meta.slice(0, 200) : ""
  });
 }
 return segments;
}

export function normalizeEventSchedule(value){
 value = value || {};
 return {
  rev: Number.isSafeInteger(value.rev) && value.rev >= 0 ? value.rev : 0,
  saveId: typeof value.saveId === "string" ? value.saveId.slice(0, 60) : "",
  savedBy: typeof value.savedBy === "string" ? value.savedBy.slice(0, 40) : "",
  savedAt: typeof value.savedAt === "string" ? value.savedAt.slice(0, 40) : "",
  segments: normalizeSegments(value.segments)
 };
}
