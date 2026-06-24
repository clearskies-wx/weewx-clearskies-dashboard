// radar-expanded.tsx — Placeholder for the full-screen expanded radar page (/radar).
//
// Full implementation is deferred to Phase 4. This file exists to satisfy the
// route registration in App.tsx (T3.4) and ensure the /radar URL resolves to a
// rendered page rather than a 404.
//
// Phase 4 will replace this placeholder with a full RadarMap rendered at
// viewport height, provider controls, color scheme picker, and layer toggles.

export default function RadarExpandedPage() {
  return (
    <div className="flex items-center justify-center h-full p-8">
      <p className="text-muted-foreground">Expanded radar view — Phase 4</p>
    </div>
  );
}
