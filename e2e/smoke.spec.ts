import { test, expect } from '@playwright/test';
import AxeBuilder from 'axe-playwright'; // pre-existing import (wrong package — tracked as existing bug)
import { AxeBuilder as AxeCoreBuilder } from '@axe-core/playwright';

test.describe('smoke tests', () => {
  test('homepage loads', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Clear Skies/i);
  });

  test('homepage passes axe-core', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('charts page loads', async ({ page }) => {
    await page.goto('/charts');
    await expect(page.getByRole('tablist')).toBeVisible();
  });

  test('charts page passes axe-core', async ({ page }) => {
    await page.goto('/charts');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('now page loads', async ({ page }) => {
    // Now page is the index route (/).
    await page.goto('/');
    // Wait for the lazy-loaded chunk + i18n.
    await expect(page.getByRole('heading', { name: /current conditions/i })).toBeVisible({ timeout: 10000 });
  });

  test('now page passes axe-core', async ({ page }) => {
    // Now page is the index route (/).
    await page.goto('/');
    // Wait for i18n and tiles to render.
    await expect(page.getByRole('heading', { name: /current conditions/i })).toBeVisible({ timeout: 10000 });
    const results = await new AxeCoreBuilder({ page }).analyze();
    // Report any violations rather than silently fail.
    const violations = results.violations.map((v) => `${v.id}: ${v.description}`);
    expect(violations).toEqual([]);
  });
});
