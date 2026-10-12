/* Church identity for the Pre-Crusade list (v1.25.0).

   dedupKey = state | townKey(town) | nameKey(name, town)

   The same function runs in the bot import API, the in-app add form's
   duplicate guard and the Zeal migration, so all three agree on what "the
   same church" means. "St. Mary's Church" + "Dover" and "Saint Marys" +
   "dover" are one church; "First Baptist" in Concord and in Dover are two.
   See docs/church-data-plan.md §3.3 for the rules and worked examples. */

const ORDINALS = { "1st":"first","2nd":"second","3rd":"third","4th":"fourth","5th":"fifth",
 "6th":"sixth","7th":"seventh","8th":"eighth","9th":"ninth","10th":"tenth" };
const REWRITE = { st:"saint", ste:"sainte", mt:"mount", ft:"fort", n:"north", s:"south", e:"east", w:"west", ...ORDINALS };
const NAME_TAIL = new Set(["church","inc","incorporated","nh"]);

function tokens(v){
 return (v == null ? "" : v.toString())
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/&/g, " and ")
  .replace(/['\u2018\u2019\u02bc`]/g, "")
  .replace(/[^a-z0-9]+/g, " ")
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .map(t => REWRITE[t] || t);
}

export function townKey(town){
 let t = tokens(town);
 if(t[0] === "town" && t[1] === "of") t = t.slice(2);
 else if(t[0] === "city" && t[1] === "of") t = t.slice(2);
 while(t.length > 1 && (t[t.length - 1] === "nh" || t[t.length - 1] === "village")) t = t.slice(0, -1);
 return t.join("-");
}

export function nameKey(name, town){
 const tk = townKey(town);
 /* A parenthetical that just repeats the town — "St. Paul Lutheran (Amherst)"
    in Amherst — is a label, not part of the name. */
 const raw = (name == null ? "" : name.toString()).replace(/\(([^)]*)\)/g, (m, inner) => (tk && townKey(inner) === tk) ? " " : " " + inner + " ");
 let t = tokens(raw);
 if(t.length > 1 && t[0] === "the") t = t.slice(1);
 while(t.length > 1 && NAME_TAIL.has(t[t.length - 1])) t = t.slice(0, -1);
 return t.join("-");
}

export function dedupKey(name, town, state){
 const st = tokens(state || "NH").join("") || "nh";
 return st + "|" + townKey(town) + "|" + nameKey(name, town);
}

/* Second-level matching: same phone number or same website domain. */
export function phoneDigits(p){
 let d = (p == null ? "" : p.toString()).replace(/\D/g, "");
 if(d.length === 11 && d[0] === "1") d = d.slice(1);
 return d.length >= 10 ? d : "";
}
export function siteDomain(u){
 const m = /^(?:[a-z][a-z0-9+.-]*:\/\/)?([^/?#:\s]+)/i.exec((u == null ? "" : u.toString()).trim());
 if(!m) return "";
 const host = m[1].toLowerCase().replace(/^www\./, "");
 return host.indexOf(".") > 0 ? host : "";
}

/* A stable, id-safe record id for a new church: "<name>-<town>". */
export function slugId(name, town){
 const base = (nameKey(name, town) + "-" + townKey(town)).replace(/[^a-zA-Z0-9_-]/g, "");
 return base.slice(0, 40).replace(/-+$/, "") || "church";
}
