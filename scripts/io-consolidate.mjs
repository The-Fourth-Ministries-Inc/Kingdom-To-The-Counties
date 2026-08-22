/**
 * Consolidate a K2C "INP-OUT Map" sheet into the app's Tech I/O model.
 *
 * The spreadsheet lays four tables out in a 2x2 grid, split by an empty gutter
 * column. Part 1 is the same input list written twice — once as the FOH board
 * sees it, once as the dedicated 32SC monitor console sees it. Part 2 is the
 * output side: the NSB 32.16 stage box (PA and hardwired IEM) on the left, the
 * Ark 32R IEM transmitters on the right.
 *
 * Channel numbers are per-console and disagree constantly, so they are NOT the
 * key here. The AVB stream number is the one identifier both consoles name for
 * the same signal, so the two halves are merged on AVB and every merged row
 * carries both channel numbers. Rows the sheet contradicts itself on are left
 * exactly as written — the app flags them at render time rather than this
 * importer silently picking a winner.
 */

const PACK_COLORS = {
  orange: "#ED8B0B",
  red: "#E23B2E",
  green: "#79C24A",
  brown: "#9E6B33",
  yellow: "#F2CB05",
  grey: "#9AA0A6",
  gray: "#9AA0A6",
  purple: "#7B3FF2",
  blue: "#2E7CD6",
};

/* Sources that are gear or a house position, not a person with an IEM pack. */
const HOUSE_SOURCES = new Set(["host 1", "host 2", "foh tb"]);
const PLAYBACK_SOURCES = new Set(["playback", "laptop"]);

/* The output table labels a mix by where it sits on stage ("Keyboard
   Platform"), which is close enough to an instrument to use as the card's
   subtitle once it's spelled the way the input list spells it. Vocal labels
   map to nothing — the input rows already say "Lead Vox". */
const INST_LABELS = {
  "acoustic 1": "Acoustic Guitar 1",
  "acoustic 2": "Acoustic Guitar 2",
  "keyboard platform": "Keys",
  "drums platform": "Drums",
  bass: "Bass Guitar",
  "lead vox": "",
  "add'l vox": "",
};

