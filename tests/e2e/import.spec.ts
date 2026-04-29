// tests/e2e/import.spec.ts
import { test, expect } from "@playwright/test";
import path from "node:path";

test("import IBKR sample CSV → Trades collection populated", async ({ page }) => {
  // Sign up
  const email = `test+${Date.now()}@example.com`;
  await page.goto("/sign-up");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "supersecure123");
  await page.click("button[type=submit]");
  await page.waitForURL(/^http:\/\/localhost:3000\/$/);

  // Open + New page → Import — Interactive Brokers — Activity Statement
  // displayName = "Interactive Brokers — Activity Statement" (em-dashes U+2014)
  // NewPageMenu renders: "Import — {c.displayName}"
  await page.click("button:has-text('New page')");
  await page.click("text=Import — Interactive Brokers — Activity Statement");

  // Sheet opens — Radix renders into a portal; wait for the sheet-content slot
  const sheetContent = page.locator('[data-slot="sheet-content"]');
  await expect(sheetContent).toBeVisible({ timeout: 5_000 });

  // Upload the seed CSV via the real <input type="file"> inside the sheet
  const file = path.join(__dirname, "../../seed/sample-activity-statement.csv");
  await sheetContent.locator('input[type="file"]').setInputFiles(file);

  // Import button becomes enabled once a file is chosen
  const importBtn = sheetContent.locator('button:has-text("Import")');
  await expect(importBtn).not.toBeDisabled({ timeout: 2_000 });
  await importBtn.click();

  // Wait for the success toast: "Imported N fills, created N trades."
  await expect(page.getByText(/Imported \d+ fills, created \d+ trades/)).toBeVisible({
    timeout: 60_000,
  });

  // The sheet closes on success and calls onClose(), which closes the dropdown.
  // Wait for the sheet to disappear before proceeding.
  await expect(sheetContent).not.toBeVisible({ timeout: 10_000 });

  // Sidebar should now list Fills + Trades pages (created by ensureSystemCollections).
  // SidebarMenuButton wraps each link; filter by text to avoid matching the emoji prefix.
  const sidebar = page.locator('[data-slot="sidebar-content"]');
  await expect(sidebar.locator("a").filter({ hasText: "Fills" })).toBeVisible({ timeout: 10_000 });
  const tradesLink = sidebar.locator("a").filter({ hasText: "Trades" });
  await expect(tradesLink).toBeVisible({ timeout: 10_000 });

  // Navigate to the Trades collection page (if not already there after router.refresh())
  if (!page.url().match(/\/c\//)) {
    await tradesLink.click();
    await page.waitForURL(/\/c\//, { timeout: 10_000 });
  }

  // Verify the table has at least one data row
  await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 10_000 });
});
