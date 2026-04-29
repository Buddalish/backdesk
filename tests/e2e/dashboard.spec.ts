// tests/e2e/dashboard.spec.ts
import { test, expect } from "@playwright/test";

test("dashboard page loads and renders the Plate editor", async ({ page }) => {
  // Sign up
  const email = `test+${Date.now()}@example.com`;
  await page.goto("/sign-up");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "supersecure123");
  await page.click("button[type=submit]");
  await page.waitForURL(/^http:\/\/localhost:3000\/$/);

  // Create a blank dashboard
  await page.click("button:has-text('New page')");
  await page.click("text=Blank dashboard");
  await page.waitForURL(/\/p\//);

  // PageHeader shows
  await expect(page.getByRole("button", { name: "Untitled", exact: true })).toBeVisible();

  // The Plate editor should mount (look for an element with role="textbox" or contenteditable)
  const editor = page.locator('[contenteditable="true"]').first();
  await expect(editor).toBeVisible({ timeout: 10000 });

  // Type some text into the editor
  await editor.click();
  await page.keyboard.type("Hello, Backdesk!");
  await expect(page.locator('[contenteditable="true"]').first()).toContainText("Hello, Backdesk!");
});

test("typing in editor saves and persists across reload", async ({ page }) => {
  const email = `test+${Date.now()}@example.com`;
  await page.goto("/sign-up");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "supersecure123");
  await page.click("button[type=submit]");
  await page.waitForURL(/^http:\/\/localhost:3000\/$/);

  await page.click("button:has-text('New page')");
  await page.click("text=Blank dashboard");
  await page.waitForURL(/\/p\//);

  const editor = page.locator('[contenteditable="true"]').first();
  await expect(editor).toBeVisible({ timeout: 10000 });
  await editor.click();
  await page.keyboard.type("Persisted text");

  // Wait for the debounced save (500ms + buffer for round-trip)
  await page.waitForTimeout(2500);

  // Reload — text should still be there
  await page.reload();
  await expect(page.locator('[contenteditable="true"]').first()).toContainText("Persisted text", { timeout: 10000 });
});
