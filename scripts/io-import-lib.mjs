/**
 * Parse K2C Input-Output Excel maps into Tech I/O List (ioList) JSON.
 * Sections and row counts are discovered dynamically — not hard-coded.
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

const DEFAULT_SKIP_MUSICIANS = new Set([
  "host 1",
  "host 2",
  "foh tb",
  "playback",
  "laptop",
]);

const DEFAULT_SKIP_ROLE_PATTERNS = [
  /raw split/i,
  /^tracks?\s*\(/i,
  /^click$/i,
  /^guide$/i,
  /^spotify/i,
  /^unused channel$/i,
];

const SECTION_STOP_PATTERNS = [
  /^part 2:/i,
  /^aux in/i,
  /^tape in/i,
  /^nsb 32/i,
  /^foh output bus/i,
];

const INST_NORMALIZE = {
  "acoustic 1": "Acoustic Guitar 1",
  "acoustic 2": "Acoustic Guitar 2",
  "keyboard platform": "Keys",
  "keys": "Keys",
  "drums platform": "Drums",
  "electric guitar": "Electric Guitar",
  "bass": "Bass Guitar",
  "lead vox": "",
  "add'l vox": "",
};

export function normCell(value) {
  if (value == null) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

export function normKey(value) {
  return normCell(value).toLowerCase();
}

function normHeader(value) {
  return normKey(value)
    .replace(/[^\w\s/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slug(value) {
  return normKey(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "item";
}

export function sheetToRows(sheet, XLSX) {
  const ref = sheet["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const rows = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      row.push(sheet[addr]?.v ?? null);
    }
    rows.push(row);
  }
  return rows;
}

function rowText(row) {
  return row.map(normCell).join(" ").trim();
}

function isStopRow(row, maxCol = 8) {
  const text = row
    .slice(0, maxCol + 1)
    .map(normCell)
    .join(" ")
    .trim();
  return SECTION_STOP_PATTERNS.some((re) => re.test(text));
}

function isBlankRow(row) {
  return row.every((v) => !normCell(v));
}

function findColumn(normalizedRow, pattern) {
  return normalizedRow.findIndex((h) => pattern.test(h));
}

function buildColumnMap(headerRow, specs) {
  const normalized = headerRow.map(normHeader);
  const map = {};
  for (const [key, pattern] of Object.entries(specs)) {
    const idx = findColumn(normalized, pattern);
    if (idx >= 0) map[key] = idx;
  }
  return map;
}

function discoverInputSection(rows) {
  // Prefer 32SC monitor map; fall back to FOH input list with similar columns.
  const specs = {
    channel: /^(32sc channel|foh channel|ch\s*\/\s*avb)$/,
    musician: /source.*musician/,
    role: /role.*instrument/,
    physical: /physical (hardware|stage input)/,
    hardware: /hardware.*mic/,
    notes: /notes/,
  };

  for (let r = 0; r < rows.length; r++) {
    const normalized = rows[r].map(normHeader);
    const hasChannel = normalized.some((h) => specs.channel.test(h));
    const hasMusician = normalized.some((h) => specs.musician.test(h));
    const hasRole = normalized.some((h) => specs.role.test(h));
    if (!hasChannel || !hasMusician || !hasRole) continue;

    const prefer32sc = normalized.some((h) => /32sc channel/.test(h));
    const map = buildColumnMap(rows[r], specs);
    if (Object.keys(map).length < 4) continue;

    // If both FOH and 32SC headers exist on one row, pick the 32SC block (usually cols 9+).
    const channelCols = normalized
      .map((h, i) => (/32sc channel/.test(h) ? i : /foh channel/.test(h) ? i : -1))
      .filter((i) => i >= 0);
    const startCol =
      prefer32sc && channelCols.length
        ? channelCols.find((i) => /32sc/.test(normalized[i])) ?? channelCols[0]
        : map.channel;

    const shiftedMap = {};
    for (const [key, idx] of Object.entries(map)) {
      shiftedMap[key] = idx >= startCol ? idx : idx + startCol;
    }

    return { headerRow: r, col: shiftedMap, prefer32sc };
  }
  return null;
}

function discoverIemSection(rows) {
  const specs = {
    outputMix: /(32sc output mix|output mix|foh output bus)/,
    physicalOut: /(ark physical out|physical patch dest|physical out)/,
    transmitter: /(hardware transmitter|hardware connected)/,
    pack: /(iem pack|pack number)/,
    assignee: /assignee/,
    dest: /(stereo mix destination|notes.*q-?mix|system purpose)/,
  };

  for (let r = 0; r < rows.length; r++) {
    const normalized = rows[r].map(normHeader);
    const hasPack = normalized.some((h) => specs.pack.test(h));
    const hasAssignee = normalized.some((h) => specs.assignee.test(h));
    if (!hasPack || !hasAssignee) continue;

    const map = buildColumnMap(rows[r], specs);
    if (!map.pack || map.assignee == null) continue;
    return { headerRow: r, col: map };
  }
  return null;
}

function colorNameFromHex(hex) {
  const h = normCell(hex).toLowerCase();
  for (const [name, value] of Object.entries(PACK_COLORS)) {
    if (value.toLowerCase() === h) {
      if (name === "grey" || name === "gray") return "Gray";
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
  }
  return "";
}

function colorNameFromPackRaw(raw) {
  const paren = normCell(raw).match(/\(([^)]+)\)/);
  if (!paren) return "";
  const token = paren[1].trim();
  if (!token || /^(l|r|left|right|stereo|mono)$/i.test(token)) return "";
  if (/^grey$/i.test(token)) return "Gray";
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

/** Performer card id: pack label + color, e.g. Pack1 (Orange), Spare Pack2 */
export function performerIdFromPack({ pack, color, spare, raw }) {
  if (!pack) return "";

  if (spare) {
    const num = pack.match(/(\d+)/);
    return num ? `Spare Pack${num[1]}` : pack.replace(/\s+/g, " ");
  }

  const num = pack.match(/Pack\s*(\d+)/i);
  if (!num) return normCell(raw) || pack;

  const colorName = colorNameFromPackRaw(raw) || colorNameFromHex(color);
  return colorName ? `Pack${num[1]} (${colorName})` : `Pack${num[1]}`;
}

