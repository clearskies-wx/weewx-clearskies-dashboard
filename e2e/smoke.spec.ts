import { test, expect } from '@playwright/test';
import AxeBuilder from 'axe-playwright';

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
});
