// page-visibility.tsx — re-exports from page-visibility.ts.
// The canonical implementation lives in page-visibility.ts (no JSX, uses
// React.createElement so it compiles without the .tsx extension).
// This .tsx shim exists in case anything imports with an explicit .tsx suffix.
export * from './page-visibility';
