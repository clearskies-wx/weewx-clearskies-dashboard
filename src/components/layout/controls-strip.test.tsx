// controls-strip.test.tsx — Unit tests for ControlsStrip (ADR-051 D-A4.5).
//
// A11y-critical contracts tested here:
// - Renders a <section> element (landmark role — WCAG 2.4.1).
// - aria-label is forwarded to the section for screen reader announcement.
// - Children (controls) are rendered inside the section.
// - full footprint is applied to the outer Card (lg:col-span-4).
// - className merging works.

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ControlsStrip } from './controls-strip';

describe('ControlsStrip', () => {
  // -------------------------------------------------------------------------
  // Landmark semantics (a11y — WCAG 2.4.1 / 2.4.6)
  // -------------------------------------------------------------------------

  it('renders a section element with the given aria-label', () => {
    const { getByRole } = render(
      <ControlsStrip aria-label="Forecast controls">
        <button>7 days</button>
      </ControlsStrip>,
    );
    // getByRole('region') targets <section> with an aria-label
    const section = getByRole('region', { name: 'Forecast controls' });
    expect(section).toBeDefined();
  });

  it('renders a section element without error when aria-label is omitted', () => {
    // aria-label is optional; the component must still render without throwing
    expect(() =>
      render(
        <ControlsStrip>
          <button>Toggle</button>
        </ControlsStrip>,
      ),
    ).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // Children (controls)
  // -------------------------------------------------------------------------

  it('renders children inside the controls section', () => {
    const { getByText } = render(
      <ControlsStrip aria-label="Records controls">
        <button>Last 7 days</button>
        <button>Last 30 days</button>
      </ControlsStrip>,
    );
    expect(getByText('Last 7 days')).toBeDefined();
    expect(getByText('Last 30 days')).toBeDefined();
  });

  it('renders without children (no error)', () => {
    expect(() =>
      render(<ControlsStrip aria-label="Empty strip" />),
    ).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // Footprint — outer Card must carry full footprint
  // -------------------------------------------------------------------------

  it('outer card has the full footprint class (lg:col-span-4)', () => {
    const { container } = render(
      <ControlsStrip aria-label="Controls" />,
    );
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain('lg:col-span-4');
  });

  // -------------------------------------------------------------------------
  // className passthrough
  // -------------------------------------------------------------------------

  it('merges extra className onto the outer card', () => {
    const { container } = render(
      <ControlsStrip aria-label="Controls" className="extra-strip-class" />,
    );
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain('extra-strip-class');
  });
});
