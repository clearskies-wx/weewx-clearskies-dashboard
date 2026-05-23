// noaa-parser.ts — Fixed-width NOAA text report parser.
//
// Handles two report shapes:
//   Monthly: NOAA-YYYY-MM.txt  (single 13-column table)
//   Yearly:  NOAA-YYYY.txt     (three sub-tables: temperature, precipitation, wind)
//
// The parser trusts the structure of weewx-generated NOAA reports; it does
// NOT trust numeric values (all are range-validated before use).

// ---------------------------------------------------------------------------
// Monthly report types
// ---------------------------------------------------------------------------

export interface MonthlyRow {
  day: number | null;           // null for the summary row
  meanTemp: number | null;
  highTemp: number | null;
  highTempTime: string;
  lowTemp: number | null;
  lowTempTime: string;
  heatDegDays: number | null;
  coolDegDays: number | null;
  rain: number | null;
  avgWindSpeed: number | null;
  highWindSpeed: number | null;
  highWindTime: string;
  domWindDir: number | null;
}

export interface ParsedMonthlyReport {
  title: string;
  stationName: string;
  rows: MonthlyRow[];
  summary: MonthlyRow | null;
  /** Index into `rows` of the row with the highest highTemp value. */
  highTempRowIndex: number | null;
  /** Index into `rows` of the row with the lowest lowTemp value. */
  lowTempRowIndex: number | null;
}

// ---------------------------------------------------------------------------
// Yearly report types
// ---------------------------------------------------------------------------

export interface YearlyTable {
  headers: string[];
  rows: (string | number | null)[][];
  summary: (string | number | null)[] | null;
}

export interface ParsedYearlyReport {
  title: string;
  stationName: string;
  temperature: YearlyTable;
  precipitation: YearlyTable;
  wind: YearlyTable;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Parse a whitespace-separated token as a float; return null for "N/A" or NaN. */
function parseNum(token: string | undefined): number | null {
  if (!token || token === 'N/A') return null;
  const n = parseFloat(token);
  return isNaN(n) ? null : n;
}

/** Return true if a line consists entirely of dashes (separator line). */
function isSeparator(line: string): boolean {
  return /^-{5,}$/.test(line.trim());
}

// ---------------------------------------------------------------------------
// Monthly parser
// ---------------------------------------------------------------------------

/**
 * Parse the fixed-width text of a weewx monthly NOAA report into structured
 * data. Returns null if the text cannot be recognised as a monthly report.
 *
 * Column layout when split by /\s+/ after trimming:
 *   Data row  (13 tokens): DAY MEAN HIGH HTIME LOW LTIME HDD CDD RAIN AVGWIND HIGHWIND HWTIME DOMDIR
 *   Summary row (12 tokens): MEAN HIGH HDAY LOW LDAY HDD CDD RAIN AVGWIND HIGHWIND HWDAY DOMDIR
 */
export function parseMonthlyReport(rawText: string): ParsedMonthlyReport | null {
  const lines = rawText.split('\n');

  // 1. Title line
  const titleLine = lines.find((l) => l.includes('MONTHLY CLIMATOLOGICAL SUMMARY'));
  if (!titleLine) return null;
  const title = titleLine.trim();

  // 2. Station name
  const nameLine = lines.find((l) => l.startsWith('NAME:'));
  const stationName = nameLine ? nameLine.replace(/^NAME:\s*/, '').trim() : '';

  // 3. Find separator lines
  const separatorIndices = lines
    .map((l, i) => ({ i, isSep: isSeparator(l) }))
    .filter((x) => x.isSep)
    .map((x) => x.i);

  if (separatorIndices.length < 2) return null;

  const firstSep = separatorIndices[0];
  const secondSep = separatorIndices[1];

  // Data rows are between the two separators
  const dataLines = lines.slice(firstSep + 1, secondSep);

  // Summary line is right after the second separator
  const summaryLine = lines[secondSep + 1] ?? '';

  // 4. Parse data rows (13 tokens each)
  const rows: MonthlyRow[] = [];
  for (const line of dataLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const tokens = trimmed.split(/\s+/);
    if (tokens.length < 13) continue;

    rows.push({
      day: parseNum(tokens[0]),
      meanTemp: parseNum(tokens[1]),
      highTemp: parseNum(tokens[2]),
      highTempTime: tokens[3] ?? '',
      lowTemp: parseNum(tokens[4]),
      lowTempTime: tokens[5] ?? '',
      heatDegDays: parseNum(tokens[6]),
      coolDegDays: parseNum(tokens[7]),
      rain: parseNum(tokens[8]),
      avgWindSpeed: parseNum(tokens[9]),
      highWindSpeed: parseNum(tokens[10]),
      highWindTime: tokens[11] ?? '',
      domWindDir: parseNum(tokens[12]),
    });
  }

  // 5. Parse summary row (12 tokens — no DAY field)
  let summary: MonthlyRow | null = null;
  const summaryTrimmed = summaryLine.trim();
  if (summaryTrimmed) {
    const tokens = summaryTrimmed.split(/\s+/);
    if (tokens.length >= 12) {
      summary = {
        day: null,
        meanTemp: parseNum(tokens[0]),
        highTemp: parseNum(tokens[1]),
        highTempTime: tokens[2] ?? '',   // day-of-month number in summary
        lowTemp: parseNum(tokens[3]),
        lowTempTime: tokens[4] ?? '',    // day-of-month number in summary
        heatDegDays: parseNum(tokens[5]),
        coolDegDays: parseNum(tokens[6]),
        rain: parseNum(tokens[7]),
        avgWindSpeed: parseNum(tokens[8]),
        highWindSpeed: parseNum(tokens[9]),
        highWindTime: tokens[10] ?? '',  // day-of-month number in summary
        domWindDir: parseNum(tokens[11]),
      };
    }
  }

  // 6. Find high-temp row and low-temp row indices
  let highTempRowIndex: number | null = null;
  let lowTempRowIndex: number | null = null;
  let maxHigh = -Infinity;
  let minLow = Infinity;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.highTemp !== null && row.highTemp > maxHigh) {
      maxHigh = row.highTemp;
      highTempRowIndex = i;
    }
    if (row.lowTemp !== null && row.lowTemp < minLow) {
      minLow = row.lowTemp;
      lowTempRowIndex = i;
    }
  }

  // Guard: if no valid temps found, leave as null
  if (maxHigh === -Infinity) highTempRowIndex = null;
  if (minLow === Infinity) lowTempRowIndex = null;

  return { title, stationName, rows, summary, highTempRowIndex, lowTempRowIndex };
}

