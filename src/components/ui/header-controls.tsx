import * as React from 'react';
import { cn } from '@/lib/utils';

// Shared pill-button styling for all header control components
const pillBase = "inline-flex items-center justify-center rounded-full border-none cursor-pointer leading-[1.4] font-semibold min-h-[1.75rem] min-w-[2.75rem] md:min-h-0 md:min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

const pillActive = "bg-[var(--primary)] text-[var(--primary-foreground)]";
const pillInactive = "bg-[rgba(0,0,0,0.07)] text-[var(--muted-foreground)] dark:bg-[rgba(255,255,255,0.1)]";

// ── HeaderTabs ─────────────────────────────────────────────────────────────
// Switch views (Today/7-Day, Live/Timelapse, etc.)
// Follows WAI-ARIA tabs pattern: role="tablist", role="tab", arrow key navigation.

export interface TabItem {
  id: string;
  label: string;
}

export interface HeaderTabsProps {
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (id: string) => void;
  ariaLabel: string;
  idPrefix?: string;
  panelIdPrefix?: string;
}

export function HeaderTabs({
  tabs,
  activeTab,
  onTabChange,
  ariaLabel,
  idPrefix = 'htab',
  panelIdPrefix,
}: HeaderTabsProps) {
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      let nextIndex: number | null = null;
      if (e.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
      if (nextIndex !== null) {
        e.preventDefault();
        onTabChange(tabs[nextIndex].id);
        (e.currentTarget.parentElement?.children[nextIndex] as HTMLElement)?.focus();
      }
    },
    [tabs, onTabChange],
  );

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex gap-1 shrink-0"
    >
      {tabs.map((tab, i) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`${idPrefix}-${tab.id}`}
          aria-selected={activeTab === tab.id}
          aria-controls={panelIdPrefix ? `${panelIdPrefix}-${tab.id}` : undefined}
          tabIndex={activeTab === tab.id ? 0 : -1}
          onClick={() => onTabChange(tab.id)}
          onKeyDown={(e) => handleKeyDown(e, i)}
          className={cn(
            pillBase,
            "px-[0.55rem] py-[0.16rem]",
            activeTab === tab.id ? pillActive : pillInactive,
          )}
          style={{ fontSize: 'var(--text-label, 0.75rem)' }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ── HeaderToggle ───────────────────────────────────────────────────────────
// Binary on/off

export interface HeaderToggleProps {
  pressed: boolean;
  onToggle: (pressed: boolean) => void;
  label: string;
  ariaLabel?: string;
}

export function HeaderToggle({ pressed, onToggle, label, ariaLabel }: HeaderToggleProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={ariaLabel ?? label}
      onClick={() => onToggle(!pressed)}
      className={cn(
        pillBase,
        "px-[0.55rem] py-[0.16rem]",
        pressed ? pillActive : pillInactive,
      )}
      style={{ fontSize: 'var(--text-label, 0.75rem)' }}
    >
      {label}
    </button>
  );
}

// ── HeaderSelect ───────────────────────────────────────────────────────────
// Choose from a list (styled as a native <select> with pill appearance)

export interface HeaderSelectProps {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
}

export function HeaderSelect({ value, options, onChange, ariaLabel, disabled }: HeaderSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      disabled={disabled}
      className={cn(
        "rounded-full border-none cursor-pointer font-semibold leading-[1.4] min-h-[1.75rem] md:min-h-0 bg-[rgba(0,0,0,0.07)] text-[var(--muted-foreground)] dark:bg-[rgba(255,255,255,0.1)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 px-[0.55rem] py-[0.16rem] pr-6",
        disabled && "opacity-60 cursor-not-allowed",
      )}
      style={{ fontSize: 'var(--text-label, 0.75rem)' }}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

// ── HeaderButton ───────────────────────────────────────────────────────────
// Trigger an action (download, refresh, expand, etc.)

export interface HeaderButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

export function HeaderButton({ className, children, ...props }: HeaderButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        pillBase,
        pillInactive,
        "px-[0.55rem] py-[0.16rem]",
        className,
      )}
      style={{ fontSize: 'var(--text-label, 0.75rem)' }}
      {...props}
    >
      {children}
    </button>
  );
}