function parsePackLabel(raw) {
  const s = normCell(raw);
  if (!s) return { pack: "", color: "#c7c2b8", spare: false, raw: "" };

  const spare = /spare/i.test(s);
  const numMatch = s.match(/pack\s*(\d+)/i);
  const pack = numMatch ? `Pack ${numMatch[1]}` : s;

  let color = "#c7c2b8";
  const paren = s.match(/\(([^)]+)\)/);
  const colorToken = (paren?.[1] || s).toLowerCase();
  for (const [name, hex] of Object.entries(PACK_COLORS)) {
    if (colorToken.includes(name)) {
      color = hex;
      break;
    }
  }
  if (spare && color === "#c7c2b8" && numMatch) {
    // Tint spare packs slightly using the referenced pack color if present.
    const ref = s.match(/spare pack\s*(\d+)/i);
    if (ref) {
      /* keep grey — spares share hardware */
    }
  }

  return { pack: spare && numMatch ? `Spare Pack ${numMatch[1]}` : pack, color, spare, raw: s };
}

export function qmixFromLabels(...parts) {
  const text = parts.map(normCell).join(" ");
  const range = text.match(/(\d+)\s*[&/–-]\s*(\d+)/);
  if (range) {
    return range[1] === range[2] ? range[1] : `${range[1]} / ${range[2]}`;
  }
  const nums = [...text.matchAll(/\b(\d{1,2})\b/g)].map((m) => m[1]);
  if (nums.length >= 2 && /output|aux/i.test(text)) {
    return nums[0] === nums[1] ? nums[0] : `${nums[0]} / ${nums[1]}`;
  }
  if (nums.length) return nums[0];
  return "";
}

function normalizeInst(dest) {
  const key = normKey(dest);
  if (!key) return "";
  if (INST_NORMALIZE[key] !== undefined) return INST_NORMALIZE[key];
  return normCell(dest);
}

function shortLoc(physical, hardware) {
  const phys = normCell(physical);
  const hw = normCell(hardware);
  if (/wireless/i.test(hw)) {
    const fromIp = phys.match(/\(from\s+ip\s*(\d+)\)/i);
    const isTunedAE = /wireless\s+mic\s+[a-e]\b/i.test(hw);
    const n = isTunedAE ? fromIp?.[1] : fromIp?.[1] || phys.match(/input\s*(\d+)/i)?.[1];
    if (n) return `(Wls) ARK – ${n}`;
    return "N/A (Wireless)";
  }
  const m = phys.match(/input\s*(\d+)/i);
  if (m) return `ARK – ${m[1]}`;
  if (/nsb\.?32/i.test(phys)) {
    return phys.replace(/NSB\.32/i, "NSB.32").replace(/\s+/g, " ");
  }
  if (phys) return phys;
  return "";
}

