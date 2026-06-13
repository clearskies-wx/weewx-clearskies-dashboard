// sticky-table.tsx — Horizontally scrollable table with a sticky first column.
//
// Exports:
//   StickyTable — wraps an HTML <table> in a ScrollFadeContainer with CSS that
//                 makes the first column sticky.
//
// Intended use: Reports page NOAA table and any other wide data table that
// must remain readable on narrow mobile viewports.
//
// A11y (WCAG 2.1 AA):
//   - The <table> element receives an aria-label from the required `label` prop.
//   - Callers supply proper <thead>/<tbody>/<th scope="col"> structure; this
//     component does NOT generate rows, so semantic table markup is enforced
//     by convention (JSDoc makes this clear).
//   - The scroll container (ScrollFadeContainer) already provides role="region"
//     and aria-label — the table's own aria-label provides the more specific name.
//   - The sticky first column uses position:sticky with an opaque background so
//     scrolling content does not show through (WCAG 1.4.1 — not color-only; the
//     visual separation is also provided by the sticky position itself).
//
// Sticky column implementation:
//   - CSS is applied via a <style> scoped to a data attribute on the table,
//     avoiding global style pollution.
//   - th:first-child and td:first-child receive position:sticky + left:0 +
//     an opaque background that matches the card surface.

import * as React from "react";
import { cn } from "@/lib/utils";
import { ScrollFadeContainer } from "./scroll-fade";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StickyTableProps {
  /**
   * Accessible label for the table.
   * Passed to aria-label on the <table> element.
   * Also used as the aria-label for the surrounding scroll region.
   * Example: "Monthly weather report"
   */
  label: string;
  /**
   * The table's content — must include proper <thead>, <tbody>, and
   * <th scope="col"> / <th scope="row"> elements for screen reader semantics.
   *
   * Example:
   *   <thead>
   *     <tr>
   *       <th scope="col">Date</th>
   *       <th scope="col">Max Temp</th>
   *     </tr>
   *   </thead>
   *   <tbody>
   *     <tr>
   *       <td>Jan 2025</td>
   *       <td>72 °F</td>
   *     </tr>
   *   </tbody>
   */
  children: React.ReactNode;
  /** Optional extra className on the <table> element. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * A horizontally-scrollable table wrapper for mobile viewports.
 * The first column is sticky (stays in view while the user scrolls right).
 * A gradient fade on the right edge hints that more columns exist off-screen.
 *
 * Usage:
 *   <StickyTable label="Monthly weather report">
 *     <thead>
 *       <tr>
 *         <th scope="col">Date</th>
 *         <th scope="col">Max Temp</th>
 *         <th scope="col">Min Temp</th>
 *       </tr>
 *     </thead>
 *     <tbody>
 *       <tr>
 *         <td>Jan</td>
 *         <td>72 °F</td>
 *         <td>48 °F</td>
 *       </tr>
 *     </tbody>
 *   </StickyTable>
 */
export function StickyTable({ label, children, className }: StickyTableProps) {
  // Generate a unique attribute value so the scoped CSS only targets THIS table.
  // React.useId() is stable across renders and unique per component instance.
  const uid = React.useId();
  // Convert React's ":r0:" format to a valid CSS ident by stripping non-alphanum chars
  const scopeId = `sticky-table-${uid.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <>
      {/* Scoped styles for sticky first column and table base styles.
          We use a data attribute selector so the styles are tightly scoped to
          this instance and don't leak to other tables on the page. */}
      <style>{`
        [data-sticky-table="${scopeId}"] th:first-child,
        [data-sticky-table="${scopeId}"] td:first-child {
          position: sticky;
          left: 0;
          z-index: 1;
          /* Opaque background required so content scrolling behind the column
             doesn't bleed through. Falls back through card-bg → background. */
          background: var(--card, var(--background));
        }

        [data-sticky-table="${scopeId}"] tr:nth-child(even) td:first-child {
          /* Keep alternating row bg on sticky cell — must match the row bg */
          background: color-mix(in oklch, var(--muted) 30%, var(--card, var(--background)));
        }
      `}</style>

      <ScrollFadeContainer aria-label={label}>
        <table
          data-sticky-table={scopeId}
          aria-label={label}
          className={cn(
            // Full width within the scroll container
            "w-full",
            // Collapse borders for a clean grid look
            "border-collapse",
            // Inherit card text styles
            "text-card-foreground text-sm",
            className
          )}
        >
          {/* Inner styles applied via Tailwind on the children via CSS cascade.
              Callers provide thead/tbody/tr/th/td; we style them via the
              data attribute selector above plus these base utility classes. */}
          {/* We wrap children in a fragment but provide styling via a CSS layer.
              The utility classes below apply to the table's descendant cells
              via the global style block above (scoped by data-sticky-table). */}
          {children}
        </table>
      </ScrollFadeContainer>

      {/* Cell padding and alternating rows applied via a second scoped block.
          This keeps the JSX clean while still giving callers full control over
          adding their own classNames to th/td elements if needed. */}
      <style>{`
        [data-sticky-table="${scopeId}"] th,
        [data-sticky-table="${scopeId}"] td {
          /* Compact padding for mobile (px-2 py-1 equivalent) */
          padding: 0.25rem 0.5rem;
          /* Left-align by default; callers can override per-cell */
          text-align: left;
          /* Prevent cell borders from collapsing stickiness */
          border-bottom: 1px solid var(--border);
          /* Prevent text from wrapping in cells — tables should scroll, not reflow */
          white-space: nowrap;
        }

        [data-sticky-table="${scopeId}"] th {
          /* Header cells: slightly bolder, muted foreground */
          font-weight: 600;
          color: var(--muted-foreground);
          /* Slightly larger bottom border for header row */
          border-bottom-width: 2px;
        }

        [data-sticky-table="${scopeId}"] tr:nth-child(even) td {
          /* Alternating row background: muted at 30% opacity over card bg */
          background: color-mix(in oklch, var(--muted) 30%, var(--card, var(--background)));
        }
      `}</style>
    </>
  );
}
