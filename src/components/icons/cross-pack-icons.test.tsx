/**
 * cross-pack-icons.test.tsx — Render smoke tests for the 3 cross-pack
 * inline SVG components (ADR-050).
 *
 * Verifies:
 *   - Each component renders an <svg> element.
 *   - aria-hidden="true" is set (decorative in usage context; accessible name
 *     comes from surrounding label/live region per rules/coding.md §5.5).
 *   - focusable="false" is set (IE/Edge SVG focus quirk guard).
 *   - Default size (20px) is applied.
 *   - Custom size prop is applied.
 *   - currentColor fill/stroke is used (so CSS color classes work).
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { UvIndex } from './uv-index';
import { Flood } from './flood';
import { Tsunami } from './tsunami';

// ---------------------------------------------------------------------------
// Helper: shared assertions for all three components
// ---------------------------------------------------------------------------

function assertSvgAttributes(container: HTMLElement, size: number) {
  const svg = container.querySelector('svg');
  expect(svg, 'must render an <svg> element').not.toBeNull();
  expect(svg!.getAttribute('aria-hidden'), 'SVG must be aria-hidden').toBe('true');
  expect(svg!.getAttribute('focusable'), 'SVG must be focusable=false').toBe('false');
  expect(svg!.getAttribute('width'), `width must be ${size}`).toBe(String(size));
  expect(svg!.getAttribute('height'), `height must be ${size}`).toBe(String(size));
}

// ---------------------------------------------------------------------------
// UvIndex (tabler:uv-index)
// ---------------------------------------------------------------------------

describe('UvIndex cross-pack icon', () => {
  it('renders an SVG with default size 20', () => {
    const { container } = render(<UvIndex />);
    assertSvgAttributes(container, 20);
  });

  it('respects size prop', () => {
    const { container } = render(<UvIndex size={24} />);
    const svg = container.querySelector('svg');
    expect(svg!.getAttribute('width')).toBe('24');
    expect(svg!.getAttribute('height')).toBe('24');
  });

  it('uses stroke="currentColor" (line icon)', () => {
    const { container } = render(<UvIndex />);
    const svg = container.querySelector('svg');
    expect(svg!.getAttribute('stroke')).toBe('currentColor');
  });

  it('has no fill (fill="none" for stroke-only icon)', () => {
    const { container } = render(<UvIndex />);
    const svg = container.querySelector('svg');
    expect(svg!.getAttribute('fill')).toBe('none');
  });

  it('contains path elements (UV-index glyph paths)', () => {
    const { container } = render(<UvIndex />);
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Flood (material-symbols:flood-outline-rounded)
// ---------------------------------------------------------------------------

describe('Flood cross-pack icon', () => {
  it('renders an SVG with default size 20', () => {
    const { container } = render(<Flood />);
    assertSvgAttributes(container, 20);
  });

  it('respects size prop', () => {
    const { container } = render(<Flood size={32} />);
    const svg = container.querySelector('svg');
    expect(svg!.getAttribute('width')).toBe('32');
    expect(svg!.getAttribute('height')).toBe('32');
  });

  it('uses fill="currentColor" (filled icon)', () => {
    const { container } = render(<Flood />);
    const svg = container.querySelector('svg');
    expect(svg!.getAttribute('fill')).toBe('currentColor');
  });

  it('uses Material Symbols viewBox (0 -960 960 960)', () => {
    const { container } = render(<Flood />);
    const svg = container.querySelector('svg');
    expect(svg!.getAttribute('viewBox')).toBe('0 -960 960 960');
  });

  it('contains exactly one path element', () => {
    const { container } = render(<Flood />);
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Tsunami (mdi:tsunami — fallback used; carbon:tsunami weight mismatch)
// ---------------------------------------------------------------------------

describe('Tsunami cross-pack icon', () => {
  it('renders an SVG with default size 20', () => {
    const { container } = render(<Tsunami />);
    assertSvgAttributes(container, 20);
  });

  it('respects size prop', () => {
    const { container } = render(<Tsunami size={28} />);
    const svg = container.querySelector('svg');
    expect(svg!.getAttribute('width')).toBe('28');
    expect(svg!.getAttribute('height')).toBe('28');
  });

  it('uses fill="currentColor" (filled icon)', () => {
    const { container } = render(<Tsunami />);
    const svg = container.querySelector('svg');
    expect(svg!.getAttribute('fill')).toBe('currentColor');
  });

  it('uses standard 24x24 viewBox', () => {
    const { container } = render(<Tsunami />);
    const svg = container.querySelector('svg');
    expect(svg!.getAttribute('viewBox')).toBe('0 0 24 24');
  });

  it('contains path elements (wave glyph paths)', () => {
    const { container } = render(<Tsunami />);
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBeGreaterThan(0);
  });
});
