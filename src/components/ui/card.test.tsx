// card.test.tsx — Unit tests for the Card footprint prop and rowSpan attribute
// (ADR-051 acceptance criteria for D-A4.2).
//
// Strategy: render Card with each footprint value and verify the correct
// col-span classes appear; verify rowSpan writes only a data attribute and
// does NOT emit a row-span CSS class; verify className merging works.

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Card } from './card';

// ---------------------------------------------------------------------------
// Footprint → col-span class mapping
// ---------------------------------------------------------------------------

describe('Card footprint prop', () => {
  it('tile: applies col-span-1 only', () => {
    const { container } = render(<Card footprint="tile" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('col-span-1');
    expect(el.className).not.toMatch(/md:col-span/);
    expect(el.className).not.toMatch(/lg:col-span/);
  });

  it('wide: applies col-span-1 md:col-span-2', () => {
    const { container } = render(<Card footprint="wide" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('col-span-1');
    expect(el.className).toContain('md:col-span-2');
    expect(el.className).not.toMatch(/lg:col-span/);
  });

  it('panel: applies col-span-1 md:col-span-2 lg:col-span-3', () => {
    const { container } = render(<Card footprint="panel" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('col-span-1');
    expect(el.className).toContain('md:col-span-2');
    expect(el.className).toContain('lg:col-span-3');
  });

  it('full: applies col-span-1 md:col-span-2 lg:col-span-4', () => {
    const { container } = render(<Card footprint="full" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('col-span-1');
    expect(el.className).toContain('md:col-span-2');
    expect(el.className).toContain('lg:col-span-4');
  });

  it('no footprint: emits no col-span class', () => {
    const { container } = render(<Card />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).not.toMatch(/col-span/);
  });

  it('merges caller className with footprint classes', () => {
    const { container } = render(<Card footprint="tile" className="extra-class" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('col-span-1');
    expect(el.className).toContain('extra-class');
  });
});

// ---------------------------------------------------------------------------
// rowSpan — data-attribute + md: row-span CSS class
// ---------------------------------------------------------------------------

describe('Card rowSpan prop', () => {
  it('rowSpan=1 sets data-row-span="1" and md:row-span-4', () => {
    const { container } = render(<Card rowSpan={1} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.dataset['rowSpan']).toBe('1');
    expect(el.className).toContain('md:row-span-4');
  });

  it('rowSpan=2 sets data-row-span="2" and md:row-span-8', () => {
    const { container } = render(<Card rowSpan={2} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.dataset['rowSpan']).toBe('2');
    expect(el.className).toContain('md:row-span-8');
  });

  it('rowSpan=2.5 sets data-row-span="2.5" and md:row-span-10', () => {
    const { container } = render(<Card rowSpan={2.5} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.dataset['rowSpan']).toBe('2.5');
    expect(el.className).toContain('md:row-span-10');
  });

  it('without rowSpan, data-row-span attribute is absent', () => {
    const { container } = render(<Card />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.hasAttribute('data-row-span')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Glass surface — card-glass class is applied
// ---------------------------------------------------------------------------

describe('Card glass surface', () => {
  it('applies card-glass class for the provisional glass surface', () => {
    const { container } = render(<Card />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('card-glass');
  });
});