function shouldSkipInput(musician, role, options) {
  const mus = normKey(musician);
  const rol = normCell(role);
  if (!mus && !rol) return true;
  if (mus.startsWith("aux in")) return true;

  const skipMusicians = options.skipMusicians || DEFAULT_SKIP_MUSICIANS;
  if (mus && skipMusicians.has(mus)) return true;

  const skipRoles = options.skipRolePatterns || DEFAULT_SKIP_ROLE_PATTERNS;
  if (skipRoles.some((re) => re.test(rol))) return true;

  if (mus === "n/a" && /^(spare|saxophone)$/i.test(rol)) return !options.includeSpares;
  return false;
}

function musicianAliases(name) {
  const base = normCell(name);
  if (!base) return [];
  const keys = new Set([normKey(base)]);
  keys.add(normKey(base.replace(/\s+TB$/i, "")));
  keys.add(normKey(base.replace(/\s+AG$/i, "")));
  keys.add(normKey(base.replace(/\s+\(TB\)$/i, "")));
  if (/\sAG$/i.test(base)) keys.add(normKey(base.replace(/\sAG$/i, "")));
  if (/\sTB$/i.test(base)) keys.add(normKey(base.replace(/\sTB$/i, "")));
  return [...keys].filter(Boolean);
}

function displayName(name) {
  return normCell(name)
    .replace(/\sTB$/i, "")
    .replace(/\sAG$/i, "")
    .trim();
}

function parseEventRoster(rows) {
  let headerRow = -1;
  for (let r = 0; r < rows.length; r++) {
    const normalized = rows[r].map(normHeader);
    const slotIdx = normalized.findIndex((h) => /source.*musician/.test(h));
    const personIdx = normalized.findIndex((h) => /event musician/.test(h));
    if (slotIdx >= 0 && personIdx >= 0) {
      headerRow = r;
      const roleIdx = normalized.findIndex((h) => /role.*instrument/.test(h));
      const map = { slot: slotIdx, person: personIdx, role: roleIdx };
      const roster = new Map();
      for (let i = r + 1; i < rows.length; i++) {
        if (isBlankRow(rows[i])) continue;
        const slot = normCell(rows[i][slotIdx]);
        const person = normCell(rows[i][personIdx]);
        if (!slot) continue;
        roster.set(normKey(slot), person || slot);
      }
      return roster;
    }
  }
  return new Map();
}

function resolveMusician(rawMusician, roster) {
  const mus = normCell(rawMusician);
  if (!mus) return "";
  const key = normKey(mus);
  if (roster.has(key)) return roster.get(key);
  return mus;
}

function readInputRows(rows, section, roster, options) {
  const { headerRow, col } = section;
  const inputs = [];
  let lastMusician = "";

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    if (isStopRow(row)) break;
    if (isBlankRow(row)) {
      if (inputs.length && r > headerRow + 3) {
        // Allow blank separators mid-table; stop only after content + blank + blank.
        const next = rows[r + 1];
        if (!next || isBlankRow(next)) break;
      }
      continue;
    }

    const rawMus = normCell(row[col.musician]);
    const role = normCell(row[col.role]);
    const hardware = col.hardware != null ? normCell(row[col.hardware]) : "";
    const physical = col.physical != null ? normCell(row[col.physical]) : "";

    if (rawMus) lastMusician = resolveMusician(rawMus, roster);
    const musician = rawMus ? lastMusician : lastMusician;

    if (shouldSkipInput(musician || rawMus, role, options)) continue;
    if (!role && !hardware) continue;

    inputs.push({
      musician: musician || resolveMusician(rawMus, roster),
      role,
      gear: hardware,
      loc: shortLoc(physical, hardware),
      sourceLabel: rawMus || musician,
    });
  }
  return inputs;
}

function readIemAssignments(rows, section) {
  const { headerRow, col } = section;
  const assignments = [];
  let blankStreak = 0;

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    if (isBlankRow(row)) {
      blankStreak++;
      if (blankStreak >= 2 && assignments.length) break;
      continue;
    }
    blankStreak = 0;

    const assignee = normCell(row[col.assignee]);
    const packRaw = col.pack != null ? row[col.pack] : "";
    const dest = col.dest != null ? normCell(row[col.dest]) : "";
    const outputMix = col.outputMix != null ? normCell(row[col.outputMix]) : "";
    const physicalOut = col.physicalOut != null ? normCell(row[col.physicalOut]) : "";

    if (!assignee && !packRaw) continue;
    // Rows often contain PA routing on the left and IEM data on the right — never
    // skip a row that already has assignee/pack cells populated.

    const packInfo = parsePackLabel(packRaw);
    assignments.push({
      assignee,
      ...packInfo,
      inst: normalizeInst(dest),
      qmix: qmixFromLabels(outputMix, physicalOut),
      dest,
    });
  }
  return assignments;
}

