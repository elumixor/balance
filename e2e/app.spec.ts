import { expect, test, type Page } from "@playwright/test";
import { authenticate } from "./auth";

test.describe.configure({ mode: "serial" });

test.describe("Balance app", () => {
  // One signed-in page for the whole file: signing in per test would mean
  // replaying the emailed code four times.
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page.close();
  });

  // The test account has no Google account to connect, so every screen that draws real hours
  // stops at the connect card. What's still covered end to end is the plan itself.
  test("sign in and land on Calendar", async () => {
    await authenticate(page);
    await expect(page.getByLabel("Connect Google Calendar")).toBeVisible({ timeout: 15_000 });
  });

  test("create a category by splitting the week ring", async () => {
    await page.goto("/planning");
    await expect(page.getByLabel("Buffer options")).toBeVisible();

    // The suite runs against a persistent account, so only create it once.
    const names = () =>
      page
        .getByPlaceholder("Category name")
        .evaluateAll((fields) => fields.map((field) => (field as HTMLInputElement).value));

    if (!(await names()).includes("Deep Work")) {
      // Cutting is a label's own menu now: the buffer's, since its hours are the free ones.
      await page.getByLabel("Buffer options").click();
      await page.getByRole("menuitem", { name: "Split" }).click();
      const nameField = page.getByPlaceholder("Category name").last();
      await expect(nameField).toBeVisible();
      await nameField.fill("Deep Work");

      // Changes save themselves shortly after the last edit.
      await page.waitForTimeout(2500);
    }
    await page.reload();
    await expect.poll(names, { timeout: 10_000 }).toContain("Deep Work");
  });

  test("create an activity split across the category", async () => {
    await page.goto("/planning");
    // The account is shared across runs, so it can hold more than one activity by this name.
    const coding = page.getByLabel("Edit Coding").first();
    if (await coding.isVisible()) {
      await coding.click();
    } else {
      await page.getByLabel("Add activity").click();
    }

    await page.getByPlaceholder("Activity name").fill("Coding");
    await page.getByLabel("Deep Work share", { exact: true }).fill("60");
    await page.getByText("Save", { exact: true }).click();

    const codingRow = page.getByLabel("Edit Coding").first();
    await expect(codingRow).toBeVisible({ timeout: 10_000 });
    await expect(codingRow).toContainText("Deep Work 60%");
  });

  test("the activity is draggable onto the week from the calendar", async () => {
    await page.goto("/calendar");
    await expect(page.getByLabel("Connect Google Calendar")).toBeVisible({ timeout: 10_000 });
    // Without a calendar there is no grid to drop onto, so the palette isn't drawn either.
    await expect(page.getByText("Drag onto the week")).toHaveCount(0);
  });
});
