#!/usr/bin/env node
/**
 * Import the Tech I/O list from a K2C routing workbook.
 *
 * Usage:
 *   node scripts/excel-to-io.mjs --workbook "path/to/file.xlsx"
 *   node scripts/excel-to-io.mjs --workbook file.xlsx --sheet "K2C Cheshire - INP-OUT Map"
 *   node scripts/excel-to-io.mjs --workbook file.xlsx --write-index
 *   node scripts/excel-to-io.mjs --workbook file.xlsx --output data/io-default.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import {
  sheetToRows,
  pickEventSheet,
  consolidateSheet,
  patchAppCore,
} from "./io-consolidate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function usage(code = 0) {
  console.log(`Import Tech I/O List from Excel

Merges the sheet's two input halves (FOH board and 32SC monitor console) on
the AVB stream number, and reads both output tables — the NSB 32.16 PA buses
and the Ark 32R IEM mixes.

Options:
  --workbook, -w   Path to .xlsx workbook (required)
  --sheet, -s      Sheet name (default: best matching event INP-OUT Map tab)
  --output, -o     Write JSON to this path
  --write-index    Patch IO_DEFAULT and IO_BUSES in js/app-core.js
  --verbose, -v    Print section discovery details
  --help, -h       Show this help
`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = {
    workbook: "",
    sheet: "",
    output: "",
    writeIndex: false,
    verbose: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--help":
      case "-h":
        usage(0);
        break;
      case "--workbook":
      case "-w":
        opts.workbook = argv[++i];
        break;
      case "--sheet":
      case "-s":
        opts.sheet = argv[++i];
        break;
      case "--output":
      case "-o":
        opts.output = argv[++i];
        break;
      case "--write-index":
        opts.writeIndex = true;
        break;
      case "--verbose":
      case "-v":
        opts.verbose = true;
        break;
      default:
        if (!arg.startsWith("-") && !opts.workbook) opts.workbook = arg;
        else {
          console.error(`Unknown argument: ${arg}`);
          usage(1);
        }
    }
  }

  if (!opts.workbook) {
    console.error("Error: --workbook is required.\n");
    usage(1);
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const workbookPath = path.resolve(opts.workbook);

  if (!fs.existsSync(workbookPath)) {
    console.error(`Workbook not found: ${workbookPath}`);
    process.exit(1);
  }

  const wb = XLSX.readFile(workbookPath, { cellDates: true });
  const sheetName = pickEventSheet(wb, opts.sheet || undefined);
  const { ioList, buses, meta } = consolidateSheet(sheetToRows(wb.Sheets[sheetName], XLSX));

  if (opts.verbose) {
    console.error(`Workbook: ${workbookPath}`);
    console.error(`Sheet:    ${sheetName}`);
    console.error(
      `Headers:  FOH inputs @ ${meta.fohHeader}, 32SC inputs @ ${meta.scHeader}, ` +
        `IEM @ ${meta.iemHeader}, PA buses @ ${meta.busHeader} (gutter col ${meta.gutter})`
    );
    console.error(
      `Parsed:   ${meta.fohInputs} FOH + ${meta.scInputs} 32SC rows → ${meta.mergedInputs} merged inputs, ` +
        `${meta.mixes} IEM mixes, ${meta.buses} PA buses → ${meta.cards} cards`
    );
  }

  const json = JSON.stringify({ ioList, buses }, null, 2);

  if (opts.output) {
    const outPath = path.resolve(opts.output);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, json + "\n", "utf8");
    console.error(`Wrote ${ioList.length} cards and ${buses.length} buses to ${outPath}`);
  }

  if (opts.writeIndex) {
    const corePath = path.join(ROOT, "js", "app-core.js");
    const src = fs.readFileSync(corePath, "utf8");
    fs.writeFileSync(corePath, patchAppCore(src, ioList, buses), "utf8");
    console.error(`Updated IO_DEFAULT and IO_BUSES in ${corePath}`);
  }

  if (!opts.output && !opts.writeIndex) {
    process.stdout.write(json + "\n");
  } else {
    console.error(`Done — ${ioList.length} cards, ${buses.length} buses.`);
  }
}

main();
