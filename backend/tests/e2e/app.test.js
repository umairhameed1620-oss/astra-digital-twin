// @ts-check
const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const TEST_EMAIL = `e2e_${Date.now()}@astra.space`;
const TEST_PASSWORD = 'E2ETest123!';
const TEST_NAME = 'E2E Test Engineer';

test.describe('ASTRA E2E Test Suite', () => {

  test.describe('Authentication', () => {
    test('should display login page', async ({ page }) => {
      await page.goto(BASE_URL);
      await expect(page.locator('text=ASTRA')).toBeVisible();
      await expect(page.locator('text=Sign In')).toBeVisible();
    });

    test('should register a new user', async ({ page }) => {
      await page.goto(BASE_URL);
      await page.click('text=Register');
      await page.fill('input[placeholder*="Name"]', TEST_NAME);
      await page.fill('input[type="email"]', TEST_EMAIL);
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.click('button[type="submit"]');
      await expect(page).toHaveURL(/\//);
      await expect(page.locator('text=Welcome back')).toBeVisible({ timeout: 10000 });
    });

    test('should login with valid credentials', async ({ page }) => {
      await page.goto(BASE_URL);
      await page.fill('input[type="email"]', TEST_EMAIL);
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.click('button[type="submit"]');
      await expect(page).toHaveURL(/\//);
    });

    test('should show error on invalid credentials', async ({ page }) => {
      await page.goto(BASE_URL);
      await page.fill('input[type="email"]', 'wrong@astra.space');
      await page.fill('input[type="password"]', 'WrongPass123!');
      await page.click('button[type="submit"]');
      await expect(page.locator('text=Invalid credentials')).toBeVisible();
    });

    test('should logout successfully', async ({ page }) => {
      await page.goto(BASE_URL);
      await page.fill('input[type="email"]', TEST_EMAIL);
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.click('button[type="submit"]');
      await page.click('text=Logout');
      await expect(page.locator('text=Sign In')).toBeVisible();
    });
  });

  test.describe('Dashboard', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(BASE_URL);
      await page.fill('input[type="email"]', TEST_EMAIL);
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL(/\//);
    });

    test('should display mission overview', async ({ page }) => {
      await expect(page.locator('text=MISSION OVERVIEW')).toBeVisible();
      await expect(page.locator('text=Total Twins')).toBeVisible();
    });

    test('should navigate to spacecraft builder', async ({ page }) => {
      await page.click('text=Spacecraft Builder');
      await expect(page).toHaveURL(/\/builder/);
      await expect(page.locator('text=SPACECRAFT BUILDER')).toBeVisible();
    });

    test('should navigate to ARIA AI', async ({ page }) => {
      await page.click('text=ARIA AI');
      await expect(page).toHaveURL(/\/ai/);
      await expect(page.locator('text=ARIA')).toBeVisible();
    });
  });

  test.describe('Spacecraft Builder', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(BASE_URL);
      await page.fill('input[type="email"]', TEST_EMAIL);
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.click('button[type="submit"]');
      await page.goto(`${BASE_URL}/builder`);
    });

    test('should create a satellite', async ({ page }) => {
      await page.fill('input[placeholder*="SENTINEL"]', 'E2E-TEST-SAT');
      await page.selectOption('select', 'satellite');
      await page.click('text=+ Add', { first: true });
      await page.click('button:has-text("Create Twin")');
      await expect(page).toHaveURL(/\//);
      await expect(page.locator('text=E2E-TEST-SAT')).toBeVisible({ timeout: 10000 });
    });

    test('should show validation error on empty name', async ({ page }) => {
      await page.click('button:has-text("Create Twin")');
      await expect(page.locator('text=Name required')).toBeVisible();
    });

    test('should calculate mass budget correctly', async ({ page }) => {
      await page.fill('input[placeholder*="SENTINEL"]', 'Test Sat');
      await page.click('text=+ Add', { first: true });
      await expect(page.locator('text=kg').first()).toBeVisible();
    });
  });

  test.describe('Telemetry', () => {
    test('should display telemetry page', async ({ page }) => {
      await page.goto(BASE_URL);
      await page.fill('input[type="email"]', TEST_EMAIL);
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.click('button[type="submit"]');
      // Navigate to first spacecraft telemetry if exists
      const telemetryLink = page.locator('text=Telemetry').first();
      if (await telemetryLink.isVisible()) {
        await telemetryLink.click();
        await expect(page.locator('text=TELEMETRY DASHBOARD')).toBeVisible();
        await expect(page.locator('text=Start Simulation')).toBeVisible();
      }
    });
  });

  test.describe('Accessibility', () => {
    test('should have accessible login form', async ({ page }) => {
      await page.goto(BASE_URL);
      const emailInput = page.locator('input[type="email"]');
      const passwordInput = page.locator('input[type="password"]');
      await expect(emailInput).toBeVisible();
      await expect(passwordInput).toBeVisible();
      // Tab navigation
      await emailInput.focus();
      await page.keyboard.press('Tab');
      await expect(passwordInput).toBeFocused();
    });

    test('should handle keyboard navigation', async ({ page }) => {
      await page.goto(BASE_URL);
      await page.fill('input[type="email"]', TEST_EMAIL);
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/\//, { timeout: 10000 });
    });
  });

  test.describe('Responsive Design', () => {
    test('should work on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(BASE_URL);
      await expect(page.locator('text=ASTRA')).toBeVisible();
    });

    test('should work on tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto(BASE_URL);
      await expect(page.locator('text=ASTRA')).toBeVisible();
    });
  });
});