function buildAssigneeIndex(assignments) {
  const byKey = new Map();
  for (const a of assignments) {
    if (!a.assignee) continue;
    const key = normKey(a.assignee);
    if (!byKey.has(key)) byKey.set(key, a);
    for (const alias of musicianAliases(a.assignee)) {
      if (!byKey.has(alias)) byKey.set(alias, a);
    }
  }
  return byKey;
}

function resolveAssignee(musician, assigneeIndex) {
  if (!musician) return null;
  for (const alias of musicianAliases(musician)) {
    if (assigneeIndex.has(alias)) return assigneeIndex.get(alias);
  }
  return null;
}

function uniqueId(base, used) {
  let id = slug(base);
  let n = 2;
  while (used.has(id)) {
    id = `${slug(base)}-${n++}`;
  }
  used.add(id);
  return id;
}

export function buildIoList(rows, options = {}) {
  const roster = options.roster || new Map();
  const inputSection = discoverInputSection(rows);
  if (!inputSection) {
    throw new Error(
      "Could not find an input list header row (32SC Channel / Source / Musician / Role)."
    );
  }

  const inputs = readInputRows(rows, inputSection, roster, options);
  const iemSection = discoverIemSection(rows);
  const assignments = iemSection ? readIemAssignments(rows, iemSection) : [];
  const assigneeIndex = buildAssigneeIndex(assignments);

  const grouped = new Map();
  const assigneeOrder = assignments.map((a) => normKey(a.assignee)).filter(Boolean);

  function ensurePerformer(key, seed = {}) {
    if (!grouped.has(key)) {
      grouped.set(key, {
        name: seed.name || key,
        inst: seed.inst || "",
        pack: seed.pack || "",
        packRaw: seed.packRaw || "",
        color: seed.color || "#c7c2b8",
        qmix: seed.qmix || "",
        spare: !!seed.spare,
        rows: [],
      });
    } else {
      const card = grouped.get(key);
      if (seed.pack && !card.pack) card.pack = seed.pack;
      if (seed.packRaw && !card.packRaw) card.packRaw = seed.packRaw;
      if (seed.color && card.color === "#c7c2b8") card.color = seed.color;
      if (seed.qmix && !card.qmix) card.qmix = seed.qmix;
      if (seed.inst && !card.inst) card.inst = seed.inst;
      if (seed.spare) card.spare = true;
    }
    return grouped.get(key);
  }

  for (const inp of inputs) {
    const assignment = resolveAssignee(inp.musician, assigneeIndex);
    const cardKey = assignment
      ? normKey(assignment.assignee)
      : normKey(displayName(inp.musician));

    const card = ensurePerformer(cardKey, {
      name: assignment ? displayName(assignment.assignee) : displayName(inp.musician),
      inst: assignment?.inst || "",
      pack: assignment?.pack || "",
      packRaw: assignment?.raw || "",
      color: assignment?.color || "#c7c2b8",
      qmix: assignment?.qmix || "",
      spare: assignment?.spare,
    });

    card.rows.push({
      role: inp.role,
      gear: inp.gear,
      loc: inp.loc,
      _source: inp.sourceLabel,
    });
  }

  // IEM assignees with no patched inputs still appear (pack-only card).
  for (const a of assignments) {
    const key = normKey(a.assignee);
    ensurePerformer(key, {
      name: displayName(a.assignee),
      inst: a.inst,
      pack: a.pack,
      packRaw: a.raw,
      color: a.color,
      qmix: a.qmix,
      spare: a.spare,
    });
  }

  const usedIds = new Set();
  const orderedKeys = [
    ...assigneeOrder.filter((k) => grouped.has(k)),
    ...[...grouped.keys()].filter((k) => !assigneeOrder.includes(k)),
  ];

  const ioList = [];
  for (const key of orderedKeys) {
    const p = grouped.get(key);
    if (!p || (!p.rows.length && !p.pack)) continue;

    const off =
      !p.pack &&
      p.rows.length === 1 &&
      /^n\/a$/i.test(p.name) &&
      !options.includeSpares;

    const packId = performerIdFromPack({
      pack: p.pack,
      color: p.color,
      spare: p.spare,
      raw: p.packRaw,
    });
    let performerId = packId || slug(p.name);
    if (usedIds.has(performerId)) {
      performerId = uniqueId(`${performerId}-${p.name}`, usedIds);
    } else {
      usedIds.add(performerId);
    }

    const performer = {
      id: performerId,
      name: p.name,
      inst: p.inst || "",
      pack: p.pack || "",
      color: p.color || "#c7c2b8",
      qmix: p.qmix || "",
      rows: p.rows.map((r) => ({
        id: uniqueId(`${p.name}-${r.role}-${r.gear}`, usedIds),
        role: r.role,
        gear: r.gear,
        loc: r.loc,
      })),
    };
    if (off) performer.off = true;
    ioList.push(performer);
  }

  return {
    ioList,
    meta: {
      inputSection: inputSection.headerRow + 1,
      iemSection: iemSection ? iemSection.headerRow + 1 : null,
      inputCount: inputs.length,
      iemCount: assignments.length,
      performerCount: ioList.length,
    },
  };
}

