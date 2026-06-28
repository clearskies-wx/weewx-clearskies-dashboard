# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.ts >> smoke tests >> now page passes axe-core
- Location: e2e\smoke.spec.ts:35:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: /current conditions/i })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByRole('heading', { name: /current conditions/i })

```

```yaml
- main "Clear Skies is starting up...":
  - heading "Clear Skies is starting up..." [level=1]
  - paragraph: The weather station API is not responding yet. It may still be initialising.
  - button "Retry"
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import AxeBuilder from 'axe-playwright'; // pre-existing import (wrong package — tracked as existing bug)
  3  | import { AxeBuilder as AxeCoreBuilder } from '@axe-core/playwright';
  4  | 
  5  | test.describe('smoke tests', () => {
  6  |   test('homepage loads', async ({ page }) => {
  7  |     await page.goto('/');
  8  |     await expect(page).toHaveTitle(/Clear Skies/i);
  9  |   });
  10 | 
  11 |   test('homepage passes axe-core', async ({ page }) => {
  12 |     await page.goto('/');
  13 |     const results = await new AxeBuilder({ page }).analyze();
  14 |     expect(results.violations).toEqual([]);
  15 |   });
  16 | 
  17 |   test('charts page loads', async ({ page }) => {
  18 |     await page.goto('/charts');
  19 |     await expect(page.getByRole('tablist')).toBeVisible();
  20 |   });
  21 | 
  22 |   test('charts page passes axe-core', async ({ page }) => {
  23 |     await page.goto('/charts');
  24 |     const results = await new AxeBuilder({ page }).analyze();
  25 |     expect(results.violations).toEqual([]);
  26 |   });
  27 | 
  28 |   test('now page loads', async ({ page }) => {
  29 |     // Now page is the index route (/).
  30 |     await page.goto('/');
  31 |     // Wait for the lazy-loaded chunk + i18n.
  32 |     await expect(page.getByRole('heading', { name: /current conditions/i })).toBeVisible({ timeout: 10000 });
  33 |   });
  34 | 
  35 |   test('now page passes axe-core', async ({ page }) => {
  36 |     // Now page is the index route (/).
  37 |     await page.goto('/');
  38 |     // Wait for i18n and tiles to render.
> 39 |     await expect(page.getByRole('heading', { name: /current conditions/i })).toBeVisible({ timeout: 10000 });
     |                                                                              ^ Error: expect(locator).toBeVisible() failed
  40 |     const results = await new AxeCoreBuilder({ page }).analyze();
  41 |     // Report any violations rather than silently fail.
  42 |     const violations = results.violations.map((v) => `${v.id}: ${v.description}`);
  43 |     expect(violations).toEqual([]);
  44 |   });
  45 | });
  46 | 
```