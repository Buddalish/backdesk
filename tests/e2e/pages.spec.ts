// tests/e2e/pages.spec.ts
import { test, expect } from "@playwright/test";

async function signUp(page: any) {
  const email = `test+${Date.now()}@example.com`;
  await page.goto("/sign-up");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "supersecure123");
  await page.click("button[type=submit]");
  // Authed home auto-redirects to most-recent page (or shows empty state if none)
  await page.waitForURL(/^http:\/\/localhost:3000\/$/);
  return email;
}

test("create blank dashboard and rename", async ({ page }) => {
  await signUp(page);

  // Open the New page dropdown
  await page.click("button:has-text('New page')");
  // Item text includes emoji prefix — substring match works
  await page.click("text=Blank dashboard");
  await page.waitForURL(/\/p\//);

  // PageHeader renders a plain <button> with the title. Use exact to avoid matching the
  // sidebar menu item which also contains "Untitled" (with emoji prefix).
  await expect(
    page.getByRole("button", { name: "Untitled", exact: true })
  ).toBeVisible();

  // Click the title button to enter edit mode
  await page.click("button:has-text('Untitled')");
  // The input is rendered with class containing 'font-semibold' and is auto-focused
  const titleInput = page.locator("input.font-semibold");
  await titleInput.fill("My dashboard");
  await titleInput.press("Enter");

  // After commit, the button should now show the new name
  await expect(
    page.getByRole("button", { name: "My dashboard", exact: true })
  ).toBeVisible({ timeout: 5000 });
});

test("create collection, add a field, add a row", async ({ page }) => {
  await signUp(page);

  // Open the New page dropdown
  await page.click("button:has-text('New page')");
  // Item text includes emoji prefix — substring match works
  await page.click("text=Blank collection");
  await page.waitForURL(/\/c\//);

  // A brand new collection has 0 fields and 0 rows → shows EmptyCollection.
  // EmptyCollection has only an "Add row" button; AddFieldButton is in the table header
  // (which only renders when there is at least one row OR field).
  // Step 1: add a row via EmptyCollection to make the table visible.
  await page.click("button:has-text('Add row')");

  // The Add row Server Action runs inside startTransition + router.refresh() — wait for
  // the resulting RSC re-render to mount the table (which carries the AddFieldButton).
  await page.waitForSelector("table", { timeout: 15000 });

  // The table is now visible (rows.length=1). Add a text field via the table header button.
  await page.click("button:has-text('Add field')");

  // The sheet opens — fill in the field name input (id="field-name", auto-focused)
  await page.fill("input#field-name", "Name");

  // Submit via the sheet footer button — use last() to distinguish trigger from submit
  await page.locator("button:has-text('Add field')").last().click();

  // addField calls revalidatePath; Next.js App Router automatically re-renders the RSC
  // so the new field column header should appear without an explicit reload.
  await expect(
    page.getByRole("columnheader").filter({ hasText: "Name" })
  ).toBeVisible({ timeout: 8000 });

  // Add another row now that the table is fully visible with the field column.
  await page.click("button:has-text('Add row')");

  // Wait for router.refresh to bring the second row in (≥2 data rows + 1 footer "Add row").
  await expect.poll(
    async () => page.locator("table tbody tr").count(),
    { timeout: 10000 },
  ).toBeGreaterThanOrEqual(3);
  await expect(page.locator("table tbody tr").first()).toBeVisible();
});
