import * as React from "react"

import { cn } from "@/lib/utils"

/** Footprint vocabulary â€” column span Ã— row declaration per ADR-051. */
export type CardFootprint = "tile" | "wide" | "panel" | "full";

type CardProps = React.ComponentProps<"div"> & {
  size?: "default" | "sm";
  /** Footprint vocabulary (ADR-051) â€” controls column span in the Grid primitive.
   *  tile=1col Â· wide=2col Â· panel=3col Â· full=4col */
  footprint?: CardFootprint;
  /**
   * Row span — controls how many quarter-row tracks the card occupies at md+ (≥768px).
   * Mobile rows are always auto-height.
   *   "quarter" = md:row-span-1  (1 × --card-quarter-row  = 2.75rem)
   *   "half"    = md:row-span-2  (2 × --card-quarter-row  = 5.5rem)
   *   1         = md:row-span-4  (4 × --card-quarter-row  = 11rem, default data card)
   *   2         = md:row-span-8  (8 × --card-quarter-row  = 22rem, tall card)
   *   2.5       = md:row-span-10 (10 × --card-quarter-row = 27.5rem, extra-tall card)
   */
  rowSpan?: "quarter" | "half" | 1 | 2 | 2.5;
};

/** Column-span classes for each footprint value (ADR-051).
 *  Grid is 1â†’2â†’4 columns (<768px / â‰¥768px / â‰¥1024px).
 *  Column spans are enforced now; row heights use --card-row (11rem) track at md+. */
const footprintColSpan: Record<CardFootprint, string> = {
  tile:  "col-span-1",
  wide:  "col-span-1 md:col-span-2",
  panel: "col-span-1 md:col-span-2 lg:col-span-3",
  full:  "col-span-1 md:col-span-2 lg:col-span-4",
};

/**
 * Row-span class for the card’s grid placement (md+ only).
 * On mobile, grid-auto-rows is `auto` so row-span has no effect;
 * the md: prefix ensures these only take effect at >=768px.
 *
 * Base track is --card-quarter-row (2.75rem desktop / 3.25rem mobile).
 *   "quarter" -> md:row-span-1  (1 track  = 2.75rem)   — controls strips, headers
 *   "half"    -> md:row-span-2  (2 tracks = 5.5rem)    — hero, page-header
 *   1         -> md:row-span-4  (4 tracks = 11rem)     — standard data card (default)
 *   2         -> md:row-span-8  (8 tracks = 22rem)     — tall/chart cards
 *   2.5       -> md:row-span-10 (10 tracks = 27.5rem)  — extra-tall cards (radar, webcam)
 */
function rowSpanClass(rowSpan: "quarter" | "half" | 1 | 2 | 2.5 | undefined): string {
  switch (rowSpan) {
    case "quarter": return "md:row-span-1";
    case "half":    return "md:row-span-2";
    case 2.5:       return "md:row-span-10";
    case 2:         return "md:row-span-8";
    default:        return "md:row-span-4";
  }
}

/**
 * Min-height class derived from rowSpan, so each card fills its grid tracks
 * correctly on mobile (where row-span has no effect).
 */
function minHeightClass(rowSpan: "quarter" | "half" | 1 | 2 | 2.5 | undefined): string {
  // min-height applies on mobile only (< md) where grid rows are auto-height.
  // At md+, rigid grid tracks enforce card height on the Now page, and non-Now
  // pages use auto-rows where cards size to content. Applying min-height at md+
  // conflicts with mb-[var(--gap-grid)] because the min-height fills the entire
  // grid area, leaving no room for the margin to create visual spacing.
  switch (rowSpan) {
    case "quarter": return "min-h-[var(--card-quarter-row)] md:min-h-0";
    case "half":    return "min-h-[5.5rem] md:min-h-0";
    default:        return "min-h-[var(--card-row)] md:min-h-0";
  }
}

function Card({
  className,
  size = "default",
  footprint,
  rowSpan,
  ...props
}: CardProps) {
  return (
    <div
      data-slot="card"
      data-size={size}
      data-row-span={rowSpan}
      className={cn(
        // Provisional glass surface (PROVISIONAL â€” B3 contrast gate sets final value).
        // bg-[rgb(var(--card-glass))] applies the translucent glass background;
        // backdrop-filter is set inline since there is no Tailwind utility for
        // the exact blur+saturate combination.
        "card-glass",
        "group/card flex flex-col gap-1 overflow-hidden rounded-xl py-2.5 text-sm text-card-foreground ring-1 ring-foreground/10 has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:gap-0.5 data-[size=sm]:py-2 data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
        minHeightClass(rowSpan),
        "mb-[var(--gap-grid)]",
        footprint !== undefined ? footprintColSpan[footprint] : undefined,
        rowSpanClass(rowSpan),
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-4 group-data-[size=sm]/card:px-3 has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-4 group-data-[size=sm]/card:[.border-b]:pb-3",
        className
      )}
      {...props}
    />
  )
}

// CardTitle renders as a <div> by default so it does not impose a heading level
// on callers that manage headings themselves (e.g. pages that use <h2> inside
// CardHeader directly).  When the card heading should be a landmark heading,
// pass `as="h2"` (or h3, etc.) explicitly.
function CardTitle({
  className,
  as: Tag = "div",
  ...props
}: React.ComponentProps<"div"> & { as?: "div" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" }) {
  return (
    <Tag
      data-slot="card-title"
      className={cn(
        "font-heading leading-snug font-semibold pb-0.5 border-b border-border group-data-[size=sm]/card:text-sm",
        className
      )}
      style={{ fontSize: 'var(--text-card-title, 0.82rem)' }}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-4 group-data-[size=sm]/card:px-3 overflow-hidden flex-1 min-h-0 flex flex-col", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-xl border-t bg-muted/50 p-4 group-data-[size=sm]/card:p-3",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}

