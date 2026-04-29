import { test, expect } from "@playwright/test";

test("sign-up flow lands on empty state", async ({ page }) => {
  const email = `test+${Date.now()}@example.com`;
  await page.goto("/sign-up");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "supersecure123");
  await page.click("button[type=submit]");

  // Wait for redirect to authenticated home
  await page.waitForURL("/");
  await expect(page.getByText("Welcome to Backdesk")).toBeVisible();
});

test("sign-in then sign-out", async ({ page }) => {
  // First sign up so we have a known user
  const email = `test+${Date.now()}@example.com`;
  await page.goto("/sign-up");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "supersecure123");
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  // Sign out
  await page.locator("button:has-text('Sign out')").click();
  await page.waitForURL("/sign-in");

  // Sign back in
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "supersecure123");
  await page.click("button[type=submit]");
  await page.waitForURL("/");
  await expect(page.getByText("Welcome to Backdesk")).toBeVisible();
});
