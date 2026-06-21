// page-visibility.ts — Page visibility config fetcher, context, and hook.
//
// Reads /pages.json at boot to determine which pages are visible.
// Format: { "hidden": ["seismic", "reports"] }
// Absent file or parse error = { "hidden": [] } (all pages visible).
//
// "Now" is ALWAYS visible regardless of config — enforced in isPageVisible().
// This is defense-in-depth alongside the admin UI's disabled checkbox.
//
// Note: PageVisibilityProvider uses React.createElement (not JSX) so this file
// can remain .ts without requiring the .tsx extension.

import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export interface PagesConfig {
  hidden: string[];
}

const DEFAULT_CONFIG: PagesConfig = { hidden: [] };

/**
 * Fetch /pages.json and return the parsed config.
 * Never throws — returns DEFAULT_CONFIG on any failure.
 */
export async function fetchPagesConfig(): Promise<PagesConfig> {
  try {
    const resp = await fetch('/pages.json');
    if (!resp.ok) return DEFAULT_CONFIG;
    const data = await resp.json();
    if (data && Array.isArray(data.hidden)) {
      return { hidden: data.hidden };
    }
    return DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

const PageVisibilityContext = createContext<PagesConfig>(DEFAULT_CONFIG);

/**
 * Provider that fetches /pages.json once on mount and makes the config
 * available to all descendants via usePageVisibility().
 * Wraps the entire router so nav filtering and route guards share state.
 */
export function PageVisibilityProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [config, setConfig] = useState<PagesConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    fetchPagesConfig().then(setConfig);
  }, []);

  return React.createElement(
    PageVisibilityContext.Provider,
    { value: config },
    children,
  );
}

/** Returns the current page visibility config from context. */
export function usePageVisibility(): PagesConfig {
  return useContext(PageVisibilityContext);
}

/**
 * Returns true when the given page should be shown.
 * "now" is ALWAYS visible — isPageVisible('now', ...) always returns true.
 */
export function isPageVisible(pageKey: string, config: PagesConfig): boolean {
  // "Now" is never hidden — defense in depth.
  if (pageKey === 'now') return true;
  return !config.hidden.includes(pageKey);
}
