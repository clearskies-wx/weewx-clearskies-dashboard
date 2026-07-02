// chart-fullscreen.tsx — Reusable fullscreen overlay for chart cards.
//
// Exports:
//   ChartFullscreenButton  — expand icon button for card headers
//   ChartFullscreenOverlay — fixed-position fullscreen overlay that wraps chart content
//
// A11y (WCAG 2.1 AA):
//   - role="dialog" + aria-modal="true" on the overlay
//   - aria-label on both the expand and close buttons (no icon-only unlabeled controls)
//   - Focus trap: Tab/Shift+Tab cycles within the overlay while open
//   - Return focus: saves a ref to the trigger element, restores on close
//   - Escape key closes the overlay
//   - Body scroll lock while overlay is open (overflow-hidden on document.body)
//   - Fade-in/fade-out via CSS opacity transition (200ms)
//   - All icon elements are aria-hidden (the button's aria-label carries the name)

import * as React from "react";
import { useTranslation } from "react-i18next";
import { ArrowsOut, X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// ChartFullscreenButton
// ---------------------------------------------------------------------------

export interface ChartFullscreenButtonProps {
  /** Called when the user activates the expand button. */
  onClick: () => void;
  /** Optional extra className for the button element. */
  className?: string;
}

/**
 * A small expand-icon button intended for placement in a card header's action
 * area. Clicking it opens the chart fullscreen overlay.
 *
 * Usage:
 *   <CardAction>
 *     <ChartFullscreenButton onClick={() => setFullscreen(true)} />
 *   </CardAction>
 */
export const ChartFullscreenButton = React.forwardRef<
  HTMLButtonElement,
  ChartFullscreenButtonProps
>(({ onClick, className }, ref) => {
  const { t } = useTranslation('charts');
  return (
    <button
      ref={ref}
      type="button"
      aria-label={t('chartFullscreen.viewButton')}
      onClick={onClick}
      className={cn(
        // Size, shape, and base appearance
        "inline-flex items-center justify-center rounded-md",
        "size-7 text-muted-foreground",
        // Hover state — subtle fill
        "hover:bg-muted hover:text-foreground",
        // Focus-visible ring (WCAG 2.1 SC 2.4.7 — must not be outline:none)
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        // Transition
        "transition-colors duration-150",
        className
      )}
    >
      <ArrowsOut aria-hidden="true" className="size-4" />
    </button>
  );
});
ChartFullscreenButton.displayName = "ChartFullscreenButton";

// ---------------------------------------------------------------------------
// Focus trap hook
// ---------------------------------------------------------------------------

/** Returns all focusable elements within a container. */
function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
        'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => !el.closest("[aria-hidden='true']"));
}

/**
 * Traps keyboard focus within `containerRef` while `active` is true.
 * Tab moves to next focusable; Shift+Tab moves to previous.
 * Focus wraps at both ends.
 */
