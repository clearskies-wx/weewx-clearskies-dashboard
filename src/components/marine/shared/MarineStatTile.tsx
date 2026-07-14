import type { ReactNode } from 'react';

export interface MarineStatTileProps {
  icon?: ReactNode;
  label: string;
  value: string;
  unit?: string;
}

export function MarineStatTile({ icon, label, value, unit }: MarineStatTileProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="flex items-center gap-1 text-muted-foreground" style={{ fontSize: 'var(--text-label)' }}>
        {icon && (
          <span aria-hidden="true" className="shrink-0 size-4">
            {icon}
          </span>
        )}
        {label}
      </dt>
      <dd
        className="text-foreground font-semibold"
        style={{ fontSize: 'var(--text-stat-tile)', fontFeatureSettings: '"tnum"' }}
      >
        {value}
        {unit && (
          <span className="text-muted-foreground font-normal ml-1" style={{ fontSize: 'var(--text-label)' }}>
            {unit}
          </span>
        )}
      </dd>
    </div>
  );
}
