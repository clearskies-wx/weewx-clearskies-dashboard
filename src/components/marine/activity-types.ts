// activity-types.ts — Shared type for Marine Activities tab/accordion items.
// Consumed by ActivityTabs (desktop >=768px) and ActivityAccordion (mobile
// <768px) so both render the same activity data with layout-appropriate
// chrome. DASHBOARD-MANUAL §12.

import type { ReactNode } from 'react';

export type ActivityId = 'boating' | 'surfing' | 'fishing' | 'beachSafety';

export interface ActivityDef {
  id: ActivityId;
  /** Decorative activity icon (Phosphor for boating/fishing/beachSafety, SurfingIcon for surfing). */
  icon: ReactNode;
  /** Translated activity name, e.g. t('activities.boating'). */
  label: string;
  /**
   * Translated qualitative label for this activity's current conditions
   * (e.g. "Good", "★★★☆☆", "Use Caution"). Omitted when the
   * underlying score/rating is not yet available at the shell level (T7.1) —
   * the full per-activity data ensemble lands in T7.2-T7.5.
   */
  qualitativeLabel?: string;
  /** Tab/accordion panel content. Placeholder <div> in T7.1; replaced by the
   *  real per-activity component in T7.2-T7.5. */
  content: ReactNode;
}
