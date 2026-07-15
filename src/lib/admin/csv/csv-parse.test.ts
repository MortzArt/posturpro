import { describe, expect, it } from "vitest";
import { parseCsv, generateCsv, escapeCsvCell } from "./csv-parse";

describe("parseCsv (RFC-4180)", () => {
  it("parses simple rows", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
  });
  it("handles CRLF and LF", () => {
    expect(parseCsv("a,b\r\n1,2\r\n3,4")).toEqual([["a", "b"], ["1", "2"], ["3", "4"]]);
  });
  it("strips a leading BOM", () => {
    expect(parseCsv("﻿a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("parses quoted fields with commas and newlines", () => {
    expect(parseCsv('name,note\n"Silla, Pro","línea1\nlínea2"')).toEqual([
      ["name", "note"],
      ["Silla, Pro", "línea1\nlínea2"],
    ]);
  });
  it("unescapes doubled quotes", () => {
    expect(parseCsv('a\n"He said ""hi"""')).toEqual([["a"], ['He said "hi"']]);
  });
  it("drops a trailing blank line", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("drops multiple trailing blank lines but not a leading/middle one (hacker)", () => {
    // A blank row in the MIDDLE is kept (it becomes a row the caller can error
    // on), only truly-trailing blanks are stripped — line numbers stay honest.
    expect(parseCsv("a,b\n1,2\n\n3,4\n\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
      [""],
      ["3", "4"],
    ]);
  });
  it("keeps ragged rows for the caller to validate", () => {
    expect(parseCsv("a,b,c\n1,2")).toEqual([["a", "b", "c"], ["1", "2"]]);
  });
});

describe("generateCsv / escapeCsvCell", () => {
  it("quotes only when needed and doubles quotes", () => {
    expect(escapeCsvCell("plain")).toBe("plain");
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
    expect(escapeCsvCell('he "said"')).toBe('"he ""said"""');
    expect(escapeCsvCell("line\nbreak")).toBe('"line\nbreak"');
  });
  it("prefix-escapes formula-injection cells", () => {
    expect(escapeCsvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(escapeCsvCell("+cmd")).toBe("'+cmd");
    expect(escapeCsvCell("@x")).toBe("'@x");
  });
  it("prefix-escapes a leading TAB or CR too (m-2, OWASP full set)", () => {
    expect(escapeCsvCell("\t=cmd")).toBe("'\t=cmd");
    // A leading CR also triggers RFC-4180 quoting → escaped '-prefix, quoted.
    expect(escapeCsvCell("\rx")).toBe('"\'\rx"');
  });
  it("round-trips through parseCsv", () => {
    const rows = [["name", "note"], ["Silla, Pro", 'quote "x"'], ["plain", "ok"]];
    const parsed = parseCsv(generateCsv(rows));
    expect(parsed).toEqual(rows);
  });
});
