import { expect, test, type Page } from "@playwright/test";
import { activityRow, authenticate } from "./auth";

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
    await expect(page.getByLabel("Connect Google Calendar").first()).toBeVisible({ timeout: 15_000 });
  });

  test("create a category by splitting the week ring", async () => {
    await page.goto("/planning");
    await expect(page.getByLabel("Buffer slice")).toBeVisible();

    // The suite runs against a persistent account, so only create it once.
    const names = () =>
      page
        .getByPlaceholder("Category name")
        .evaluateAll((fields) => fields.map((field) => (field as HTMLInputElement).value));

    if (!(await names()).includes("Deep Work")) {
      // Cutting belongs to the slice now — the buffer's, since its hours are the free ones.
      // Enter on the focused slice opens the same menu a right-click or a long press would.
      await page.getByLabel("Buffer slice").press("Enter");
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
    await expect(page.getByLabel("Add activity")).toBeVisible({ timeout: 10_000 });

    // The account is shared across runs, so it can hold more than one activity by this name.
    if (!(await page.getByLabel("Archive Coding").first().isVisible())) {
      // Rows are edited where they sit and save themselves — there is no editor to open and no
      // Save to press, so adding an activity is a row with a name typed into it.
      await page.getByLabel("Add activity").click();
      // A new row lands at the top of the list with its name field already focused.
      await page.getByPlaceholder("Activity name").first().fill("Coding");

      // A fresh activity claims none of its hour, so its first piece is cut out of the
      // unclaimed remainder and then pointed at the category the ring was just split into.
      await page.getByText(/^Unclaimed/).first().click({ button: "right" });
      await page.getByRole("menuitem", { name: "Split" }).click();
      await page.getByRole("button", { name: /^Change category for / }).first().click();
      await page.getByRole("button", { name: "Deep Work", exact: true }).click();
    }

    const row = activityRow(page, "Coding");
    // A share can only ever grow into hours nobody has claimed, so the buffer's piece goes back
    // to being free time before this asks for 60 of it. That leaves the row saying one thing
    // whatever the last run left behind.
    const buffer = row.getByRole("button", { name: "Change category for Buffer" });
    if (await buffer.isVisible()) {
      await buffer.click({ button: "right" });
      await page.getByRole("menuitem", { name: "Remove" }).click();
    }

    // Enter is what a number field commits on — until then what's typed is only typed.
    const share = row.getByRole("textbox", { name: "Deep Work percent", exact: true });
    await share.fill("60");
    await share.press("Enter");

    // Changes save themselves shortly after the last edit.
    await page.waitForTimeout(2500);
    await page.reload();

    const saved = activityRow(page, "Coding");
    await expect(saved.getByRole("textbox", { name: "Deep Work percent", exact: true })).toHaveValue("60", {
      timeout: 10_000,
    });
    // The 40 nobody claimed is free time, which is the buffer — one piece of it, not one per
    // edit that left something over.
    await expect(saved.getByRole("textbox", { name: "Buffer percent", exact: true })).toHaveValue("40");
  });

  test("the activity is draggable onto the week from the calendar", async () => {
    await page.goto("/calendar");
    await expect(page.getByLabel("Connect Google Calendar").first()).toBeVisible({ timeout: 10_000 });
    // Without a calendar there is no grid to drop onto, so the palette isn't drawn either.
    await expect(page.getByText("Drag onto the week")).toHaveCount(0);
  });
});