// ---------------------------------------------------------------------------
// Yearly parser
// ---------------------------------------------------------------------------

/**
 * Extract a single separator-bounded table from a slice of lines.
 * Returns { headerTokens, dataRows, summaryTokens, consumed } where
 * `consumed` is the number of lines used.
 *
 * Layout:
 *   <header line>
 *   <separator>
 *   <data rows…>
 *   <separator>
 *   <summary row>
 */
interface RawTable {
  headerLine: string;
  dataLines: string[];
  summaryLine: string;
  endIndex: number; // absolute index in the original lines array after this table
}

function extractTable(lines: string[], startIndex: number): RawTable | null {
  // Find the first separator at or after startIndex
  let firstSep = -1;
  for (let i = startIndex; i < lines.length; i++) {
    if (isSeparator(lines[i])) {
      firstSep = i;
      break;
    }
  }
  if (firstSep < 0) return null;

  // The header line is immediately before the first separator
  const headerLine = firstSep > 0 ? (lines[firstSep - 1] ?? '') : '';

  // Find the second separator after the first
  let secondSep = -1;
  for (let i = firstSep + 1; i < lines.length; i++) {
    if (isSeparator(lines[i])) {
      secondSep = i;
      break;
    }
  }
  if (secondSep < 0) return null;

  const dataLines = lines.slice(firstSep + 1, secondSep);
  const summaryLine = lines[secondSep + 1] ?? '';

  return { headerLine, dataLines, summaryLine, endIndex: secondSep + 2 };
}

/** Parse a raw table's data lines into rows of (string | number | null)[]. */
function parseTableRows(lines: string[]): (string | number | null)[][] {
  return lines
    .filter((l) => l.trim().length > 0)
    .map((line) => {
      return line.trim().split(/\s+/).map((token) => {
        if (token === 'N/A') return null;
        const n = parseFloat(token);
        // If it looks purely numeric (possibly with a decimal), return the number.
        // Otherwise treat as a string (month abbreviation, day-of-month, direction).
        if (!isNaN(n) && /^-?\d+(\.\d+)?$/.test(token)) return n;
        return token;
      });
    });
}

/** Parse a summary line into (string | number | null)[]. */
function parseSummaryRow(line: string): (string | number | null)[] | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/).map((token) => {
    if (token === 'N/A') return null;
    const n = parseFloat(token);
    if (!isNaN(n) && /^-?\d+(\.\d+)?$/.test(token)) return n;
    return token;
  });
}

/**
 * Parse the fixed-width text of a weewx yearly NOAA report.
 * The yearly report contains three sub-tables: temperature, precipitation, wind.
 * Returns null if the text cannot be recognised as a yearly report.
 */
export function parseYearlyReport(rawText: string): ParsedYearlyReport | null {
  const lines = rawText.split('\n');

  // Title line
  const titleLine = lines.find(
    (l) => l.includes('ANNUAL CLIMATOLOGICAL SUMMARY') || l.includes('YEARLY CLIMATOLOGICAL SUMMARY'),
  );
  if (!titleLine) return null;
  const title = titleLine.trim();

  // Station name
  const nameLine = lines.find((l) => l.startsWith('NAME:'));
  const stationName = nameLine ? nameLine.replace(/^NAME:\s*/, '').trim() : '';

  // Extract the three tables sequentially
  const table1 = extractTable(lines, 0);
  if (!table1) return null;

  const table2 = extractTable(lines, table1.endIndex);
  if (!table2) return null;

  const table3 = extractTable(lines, table2.endIndex);
  if (!table3) return null;

  function buildYearlyTable(raw: RawTable): YearlyTable {
    const headers = raw.headerLine.trim().split(/\s+/);
    const rows = parseTableRows(raw.dataLines);
    const summary = parseSummaryRow(raw.summaryLine);
    return { headers, rows, summary };
  }

  return {
    title,
    stationName,
    temperature: buildYearlyTable(table1),
    precipitation: buildYearlyTable(table2),
    wind: buildYearlyTable(table3),
  };
}
