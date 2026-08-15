#!/usr/bin/env node
/**
 * Import Tech I/O List from K2C Input-Output Excel workbook.
 *
 * Usage:
 *   node scripts/excel-to-io.mjs --workbook "path/to/file.xlsx"
 *   node scripts/excel-to-io.mjs --workbook file.xlsx --sheet "K2C Grafton - INPUT-OUTPUT Maps"
 *   node scripts/excel-to-io.mjs --workbook file.xlsx --write-index
 *   node scripts/excel-to-io.mjs --workbook file.xlsx --output data/io-default.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import {
  loadWorkbookIoList,
  patchIndexHtml,
  formatIoDefaultJs,
} from "./io-import-lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function usage(code = 0) {
  console.log(`Import Tech I/O List from Excel

Options:
  --workbook, -w   Path to .xlsx workbook (required)
  --sheet, -s      Sheet name (default: best matching event INPUT-OUTPUT Maps tab)
  --output, -o     Write JSON to this path
  --write-index    Patch IO_DEFAULT in index.html
  --include-spares Include N/A spare / sax rows
  --no-roster      Skip Event Roster name resolution
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
    includeSpares: false,
    useRoster: true,
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
      case "--include-spares":
        opts.includeSpares = true;
        break;
      case "--no-roster":
        opts.useRoster = false;
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

  const { ioList, meta, sheetName } = loadWorkbookIoList(XLSX, workbookPath, {
    sheet: opts.sheet || undefined,
    includeSpares: opts.includeSpares,
    useRoster: opts.useRoster,
  });

  if (opts.verbose) {
    console.error(`Workbook: ${workbookPath}`);
    console.error(`Sheet:    ${sheetName}`);
    console.error(
      `Sections: inputs @ row ${meta.inputSection}` +
        (meta.iemSection ? `, IEM @ row ${meta.iemSection}` : ", IEM section not found")
    );
    console.error(
      `Parsed:   ${meta.inputCount} input rows, ${meta.iemCount} IEM assignments → ${meta.performerCount} performer cards`
    );
  }

  const json = JSON.stringify(ioList, null, 2);

  if (opts.output) {
    const outPath = path.resolve(opts.output);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, json, "utf8");
    console.error(`Wrote ${ioList.length} performers to ${outPath}`);
  }

  if (opts.writeIndex) {
    const indexPath = path.join(ROOT, "index.html");
    const html = fs.readFileSync(indexPath, "utf8");
    const next = patchIndexHtml(html, ioList);
    fs.writeFileSync(indexPath, next, "utf8");
    console.error(`Updated IO_DEFAULT in ${indexPath}`);
  }

  if (!opts.output && !opts.writeIndex) {
    process.stdout.write(json + "\n");
  } else if (opts.verbose || opts.writeIndex || opts.output) {
    console.error(`Done — ${ioList.length} performer cards.`);
  }
}

main();