export function txt(v) {
  if (v == null) return "";
  return String(v).replace(/\s+/g, " ").trim();
}
function key(v) {
  return txt(v).toLowerCase();
}
function slug(v) {
  return (
    key(v)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "row"
  );
}
function header(v) {
  return key(v)
    .replace(/[^\w\s/+]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function blank(row) {
  return !row || row.every((c) => !txt(c));
}

/** "AVB 41" -> 41. Anything without a number -> 0. */
export function avbNum(v) {
  const m = txt(v).match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

/** The sheet writes channels as "1", "13/14 (stereo)", "Aux In 1 (Stereo)". */
function channelLabel(v) {
  return txt(v).replace(/\s*\(stereo\)\s*/i, "").trim();
}

/**
 * Find a header row by the columns it declares, and return the column indexes.
 * `specs` maps a field name to a pattern; `within` bounds the search to one
 * half of the sheet so the FOH and 32SC headers (which share a row) don't
 * collide.
 */
function findHeader(rows, specs, within) {
  const [lo, hi] = within;
  for (let r = 0; r < rows.length; r++) {
    const norm = rows[r].map(header);
    const col = {};
    for (const [name, re] of Object.entries(specs)) {
      for (let c = lo; c <= hi && c < norm.length; c++) {
        if (re.test(norm[c])) {
          col[name] = c;
          break;
        }
      }
    }
    const found = Object.keys(col).length;
    if (found >= Object.keys(specs).length - 1 && col.role != null) {
      return { row: r, col };
    }
  }
  return null;
}

/**
 * Walk an input table downward from its header, filling the merged
 * Source/Musician cells down as the spreadsheet renders them. Stops at the
 * Part 2 banner.
 */
function readInputHalf(rows, section, side) {
  const { col } = section;
  const out = [];

  for (let r = section.row + 1; r < rows.length; r++) {
    const row = rows[r];
    const chan = txt(row[col.channel]);
    if (/^part 2:/i.test(chan)) break;
    if (blank(row)) continue;

    const source = txt(row[col.source]);
    const role = txt(row[col.role]);
    const avbCell = txt(row[col.avb]);
    const port = col.port != null ? txt(row[col.port]) : "";
    /* The FOH half carries a dedicated Snake Map column (multicore channel
       numbers on the stage loom). It sits beside the gutter and used to be
       skipped entirely — the table's Snake column then only ever filled for
       NSB ports parsed out of the free-text patch cell. */
    const snake = col.snake != null ? txt(row[col.snake]) : "";
    const gear = col.gear != null ? txt(row[col.gear]) : "";
    const note = col.note != null ? txt(row[col.note]) : "";
    const p48 = col.p48 != null ? /^(y|yes|true|x|48)/i.test(txt(row[col.p48])) : false;
    /* Aux/Tape returns are console inputs, not stage patch points. */
    const aux = /^(aux in|tape in)/i.test(chan);

    /* Spacer rows carry nothing. An aux or tape return is kept even when it is
       entirely blank — "the board has a Tape In and nothing is assigned to it"
       is a fact a tech looking for a spare stereo input wants to see. */
    if (!role && !gear && !aux) continue;

    out.push({
      side,
      chan: channelLabel(chan),
      /* The sheet marks stereo pairs and returns as "13/14 (stereo)"; keep the
         marker, it is the only place the pairing is written down. */
      chanLabel: chan,
      aux,
      source,
      role,
      avb: avbNum(avbCell),
      avbLabel: avbCell,
      port,
      snake,
      gear,
      p48,
      note,
      sheetRow: r + 1,
    });
  }
  return out;
}

/**
 * One merged input row per distinct signal.
 *
 * Keyed on AVB where the sheet gives one. Two different signals that share an
 * AVB number (the sheet does this — see the Tom 1 / spare collision) are NOT
 * folded together: the key includes the role so both survive and the app can
 * show them side by side as the clash they are.
 */
export function mergeInputs(fohRows, scRows) {
  const merged = new Map();

  function slot(row) {
    const k = row.avb ? `avb${row.avb}|${key(row.role)}` : `x|${key(row.source)}|${key(row.role)}`;
    if (!merged.has(k)) {
      merged.set(k, {
        avb: row.avb,
        avbLabel: row.avbLabel,
        source: row.source,
        role: row.role,
        p48: row.p48,
        aux: row.aux,
        stereo: false,
        snake: "",
        foh: "",
        sc: "",
        /* Kept per console: where the two halves disagree, both readings are
           real and the app shows them side by side rather than picking one. */
        fohPort: "", scPort: "",
        fohGear: "", scGear: "",
        fohNote: "", scNote: "",
      });
    }
    return merged.get(k);
  }

  function take(row, side) {
    const s = slot(row);
    s[side] = row.chan;
    s[side + "Port"] = row.port;
    s[side + "Gear"] = row.gear;
    s[side + "Note"] = row.note;
    /* Snake Map lives on the FOH half only. */
    if (row.snake && !s.snake) s.snake = row.snake;
    if (row.p48) s.p48 = true;
    if (/\(stereo\)/i.test(row.chanLabel || "")) s.stereo = true;
    /* The monitor console names the source on rows FOH leaves blank (the raw
       vocal splits), so let either half supply one the other never had. */
    if ((!s.source || /^n\/a$/i.test(s.source)) && row.source) s.source = row.source;
    if (!s.role) s.role = row.role;
    return s;
  }

  for (const row of fohRows) take(row, "foh");
  for (const row of scRows) take(row, "sc");

  /* Collapse the per-console readings to a primary plus an alternate. FOH's is
     the primary where both exist — it is the patch a stagehand actually plugs
     — and the 32SC's rides alongside whenever it says something different. */
  for (const s of merged.values()) {
    s.port = s.fohPort || s.scPort;
    s.altPort = s.fohPort && s.scPort && s.fohPort !== s.scPort ? s.scPort : "";
    s.gear = s.fohGear || s.scGear;
    s.altGear = s.fohGear && s.scGear && s.fohGear !== s.scGear ? s.scGear : "";
    s.note = s.fohNote || s.scNote;
    s.altNote = s.fohNote && s.scNote && s.fohNote !== s.scNote ? s.scNote : "";
    for (const k of ["fohPort","scPort","fohGear","scGear","fohNote","scNote"]) delete s[k];
  }

  return [...merged.values()].sort((a, b) => {
    if (a.aux !== b.aux) return a.aux ? 1 : -1;
    if (a.avb !== b.avb) return (a.avb || 9999) - (b.avb || 9999);
    return 0;
  });
}

function parsePack(raw) {
  const s = txt(raw);
  if (!s) return { pack: "", color: "#c7c2b8", spare: false };
  const spare = /spare|extra/i.test(s);
  const num = s.match(/pack\s*(\d+)/i);
  let color = "#c7c2b8";
  for (const [name, hex] of Object.entries(PACK_COLORS)) {
    if (key(s).includes(name)) {
      color = hex;
      break;
    }
  }
  return { pack: s, packNo: num ? num[1] : "", color, spare };
}

/** "IEM Transmitter 9 (L)" -> {unit:"9", leg:"L"} */
export function parseTransmitter(raw) {
  const s = txt(raw);
  const unit = s.match(/(\d+)/);
  const leg = s.match(/\(\s*([LR])\s*\)/i);
  return { unit: unit ? unit[1] : "", leg: leg ? leg[1].toUpperCase() : "" };
}

/** "Aux 1 & 2" -> "1 & 2"; "Aux 9" -> "9". */
export function auxLabel(raw) {
  const s = txt(raw);
  const pair = s.match(/(\d+)\s*(?:&|and|\/|–|-)\s*(\d+)/i);
  if (pair) return `${pair[1]} & ${pair[2]}`;
  const one = s.match(/(\d+)/);
  return one ? one[1] : "";
}

/** How many console outputs a mix consumes — 2 for a stereo pair, else 1. */
function auxWidth(label) {
  return /&/.test(label) ? 2 : 1;
}

/**
 * The IEM output table. Rows that name a transmitter open a new mix; rows that
 * only name a pack are extra receivers riding the mix above them.
 */
function readIemMixes(rows, section) {
  const { col } = section;
  const mixes = [];
  let gap = 0;

  for (let r = section.row + 1; r < rows.length; r++) {
    const row = rows[r];
    if (blank(row)) {
      if (++gap >= 2 && mixes.length) break;
      continue;
    }
    gap = 0;

    const mixCell = txt(row[col.mix]);
    const outCell = col.out != null ? txt(row[col.out]) : "";
    const txCell = col.tx != null ? txt(row[col.tx]) : "";
    const packCell = col.pack != null ? txt(row[col.pack]) : "";
    const who = col.assignee != null ? txt(row[col.assignee]) : "";
    const dest = col.dest != null ? txt(row[col.dest]) : "";

    if (!mixCell && !packCell && !who) continue;

    if (mixCell || txCell) {
      const { unit, leg } = parseTransmitter(txCell);
      const aux = auxLabel(mixCell);
      mixes.push({
        aux,
        out: auxLabel(outCell),
        outLabel: outCell,
        txUnit: unit,
        txLabel: txCell,
        leg,
        /* A transmitter carrying a single aux is running one mono mix per leg;
           a transmitter fed by an aux pair is a normal stereo mix. */
        mode: auxWidth(aux) === 2 ? "stereo" : "mono",
        ...parsePack(packCell),
        name: who,
        dest,
        share: [],
        sheetRow: r + 1,
      });
    } else if (mixes.length) {
      const p = parsePack(packCell);
      mixes[mixes.length - 1].share.push({
        pack: p.pack,
        color: p.color,
        name: who,
        dest,
      });
    }
  }
  return mixes;
}

/** The NSB 32.16 / PA side of Part 2 — buses with no musician attached. */
function readBuses(rows, section) {
  const { col } = section;
  const buses = [];
  let gap = 0;

  for (let r = section.row + 1; r < rows.length; r++) {
    const row = rows[r];
    if (blank(row)) {
      if (++gap >= 2 && buses.length) break;
      continue;
    }
    gap = 0;

    const bus = txt(row[col.bus]);
    if (!bus) continue;
    const sig = col.sig != null ? txt(row[col.sig]) : "";
    const dest = col.dest != null ? txt(row[col.dest]) : "";
    const hw = col.hw != null ? txt(row[col.hw]) : "";
    const purpose = col.purpose != null ? txt(row[col.purpose]) : "";
    /* A named bus with nothing against it is still a bus that exists. (Aux 16
       is written this way — it shares one merged "Spares" block with Aux 15.) */

    buses.push({
      id: slug(`bus-${bus}`),
      bus,
      sig,
      dest,
      hw,
      purpose,
      /* "Aux 7 - Unused" is the sheet's own way of parking a bus. */
      off: /unused/i.test(bus) || /unused/i.test(sig),
    });
  }
  return buses;
}

function displayName(name) {
  return txt(name)
    .replace(/\s+(TB|AG)$/i, "")
    .trim();
}

/** Every way a source cell might name the same person. */
function aliases(name) {
  const base = displayName(name);
  const set = new Set([key(name), key(base)]);
  return [...set].filter(Boolean);
}

function groupKindFor(source) {
  const k = key(source);
  if (HOUSE_SOURCES.has(k)) return "house";
  if (PLAYBACK_SOURCES.has(k)) return "playback";
  if (/^spare$/i.test(k)) return "spare";
  if (/^n\/a$/i.test(k) || !k) return "spare";
  return "";
}

/**
 * Fold the merged input rows and the IEM mixes into the app's performer cards.
 * Cards are ordered by the aux they listen on, so the app's list reads down the
 * console the same way the output table does.
 */
export function buildCards(inputs, mixes) {
  const cards = [];
  const byAlias = new Map();
  const used = new Set();

  function uid(base) {
    let id = slug(base);
    let n = 2;
    while (used.has(id)) id = `${slug(base)}-${n++}`;
    used.add(id);
    return id;
  }

  function card(seed) {
    const c = {
      id: seed.id,
      name: seed.name,
      inst: seed.inst || "",
      pack: seed.pack || "",
      color: seed.color || "#c7c2b8",
      qmix: seed.aux || "",
      tx: seed.txLabel || "",
      aux: seed.aux || "",
      out: seed.out || "",
      txUnit: seed.txUnit || "",
      leg: seed.leg || "",
      mode: seed.mode || "none",
      dest: seed.dest || "",
      share: seed.share || [],
      rows: [],
    };
    if (seed.off) c.off = true;
    cards.push(c);
    return c;
  }

  /* Mix-holders first, in aux order — these are the people with IEM packs. */
  for (const m of mixes) {
    const named = !!m.name && !/^spare$/i.test(m.name);
    const label = named ? displayName(m.name) : "";
    const id = uid(m.pack ? m.pack : `mix-aux-${m.aux || m.txUnit}`);
    const c = card({
      id,
      name: label || "— open —",
      inst: INST_LABELS[key(m.dest)] !== undefined ? INST_LABELS[key(m.dest)] : txt(m.dest),
      pack: m.pack,
      color: m.color,
      aux: m.aux,
      out: m.out,
      txUnit: m.txUnit,
      txLabel: m.txLabel,
      leg: m.leg,
      mode: m.mode,
      dest: m.dest,
      share: m.share.map((s) => ({ pack: s.pack, name: s.name, dest: s.dest })),
    });
    if (named) for (const a of aliases(m.name)) if (!byAlias.has(a)) byAlias.set(a, c);
  }

  const extras = new Map();
  /* Buckets, not people: house mics, playback returns and the parked spare
     channels. Tagged so the outputs table never offers them an IEM mix. */
  function extraCard(kind, name, color) {
    if (!extras.has(kind)) {
      const c = card({ id: uid(kind), name, color, mode: "none", off: kind === "unused" });
      c.kind = "group";
      extras.set(kind, c);
    }
    return extras.get(kind);
  }

  for (const inp of inputs) {
    let target = null;
    for (const a of aliases(inp.source)) {
      if (byAlias.has(a)) {
        target = byAlias.get(a);
        break;
      }
    }
    if (!target) {
      const kind = groupKindFor(inp.source);
      if (kind === "house") target = extraCard("house", "House / Host", "#5c574f");
      else if (kind === "playback") target = extraCard("playback", "Playback", "#5c574f");
      else if (/unused channel/i.test(inp.role))
        target = extraCard("unused", "Unused channels", "#c7c2b8");
      else if (kind === "spare") target = extraCard("spare", "Spare / open inputs", "#c7c2b8");
      else target = card({ id: uid(inp.source), name: displayName(inp.source), mode: "none" });

      if (!byAlias.has(key(inp.source)) && kind === "") {
        for (const a of aliases(inp.source)) byAlias.set(a, target);
      }
    }

    /* Entry point from the free-text port cell (NSB / Ark / direct), plus the
       dedicated Snake Map number when the sheet wrote one. The map wins for
       the Snake column; NSB port numbers only fill it when the map is blank. */
    const entry = parseEntry(inp.port);
    const snakeMap = txt(inp.snake);
    const snake = snakeMap || entry.snake;
    const rowInp = Object.assign({}, inp, { snake: snake });
    target.rows.push({
      id: uid(`${target.name}-${inp.role}-${inp.gear || inp.avb}`),
      role: inp.role,
      gear: inp.gear,
      loc: locLabel(rowInp),
      avb: inp.avb || "",
      snake: snake,
      split: entry.split,
      /* 32R channel is inferred from the Ark splitter in the field and is not
         shown in the Inputs table — kept empty so a leader can still store one
         if they ever need it. */
      r32: "",
      path: entry.path,
      foh: inp.foh || "",
      sc: inp.sc || "",
      port: inp.port || "",
      altPort: inp.altPort || "",
      /* The sheet's own Source cell, verbatim — "Zach TB" and "Zach AG" are
         how the tech tells his talkback from his acoustic, and grouped cards
         (House, Playback, spares) cover several sources under one name. */
      src: inp.source || "",
      note: inp.note || "",
      altGear: inp.altGear || "",
      altNote: inp.altNote || "",
      stereo: inp.stereo || false,
      p48: inp.p48 || false,
    });
  }

  /* Cards that hold neither a mix nor an input are noise from a merged cell. */
  return cards.filter((c) => c.rows.length || c.pack || c.mode !== "none");
}

/**
 * Where a signal physically enters the system.
 *
 * There are three ways in and a row uses exactly one of them:
 *   - the on-stage snake (a PreSonus NSB 32.16 stage box port),
 *   - the Ark XLR splitter, which feeds the 32R,
 *   - or straight onto the AVB network from a computer (tracks, click, guide).
 *
 * The sheet writes all three into one free-text "physical input" column, so
 * they are split into their own numbers here and the original text is kept for
 * anything that doesn't match a known form.
 */
export function parseEntry(port) {
  const s = txt(port);
  if (!s) return { snake: "", split: "", path: "" };
  const nsb = s.match(/nsb\.?\s*32(?:\.16)?\s*[-–]?\s*(\d+(?:\s*[-–]\s*\d+)?)/i);
  if (nsb) return { snake: nsb[1].replace(/\s*[-–]\s*/, "-"), split: "", path: "snake" };
  const ark = s.match(/splitter\s*[-–]?\s*input\s*(\d+)/i);
  if (ark) return { snake: "", split: ark[1], path: "split" };
  /* A computer feeding the AVB network directly, or a local analogue return. */
  if (/mbp|mac\b|network|laptop|local aux/i.test(s)) return { snake: "", split: "", path: "direct" };
  return { snake: "", split: "", path: "other" };
}

/**
 * The one-line patch reference shown on the musician card. AVB leads because
 * that is the number the two consoles agree on; Snake Map follows when the
 * sheet wrote one, then the Ark / NSB entry point.
 */
export function locLabel(inp) {
  const bits = [];
  if (inp.avb) bits.push(`AVB ${inp.avb}`);
  const snake = txt(inp.snake);
  if (snake) bits.push(`Snake ${snake}`);
  const port = txt(inp.port);
  const ark = port.match(/splitter\s*[-–]?\s*input\s*(\d+)/i);
  const nsb = port.match(/nsb\.?\s*32[^\d]*([\d\s–-]+)/i);
  if (ark) bits.push(`Ark ${ark[1]}`);
  if (nsb) {
    const nsbNum = txt(nsb[1]).replace(/\s*[-–]\s*/g, "-");
    /* Don't repeat "Snake 1 · NSB 1" when the Snake value was the NSB port. */
    if (snake !== nsbNum && snake !== txt(nsb[1])) bits.push(`NSB ${txt(nsb[1])}`);
  } else if (port && !snake && !ark) {
    bits.push(port);
  }
  return bits.join(" · ");
}

const INPUT_SPECS = {
  channel: /^(foh channel|32sc channel)$/,
  source: /source.*musician/,
  role: /role.*instrument/,
  avb: /(audio stream type|digital input patch source)/,
  port: /physical (stage input|hardware)/,
  gear: /hardware.*mic/,
  p48: /48v/,
  note: /^notes/,
};

/** Snake Map is FOH-only (sits beside the gutter). Never required to find a header. */
function attachSnakeCol(section, rows, within) {
  if (!section) return;
  const [lo, hi] = within;
  const norm = rows[section.row].map(header);
  for (let c = lo; c <= hi && c < norm.length; c++) {
    if (/^snake/.test(norm[c])) {
      section.col.snake = c;
      return;
    }
  }
}

const IEM_SPECS = {
  mix: /output mix/,
  out: /physical out/,
  tx: /hardware transmitter/,
  pack: /iem pack/,
  assignee: /assignee/,
  dest: /stereo mix destination/,
};

const BUS_SPECS = {
  bus: /output bus/,
  sig: /output signal type/,
  dest: /physical patch dest/,
  hw: /hardware connected/,
  purpose: /system purpose/,
  role: /output signal type/,
};

/**
 * Split the sheet at its gutter — the widest run of columns that is empty for
 * the whole sheet — so each half can be parsed on its own.
 */
export function findGutter(rows, width) {
  for (let c = Math.floor(width / 3); c < width; c++) {
    if (rows.every((row) => !txt(row[c]))) return c;
  }
  return Math.floor(width / 2);
}

/* ---- workbook helpers ---- */

/**
 * Read a worksheet into a dense array-of-arrays, blanks included, with merged
 * ranges expanded.
 *
 * A merged cell stores its value only in the top-left slot; every other slot
 * in the block reads back null even though the sheet DISPLAYS the value across
 * all of them. Without expanding, a straight column read loses exactly the
 * values a human sees: Kyle's name down the eight drum rows, the physical port
 * and hardware for the playback returns, the stereo-pair channel labels, and
 * every note written once against a block of rows.
 */
export function sheetToRows(sheet, XLSX) {
  const ref = sheet && sheet["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const rows = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      row.push(cell && cell.v != null ? cell.v : null);
    }
    rows.push(row);
  }
  for (const m of sheet["!merges"] || []) {
    const top = rows[m.s.r - range.s.r];
    const v = top ? top[m.s.c - range.s.c] : null;
    if (v == null) continue;
    for (let r = m.s.r; r <= m.e.r; r++) {
      const row = rows[r - range.s.r];
      if (!row) continue;
      for (let c = m.s.c; c <= m.e.c; c++) row[c - range.s.c] = v;
    }
  }
  return rows;
}

/**
 * Pick the event tab to import. The workbook keeps a Master map, per-county
 * event tabs and a pile of backups; prefer a county tab and never a backup.
 */
export function pickEventSheet(workbook, sheetName) {
  if (sheetName) {
    if (!workbook.SheetNames.includes(sheetName)) throw new Error(`Sheet not found: ${sheetName}`);
    return sheetName;
  }
  const pool = workbook.SheetNames.filter((n) => /inp-?u?t?-?out(put)? maps?/i.test(n));
  if (!pool.length) {
    throw new Error('No sheet matching "INP-OUT Map" found. Pass --sheet explicitly.');
  }
  const scored = pool.map((name) => {
    let score = 0;
    if (/k2c/i.test(name)) score += 2;
    if (/master/i.test(name)) score -= 5;
    if (/\(old\)|bkp|backup/i.test(name)) score -= 8;
    return { name, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].name;
}

/* ---- code generation ----
   IO_DEFAULT and IO_BUSES live in js/app-core.js as plain ES5 literals (no
   build step in this repo), so the importer writes that source directly. */

function lit(v) {
  return JSON.stringify(v == null ? "" : v);
}

export function formatIoDefaultJs(ioList) {
  const out = ["var IO_DEFAULT=["];
  for (const p of ioList) {
    const head = [
      `id:${lit(p.id)}`,
      `name:${lit(p.name)}`,
      `inst:${lit(p.inst)}`,
      `pack:${lit(p.pack)}`,
      `color:${lit(p.color || "#c7c2b8")}`,
      `qmix:${lit(p.qmix)}`,
      `tx:${lit(p.tx)}`,
      `aux:${lit(p.aux)}`,
      `out:${lit(p.out)}`,
      `txUnit:${lit(p.txUnit)}`,
      `leg:${lit(p.leg)}`,
      `mode:${lit(p.mode || "none")}`,
      `dest:${lit(p.dest)}`,
    ];
    if (p.kind) head.push(`kind:${lit(p.kind)}`);
    if (p.off) head.push("off:true");
    if (p.share && p.share.length) {
      head.push(
        "share:[" +
          p.share
            .map((s) => `{pack:${lit(s.pack)},name:${lit(s.name)},dest:${lit(s.dest)}}`)
            .join(",") +
          "]"
      );
    }
    out.push(`  {${head.join(",")},rows:[`);
    p.rows.forEach((r, i) => {
      const bits = [
        `id:${lit(r.id)}`,
        `role:${lit(r.role)}`,
        `gear:${lit(r.gear)}`,
        `loc:${lit(r.loc)}`,
        `avb:${lit(String(r.avb || ""))}`,
        `foh:${lit(r.foh)}`,
        `sc:${lit(r.sc)}`,
        `port:${lit(r.port)}`,
        `snake:${lit(r.snake)}`,
        `split:${lit(r.split)}`,
        `r32:${lit(r.r32)}`,
        `path:${lit(r.path)}`,
      ];
      if (r.altPort) bits.push(`altPort:${lit(r.altPort)}`);
      if (r.altGear) bits.push(`altGear:${lit(r.altGear)}`);
      if (r.note) bits.push(`note:${lit(r.note)}`);
      if (r.altNote) bits.push(`altNote:${lit(r.altNote)}`);
      if (r.src) bits.push(`src:${lit(r.src)}`);
      if (r.stereo) bits.push("stereo:true");
      if (r.p48) bits.push("p48:true");
      out.push(`    {${bits.join(",")}}${i < p.rows.length - 1 ? "," : ""}`);
    });
    out.push("  ]},");
  }
  out.push("];");
  return out.join("\n");
}

export function formatBusesJs(buses) {
  const out = ["var IO_BUSES=["];
  for (const b of buses) {
    const bits = [
      `id:${lit(b.id)}`,
      `bus:${lit(b.bus)}`,
      `sig:${lit(b.sig)}`,
      `dest:${lit(b.dest)}`,
      `hw:${lit(b.hw)}`,
      `purpose:${lit(b.purpose)}`,
    ];
    if (b.off) bits.push("off:true");
    out.push(`  {${bits.join(",")}},`);
  }
  out.push("];");
  return out.join("\n");
}

export function patchAppCore(src, ioList, buses) {
  let next = src;
  const ioRe = /var IO_DEFAULT=\[[\s\S]*?\n\];/;
  if (!ioRe.test(next)) throw new Error("Could not find the IO_DEFAULT block in js/app-core.js");
  next = next.replace(ioRe, formatIoDefaultJs(ioList));

  const busRe = /var IO_BUSES=\[[\s\S]*?\n\];/;
  if (!busRe.test(next)) throw new Error("Could not find the IO_BUSES block in js/app-core.js");
  next = next.replace(busRe, formatBusesJs(buses));
  return next;
}

export function consolidateSheet(rows) {
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const gut = findGutter(rows, width);

  const fohSec = findHeader(rows, INPUT_SPECS, [0, gut - 1]);
  const scSec = findHeader(rows, INPUT_SPECS, [gut + 1, width - 1]);
  if (!fohSec && !scSec) throw new Error("No input list header found on either half of the sheet.");
  attachSnakeCol(fohSec, rows, [0, gut - 1]);

  const fohRows = fohSec ? readInputHalf(rows, fohSec, "foh") : [];
  const scRows = scSec ? readInputHalf(rows, scSec, "sc") : [];
  const inputs = mergeInputs(fohRows, scRows);

  const iemSec = findHeader(rows, { ...IEM_SPECS, role: IEM_SPECS.pack }, [gut + 1, width - 1]);
  const mixes = iemSec ? readIemMixes(rows, iemSec) : [];

  const busSec = findHeader(rows, BUS_SPECS, [0, gut - 1]);
  const buses = busSec ? readBuses(rows, busSec) : [];

  const ioList = buildCards(inputs, mixes);

  return {
    ioList,
    buses,
    meta: {
      gutter: gut,
      fohHeader: fohSec ? fohSec.row + 1 : null,
      scHeader: scSec ? scSec.row + 1 : null,
      iemHeader: iemSec ? iemSec.row + 1 : null,
      busHeader: busSec ? busSec.row + 1 : null,
      fohInputs: fohRows.length,
      scInputs: scRows.length,
      mergedInputs: inputs.length,
      mixes: mixes.length,
      buses: buses.length,
      cards: ioList.length,
    },
  };
}