function useFocusTrap(
  containerRef: React.RefObject<HTMLElement | null>,
  active: boolean
): void {
  React.useEffect(() => {
    if (!active) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const container = containerRef.current;
      if (!container) return;

      const focusable = getFocusable(container);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        // Shift+Tab: if focus is on first element, wrap to last
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab: if focus is on last element, wrap to first
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [active, containerRef]);
}

// ---------------------------------------------------------------------------
// ChartFullscreenOverlay
// ---------------------------------------------------------------------------

export interface ChartFullscreenOverlayProps {
  /** Whether the overlay is currently open. */
  isOpen: boolean;
  /** Called when the overlay should be closed (close button, Escape, or backdrop click). */
  onClose: () => void;
  /** The chart (or any content) to render at full viewport size. */
  children: React.ReactNode;
  /** Optional accessible label for the dialog region. Defaults to "Chart fullscreen view". */
  "aria-label"?: string;
  /** Optional extra className on the overlay container. */
  className?: string;
}

/**
 * Fixed-position fullscreen overlay that renders `children` (typically a chart)
 * at full viewport size with a close button.
 *
 * Usage:
 *   <ChartFullscreenOverlay isOpen={fullscreen} onClose={() => setFullscreen(false)}>
 *     <ResponsiveContainer width="100%" height="100%">
 *       {chart}
 *     </ResponsiveContainer>
 *   </ChartFullscreenOverlay>
 */
export function ChartFullscreenOverlay({
  isOpen,
  onClose,
  children,
  "aria-label": ariaLabelProp,
  className,
}: ChartFullscreenOverlayProps) {
  const { t } = useTranslation('charts');
  const ariaLabel = ariaLabelProp ?? t('configDriven.fullscreen');
  // Ref for the dialog container — used for focus trap and initial focus.
  const dialogRef = React.useRef<HTMLDivElement>(null);

  // Ref for the element that had focus before the overlay opened.
  // We restore focus here on close (WCAG 2.4.3 Focus Order).
  const previousFocusRef = React.useRef<HTMLElement | null>(null);

  // --- Body scroll lock ---
  React.useEffect(() => {
    if (isOpen) {
      // Save the element that was focused before opening
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      // Lock body scroll
      document.body.style.overflow = "hidden";
      // Move focus into the dialog on the next frame so the overlay is rendered
      requestAnimationFrame(() => {
        if (dialogRef.current) {
          const focusable = getFocusable(dialogRef.current);
          if (focusable.length > 0) {
            focusable[0].focus();
          } else {
            dialogRef.current.focus();
          }
        }
      });
    } else {
      // Unlock body scroll
      document.body.style.overflow = "";
      // Return focus to the element that opened the overlay
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
        previousFocusRef.current = null;
      }
    }

    return () => {
      // Clean up scroll lock if component unmounts while open
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // --- Escape key handler ---
  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // --- Focus trap ---
  useFocusTrap(dialogRef, isOpen);

  // --- Backdrop click handler ---
  // Only close when the user clicks the backdrop itself (the overlay bg),
  // not when clicking within the content area.
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // We always render the overlay in the DOM so CSS transitions work cleanly.
  // Visibility and pointer-events are controlled by isOpen.
  return (
    <div
      // Invisible when closed; aria-hidden keeps it out of the a11y tree when not open.
      aria-hidden={!isOpen}
      className={cn(
        // Base: fixed full viewport, high z-index, background
        "fixed inset-0 z-50 bg-background",
        // Flex layout: close button top-right, content fills rest
        "flex flex-col",
        // Fade transition (200ms opacity)
        "transition-opacity duration-200",
        isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        className
      )}
      // Backdrop click closes if clicking outside the content
      onClick={handleBackdropClick}
    >
      {/* Dialog region — role="dialog" with a11y attributes */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        // tabIndex -1 allows programmatic focus on the container itself as fallback
        tabIndex={-1}
        className={cn(
          "relative flex flex-col w-full h-full",
          // Outline on the container only when focused programmatically (not tab-visible)
          "outline-none"
        )}
      >
        {/* Close button — top-right corner */}
        <div className="absolute top-3 right-3 z-10">
          <button
            type="button"
            aria-label={t('chartFullscreen.closeButton')}
            onClick={onClose}
            className={cn(
              "inline-flex items-center justify-center rounded-md",
              "size-9 bg-background/80 backdrop-blur-sm",
              "text-foreground",
              "border border-border",
              "hover:bg-muted hover:text-foreground",
              // Visible focus ring (WCAG 2.1 SC 2.4.7)
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              "transition-colors duration-150",
              // Shadow for legibility over chart content
              "shadow-md"
            )}
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        {/* Chart content area — fills remaining space below the close button */}
        {/* Padding-top accounts for close button height (36px) + spacing */}
        <div
          className="flex-1 min-h-0 p-4 pt-14"
          // Prevent backdrop click from triggering through the content area
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
