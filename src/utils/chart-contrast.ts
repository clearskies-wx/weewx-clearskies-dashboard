// chart-contrast.ts — Ensures chart series colors meet WCAG 2.1 non-text
// contrast minimum (3:1) against the card glass background in both themes.
// Applied by ConfigDrivenChart for all operator-defined colors.

// Card glass backgrounds per theme (effective RGB from index.css --card-glass)
const LIGHT_BG: [number, number, number] = [255, 255, 255];
const DARK_BG: [number, number, number] = [30, 35, 55];

const MIN_CONTRAST = 3.0;

function parseHex(hex: string): [number, number, number] | null {
  let h = hex.replace('#', '');
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return null;
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function sRGBtoLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * sRGBtoLinear(r) + 0.7152 * sRGBtoLinear(g) + 0.0722 * sRGBtoLinear(b);
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6; break;
      case gn: h = ((bn - rn) / d + 2) / 6; break;
      case bn: h = ((rn - gn) / d + 4) / 6; break;
    }
  }
  return [h, s, l];
}

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
}

/**
 * If a hex color's contrast against the current theme's card background is
 * below 3:1, adjusts lightness (preserving hue and saturation) until it
 * meets the threshold. Non-hex values (CSS variables, named colors) pass
 * through unchanged.
 */
export function ensureChartContrast(color: string, isDark: boolean): string {
  const rgb = parseHex(color);
  if (!rgb) return color;

  const bg = isDark ? DARK_BG : LIGHT_BG;
  const bgLum = relativeLuminance(...bg);
  const colorLum = relativeLuminance(...rgb);

  if (contrastRatio(colorLum, bgLum) >= MIN_CONTRAST) return color;

  const [h, s, l] = rgbToHsl(...rgb);
  // Lighten for dark backgrounds, darken for light backgrounds
  const step = isDark ? 0.03 : -0.03;
  let adj = l;

  for (let i = 0; i < 40; i++) {
    adj += step;
    if (adj > 0.95 || adj < 0.05) break;
    const [ar, ag, ab] = hslToRgb(h, s, adj);
    if (contrastRatio(relativeLuminance(ar, ag, ab), bgLum) >= MIN_CONTRAST) {
      return rgbToHex(ar, ag, ab);
    }
  }

  return isDark ? '#cbd5e1' : '#1e293b';
}
