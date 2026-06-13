// scroll-fade.tsx — Horizontal scroll container with trailing-edge fade affordance.
//
// Exports:
//   ScrollFadeContainer — wraps horizontally-scrollable content and shows a
//                         right-edge gradient fade when more content is off-screen.
//
// A11y (WCAG 2.1 AA):
//   - The gradient overlay is purely decorative: aria-hidden="true", pointer-events:none
//   - The scroll container receives tabIndex={0} and role="region" + aria-label so
//     keyboard users can focus it and scroll with arrow keys / Home / End.
//   - The aria-label prop is required for callers; defaults to "Scrollable content"
//     if omitted, but callers should always pass a meaningful label.
//
// Performance:
//   - Scroll listener is passive (does not prevent scroll).
//   - Show/hide uses a CSS opacity transition rather than toggling display.
//   - ResizeObserver updates fade visibility when container size changes
//     (e.g. viewport resize or dynamic content insertion).

import * as React from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScrollFadeContainerProps {
  /** Content to render inside the scrollable container. */
  children: React.ReactNode;
  /**
   * Accessible label for the scroll region.
   * Passed to aria-label on the scroll container.
   * Provide a meaningful description (e.g. "Monthly weather data table").
   * Defaults to "Scrollable content".
   */
  "aria-label"?: string;
  /** Optional extra className on the outer wrapper div. */
  className?: string;
  /**
   * Width of the fade gradient in pixels.
   * Defaults to 40.
   */
  fadeWidth?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * A horizontally-scrollable container that shows a right-edge gradient fade
 * affordance when content overflows. The fade disappears when the user scrolls
 * to the end of the content.
 *
 * Usage:
 *   <ScrollFadeContainer aria-label="Sensor readings">
 *     <div className="flex flex-row gap-2">
 *       {items.map(...)}
 *     </div>
 *   </ScrollFadeContainer>
 */
export function ScrollFadeContainer({
  children,
  "aria-label": ariaLabel = "Scrollable content",
  className,
  fadeWidth = 40,
}: ScrollFadeContainerProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [showFade, setShowFade] = React.useState(false);

  // Determine whether the trailing-edge fade should be visible.
  // Threshold of 4px avoids false-positives from sub-pixel rounding.
  const updateFade = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
    setShowFade(!atEnd);
  }, []);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    // Initial check
    updateFade();

    // Passive scroll listener — does not block scrolling
    el.addEventListener("scroll", updateFade, { passive: true });

    // ResizeObserver handles container resize and content size changes
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(updateFade);
      ro.observe(el);
    }

    return () => {
      el.removeEventListener("scroll", updateFade);
      ro?.disconnect();
    };
  }, [updateFade]);

  return (
    // Outer wrapper: relative positioning context for the fade overlay
    <div className={cn("relative", className)}>
      {/* Scroll container */}
      <div
        ref={scrollRef}
        // tabIndex=0 makes this focusable for keyboard scroll (arrow keys, Home/End)
        tabIndex={0}
        role="region"
        aria-label={ariaLabel}
        className={cn(
          "overflow-x-auto",
          // Visible focus ring for keyboard users (WCAG 2.1 SC 2.4.7)
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        )}
      >
        {children}
      </div>

      {/* Trailing-edge fade gradient — purely decorative */}
      <div
        aria-hidden="true"
        style={{
          // Width of the fade zone
          width: fadeWidth,
          // Gradient from transparent to the page background color
          background: "linear-gradient(to right, transparent, var(--background))",
        }}
        className={cn(
          // Absolute positioning: right edge, full height of the container
          "absolute right-0 top-0 h-full",
          // Decorative only — must not capture pointer events
          "pointer-events-none",
          // Fade transition on show/hide (150ms so it doesn't feel laggy)
          "transition-opacity duration-150",
          showFade ? "opacity-100" : "opacity-0"
        )}
      />
    </div>
  );
}
