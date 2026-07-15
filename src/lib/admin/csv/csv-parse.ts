/**
 * PURE RFC-4180 CSV parser + generator (T11 Slice 7, AC-29..32). Zero new deps.
 * No I/O, no Next imports — exhaustively unit-testable. Handles: CRLF or LF
 * records, quoted fields containing commas/quotes/newlines, doubled `""` escapes
 * inside quoted fields, and a leading UTF-8 BOM. The generator quotes only when
 * needed and prefix-escapes formula-injection-prone leading `= + - @` (a cell
 * that could execute in a spreadsheet).
 */

/** Strip a leading UTF-8 BOM if present. */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Parse CSV text into an array of records (each a string[] of fields). A fully
 * RFC-4180-correct state machine (in-quote / out-quote). Blank trailing lines
 * are ignored. Throws only on a structurally impossible state (never on
 * user-content — a ragged row is returned as-is for the caller to validate).
 */
export function parseCsv(input: string): string[][] {
  const text = stripBom(input);
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let index = 0;

  const pushField = (): void => {
    row.push(field);
    field = "";
  };
  const pushRow = (): void => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (index < text.length) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      index += 1;
      continue;
    }
    if (char === ",") {
      pushField();
      index += 1;
      continue;
    }
    if (char === "\r") {
      // Treat CRLF (and a lone CR) as one record terminator.
      pushRow();
      index += text[index + 1] === "\n" ? 2 : 1;
      continue;
    }
    if (char === "\n") {
      pushRow();
      index += 1;
      continue;
    }
    field += char;
    index += 1;
  }

  // Flush the trailing field/row unless the input ended exactly on a newline.
  if (field !== "" || row.length > 0) {
    pushRow();
  }

  return dropTrailingBlankRows(rows);
}

/** Drop rows that are entirely empty (a trailing blank line). */
function dropTrailingBlankRows(rows: string[][]): string[][] {
  return rows.filter((row) => !(row.length === 1 && row[0] === ""));
}

/** Whether a field needs RFC-4180 quoting (comma, quote, or newline). */
function needsQuoting(value: string): boolean {
  return /[",\r\n]/.test(value);
}

/**
 * Escape a single cell for output: prefix-escape a formula-injection leading
 * char with a `'`, then RFC-4180-quote (doubling `"`) when needed. The lead-char
 * set is OWASP's full set: `= + - @` plus TAB (0x09) and CR (0x0D) (m-2).
 */
export function escapeCsvCell(value: string): string {
  let cell = value;
  if (/^[=+\-@\t\r]/.test(cell)) cell = `'${cell}`;
  if (needsQuoting(cell)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

/** Generate RFC-4180 CSV text (CRLF line endings) from rows of cells. */
export function generateCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}
