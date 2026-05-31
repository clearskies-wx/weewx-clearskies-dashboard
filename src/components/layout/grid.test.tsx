// grid.test.tsx — Unit tests for the Grid layout primitive (ADR-051 D-A4.3).
//
// Strategy: render Grid with children and verify the responsive grid classes
// are present, the container cap classes are present, and className merging
// works.  We cannot test CSS computed values in jsdom, so we verify the class
// names that encode the layout intent — the same contracts the future grid
// engine depends on.

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Grid } from './grid';

describe('Grid', () => {
  it('renders a div container', () => {
    const { container } = render(<Grid />);
    expect(container.firstElementChild?.tagName).toBe('DIV');
  });

  it('applies the 1-column default class (mobile-first)', () => {
    const { container } = render(<Grid />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('grid-cols-1');
  });

  it('applies the 2-column responsive class (md breakpoint)', () => {
    const { container } = render(<Grid />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('md:grid-cols-2');
  });

  it('applies the 4-column responsive class (lg breakpoint)', () => {
    const { container } = render(<Grid />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('lg:grid-cols-4');
  });

  it('applies the --gap-grid gap token', () => {
    const { container } = render(<Grid />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('gap-[var(--gap-grid)]');
  });

  it('applies the --container-max max-width token', () => {
    const { container } = render(<Grid />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('max-w-[var(--container-max)]');
  });

  it('applies mx-auto for centering', () => {
    const { container } = render(<Grid />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('mx-auto');
  });

  it('renders children inside the grid container', () => {
    const { getByText } = render(
      <Grid>
        <div>child-a</div>
        <div>child-b</div>
      </Grid>,
    );
    expect(getByText('child-a')).toBeDefined();
    expect(getByText('child-b')).toBeDefined();
  });

  it('merges caller className', () => {
    const { container } = render(<Grid className="extra-grid-class" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('extra-grid-class');
    // Core classes still present after merge
    expect(el.className).toContain('lg:grid-cols-4');
  });
});
