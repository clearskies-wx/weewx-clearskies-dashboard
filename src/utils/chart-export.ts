// chart-export.ts — T4.6
// PNG and CSV export utilities for chart groups.
// Uses only native browser APIs: XMLSerializer, HTMLCanvasElement, Blob,
// URL.createObjectURL. No external dependencies.

// ---------------------------------------------------------------------------
// CSV Export
// ---------------------------------------------------------------------------

/**
 * Escape a single CSV value.
 * Wraps the value in double-quotes if it contains a comma, double-quote, or
 * newline, and escapes any embedded double-quotes by doubling them (RFC 4180).
 */
function escapeCsvValue(value: unknown): string {
  const str = value == null ? '' : String(value);
  // Wrap in quotes if contains comma, quote, CR, or LF
  if (str.includes(',') || str.includes('"') || str.includes('\r') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Export chart data as a UTF-8 CSV file (with BOM for Excel compatibility).
 *
 * @param data     Full (non-downsampled) chart data rows.
 * @param columns  Ordered list of { key, label } pairs — key is the row field
 *                 key, label is the CSV header text.
 * @param filename Target filename (e.g. "Homepage-2026-06-05.csv").
 */
export function exportChartAsCsv(
  data: Record<string, unknown>[],
  columns: { key: string; label: string }[],
  filename: string,
): void {
  // Build header row
  const header = columns.map((col) => escapeCsvValue(col.label)).join(',');

  // Build data rows
  const rows = data.map((row) =>
    columns.map((col) => escapeCsvValue(row[col.key])).join(','),
  );

  // UTF-8 BOM (﻿) makes Excel open the file correctly without
  // requiring the user to manually specify the encoding.
  const csvContent = '﻿' + [header, ...rows].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
}

// ---------------------------------------------------------------------------
// PNG Export
// ---------------------------------------------------------------------------

/**
 * Inline computed styles for elements that Recharts renders using CSS classes.
 * Without inlining, the SVG loses all colour/font information when drawn onto
 * a canvas (the canvas has no CSS context).
 *
 * Only copies properties that are meaningful for chart rendering — a full copy
 * of every computed property bloats the SVG and can confuse some renderers.
 */
const INLINE_STYLE_PROPS: ReadonlyArray<string> = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-opacity',
  'fill-opacity',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'visibility',
  'display',
  'text-anchor',
  'dominant-baseline',
];

/**
 * Export the chart(s) inside `containerElement` as a PNG file.
 *
 * Strategy: SVG → data URL → Image → canvas → PNG blob → download.
 * All steps use native browser APIs; no third-party libraries.
 *
 * The function finds the first <svg> inside the container. For groups with
 * multiple charts the caller should pass the outermost wrapper that contains
 * all charts; the function clones the full SVG it finds.
 *
 * @param containerElement  The DOM element that wraps the chart SVG(s).
 * @param filename          Target filename (e.g. "Homepage-2026-06-05.png").
 */
export async function exportChartAsPng(
  containerElement: HTMLElement,
  filename: string,
): Promise<void> {
  // Find the SVG inside the container.
  const svgElement = containerElement.querySelector('svg');
  if (!svgElement) {
    // No SVG found — silently bail. Wind rose or other non-SVG renders may
    // reach here; we don't want to crash.
    return;
  }

  // Clone the SVG so we can mutate it (inline styles) without affecting
  // the live DOM.
  const svgClone = svgElement.cloneNode(true) as SVGElement;

  // Copy the bounding-box dimensions onto the clone so the serialised SVG
  // has explicit width/height attributes (required for canvas drawImage).
  const bbox = svgElement.getBoundingClientRect();
  const width = Math.round(bbox.width) || 800;
  const height = Math.round(bbox.height) || 400;
  svgClone.setAttribute('width', String(width));
  svgClone.setAttribute('height', String(height));

  // Inline computed styles from the LIVE element tree into the clone.
  // The clone's elements don't have computed styles of their own, so we
  // must transfer them from the originals before serialisation.
  const liveElements = svgElement.querySelectorAll('*');
  const cloneElements = svgClone.querySelectorAll('*');
  liveElements.forEach((liveEl, i) => {
    const cloneEl = cloneElements[i] as HTMLElement | undefined;
    if (!cloneEl) return;
    const computed = window.getComputedStyle(liveEl as HTMLElement);
    const inlineStyle: string[] = [];
    for (const prop of INLINE_STYLE_PROPS) {
      const value = computed.getPropertyValue(prop);
      if (value !== '') {
        inlineStyle.push(`${prop}:${value}`);
      }
    }
    const existing = cloneEl.getAttribute('style') ?? '';
    const merged = existing ? `${existing};${inlineStyle.join(';')}` : inlineStyle.join(';');
    if (merged) {
      cloneEl.setAttribute('style', merged);
    }
  });

  // Serialise the clone to an SVG string.
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgClone);

  // Build a data URL for the SVG.
  const svgDataUrl =
    'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);

  // Load the SVG into an Image, draw onto canvas, extract PNG.
  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // 2x device pixel ratio for a higher-resolution export.
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('canvas 2d context unavailable'));
        return;
      }

      // Fill with a white background so transparent SVG areas don't become
      // black in the PNG (PNG supports transparency but most recipients
      // expect a white background).
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.scale(dpr, dpr);
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('canvas.toBlob returned null'));
          return;
        }
        triggerDownload(blob, filename);
        resolve();
      }, 'image/png');
    };

    img.onerror = () => {
      reject(new Error('Failed to load SVG as image for PNG export'));
    };

    img.src = svgDataUrl;
  });
}

// ---------------------------------------------------------------------------
// Shared download helper
// ---------------------------------------------------------------------------

/**
 * Trigger a file download by creating a temporary hidden <a> element,
 * simulating a click, then cleaning up the object URL.
 */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  // Must be in the DOM for Firefox to fire the click.
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Defer revocation so the browser has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ---------------------------------------------------------------------------
// Filename helpers
// ---------------------------------------------------------------------------

/**
 * Build an export filename with today's date in YYYY-MM-DD format.
 *
 * @param title      Group title (e.g. "Homepage").
 * @param extension  File extension without leading dot (e.g. "csv", "png").
 */
export function buildExportFilename(title: string, extension: string): string {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  // Replace characters that are illegal in filenames on common OSes.
  const safeTitle = title.replace(/[/\\:*?"<>|]/g, '-');
  return `${safeTitle}-${yyyy}-${mm}-${dd}.${extension}`;
}