export function pickEventSheet(workbook, XLSX, sheetName) {
  if (sheetName) {
    if (!workbook.SheetNames.includes(sheetName)) {
      throw new Error(`Sheet not found: ${sheetName}`);
    }
    return sheetName;
  }

  const candidates = workbook.SheetNames.filter((n) =>
    /input-?output maps/i.test(n)
  );
  const eventSheets = candidates.filter((n) => !/^master/i.test(n));
  const pool = eventSheets.length ? eventSheets : candidates;
  if (!pool.length) {
    throw new Error(
      'No sheet matching "INPUT-OUTPUT Maps" found. Pass --sheet explicitly.'
    );
  }
  // Prefer tabs that look like a named event (contain "K2C" and a year/date).
  const scored = pool.map((name) => {
    let score = 0;
    if (/k2c/i.test(name)) score += 2;
    if (/20\d{2}/.test(name)) score += 2;
    if (/master/i.test(name)) score -= 5;
    if (/\(old\)|bkp|backup/i.test(name)) score -= 3;
    return { name, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].name;
}

export function loadWorkbookIoList(XLSX, workbookPath, options = {}) {
  const wb = XLSX.readFile(workbookPath, { cellDates: true });
  const sheetName = pickEventSheet(wb, XLSX, options.sheet);
  const eventRows = sheetToRows(wb.Sheets[sheetName], XLSX);

  let roster = new Map();
  if (options.useRoster !== false && wb.SheetNames.includes("Event Roster")) {
    roster = parseEventRoster(sheetToRows(wb.Sheets["Event Roster"], XLSX));
  }

  const { ioList, meta } = buildIoList(eventRows, { ...options, roster });
  return { ioList, meta, sheetName, workbookPath };
}

export function formatIoDefaultJs(ioList) {
  const lines = ["var IO_DEFAULT=["];
  for (const p of ioList) {
    const head = [
      `id:${JSON.stringify(p.id)}`,
      `name:${JSON.stringify(p.name)}`,
      `inst:${JSON.stringify(p.inst || "")}`,
      `pack:${JSON.stringify(p.pack || "")}`,
      `color:${JSON.stringify(p.color || "#c7c2b8")}`,
      `qmix:${JSON.stringify(p.qmix || "")}`,
      `tx:${JSON.stringify(p.tx || "")}`,
    ];
    if (p.off) head.push("off:true");
    lines.push(`  {${head.join(",")},rows:[`);
    for (let i = 0; i < p.rows.length; i++) {
      const r = p.rows[i];
      const comma = i < p.rows.length - 1 ? "," : "";
      lines.push(
        `    {id:${JSON.stringify(r.id)},role:${JSON.stringify(r.role)},gear:${JSON.stringify(r.gear)},loc:${JSON.stringify(r.loc)}}${comma}`
      );
    }
    lines.push("  ]},");
  }
  lines.push("];");
  return lines.join("\n");
}

export function patchIndexHtml(html, ioList) {
  const block = formatIoDefaultJs(ioList);
  const re = /var IO_DEFAULT=\[[\s\S]*?\n\];/;
  if (!re.test(html)) {
    throw new Error("Could not find IO_DEFAULT block in index.html");
  }
  return html.replace(re, block);
}
