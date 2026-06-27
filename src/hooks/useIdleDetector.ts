// useIdleDetector.ts — idle detection provider and consumer hook.
//
// Implements ADR-075 §7: a single top-level provider tracks user interaction
// events and exposes idle state to the entire component tree via context.
//
// Usage:
//   // In main.tsx (wired by coordinator):
//   <IdleDetectorProvider timeoutMinutes={30}>
//     <App />
//   </IdleDetectorProvider>
//
//   // In any descendant component:
//   const idle = useIsIdle();
//
// When idle is true, data-refresh polling should pause and animated elements
// should suspend (see DASHBOARD-MANUAL §6 / ADR-075 for the full spec).
//
// When timeoutMinutes is 0, idle detection is DISABLED (kiosk mode) and
// useIsIdle() always returns false.

import {
  createElement,
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

// Default is null so useIsIdle() can detect when it is called outside the
// provider and throw a helpful error rather than silently returning false.
const IdleContext = createContext<boolean | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface IdleDetectorProviderProps {
  /** Minutes of no interaction before idle state becomes true.
   *  Set to 0 to disable idle detection entirely (kiosk mode). */
  timeoutMinutes?: number;
  children: ReactNode;
}

export function IdleDetectorProvider({
  timeoutMinutes = 30,
  children,
}: IdleDetectorProviderProps): ReactNode {
  const disabled = timeoutMinutes === 0;

  // Start in non-idle state. If disabled, this never changes.
  const [idle, setIdle] = useState(false);

  // Store the timer ID in a ref to avoid stale closures and prevent the
  // timer reference from causing effect re-runs.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // resetIdle — clears any running timer, marks user as active, then starts
  // a fresh countdown. Wrapped in useCallback so the event listeners can be
  // added/removed by reference without being recreated on every render.
  const resetIdle = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    setIdle(false);
    timerRef.current = setTimeout(() => {
      setIdle(true);
    }, timeoutMinutes * 60 * 1000);
  }, [timeoutMinutes]);

  useEffect(() => {
    // Kiosk mode: no listeners, no timer, idle is always false.
    if (disabled) {
      setIdle(false);
      return;
    }

    // Start the initial countdown immediately when the provider mounts or
    // when timeoutMinutes changes.
    resetIdle();

    // Interaction events that reset the idle timer.
    // scroll and touchstart use passive listeners as they never call
    // preventDefault() — this avoids blocking the browser's scroll thread.
    window.addEventListener('mousemove', resetIdle);
    window.addEventListener('touchstart', resetIdle, { passive: true });
    window.addEventListener('scroll', resetIdle, { passive: true });
    // Keyboard events are tracked on document so that focus-trapped dialogs
    // and elements without window-level keydown propagation are still captured.
    document.addEventListener('keydown', resetIdle);

    return () => {
      // Clear the pending timer on unmount or before re-running the effect.
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      window.removeEventListener('mousemove', resetIdle);
      window.removeEventListener('touchstart', resetIdle);
      window.removeEventListener('scroll', resetIdle);
      document.removeEventListener('keydown', resetIdle);
    };
  }, [disabled, resetIdle]);

  // Use createElement instead of JSX so this file can remain a .ts module
  // (no JSX transform needed for a single Provider wrapper call).
  return createElement(
    IdleContext.Provider,
    { value: disabled ? false : idle },
    children,
  );
}

// ---------------------------------------------------------------------------
// Consumer hook
// ---------------------------------------------------------------------------

/** Returns true when the user has been idle for longer than the configured
 *  timeout. Always returns false in kiosk mode (timeoutMinutes === 0).
 *
 *  Must be used inside IdleDetectorProvider; throws otherwise. */
export function useIsIdle(): boolean {
  const idle = useContext(IdleContext);
  if (idle === null) {
    throw new Error('useIsIdle must be used within IdleDetectorProvider');
  }
  return idle;
}
