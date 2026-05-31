import * as React from "react"

import { cn } from "@/lib/utils"

/** Footprint vocabulary — column span × row declaration per ADR-051. */
export type CardFootprint = "tile" | "wide" | "panel" | "full";

type CardProps = React.ComponentProps<"div"> & {
  size?: "default" | "sm";
  /** Footprint vocabulary (ADR-051) — controls column span in the Grid primitive.
   *  tile=1col · wide=2col · panel=3col · full=4col */
  footprint?: CardFootprint;
  /** Row span declaration for the future grid engine (ADR-051).
   *  Recorded as data-row-span only — does NOT emit a row-span CSS class and
   *  does NOT impose a fixed height.  Card height stays content-driven. */
  rowSpan?: 1 | 2;
};

/** Column-span classes for each footprint value (ADR-051).
 *  Grid is 1→2→4 columns (<768px / ≥768px / ≥1024px).
 *  Column spans are enforced now; row heights stay content-driven until
 *  the future grid engine ships (ADR-051 "Column rule now vs. later"). */
const footprintColSpan: Record<CardFootprint, string> = {
  tile:  "col-span-1",
  wide:  "col-span-1 md:col-span-2",
  panel: "col-span-1 md:col-span-2 lg:col-span-3",
  full:  "col-span-1 md:col-span-2 lg:col-span-4",
};

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
      // rowSpan is documented-only for the future grid engine — stored as a data
      // attribute so the engine can read it without any CSS side-effect today.
      data-row-span={rowSpan}
      className={cn(
        // Provisional glass surface (PROVISIONAL — B3 contrast gate sets final value).
        // bg-[rgb(var(--card-glass))] applies the translucent glass background;
        // backdrop-filter is set inline since there is no Tailwind utility for
        // the exact blur+saturate combination.
        "card-glass",
        "group/card flex flex-col gap-4 overflow-hidden rounded-xl py-4 text-sm text-card-foreground ring-1 ring-foreground/10 has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:gap-3 data-[size=sm]:py-3 data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
        footprint !== undefined ? footprintColSpan[footprint] : undefined,
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
        "font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm",
        className
      )}
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
      className={cn("px-4 group-data-[size=sm]/card:px-3", className)}
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
