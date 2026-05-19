// footer.tsx — dashboard footer
// Fixed at bottom of content area (not sticky/viewport-fixed).
// Contains Legal link + copyright per ADR-024.

import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border px-4 py-3 text-sm text-muted-foreground">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Link
          to="/legal"
          className="hover:text-foreground underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded"
        >
          Legal / Privacy
        </Link>
        <span aria-hidden="true">·</span>
        <span>© 2026 Clear Skies</span>
      </div>
    </footer>
  );
}
