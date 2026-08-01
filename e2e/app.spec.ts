import { expect, test, type Page } from "@playwright/test";

// Clerk test-mode convention: any email containing "+clerk_test" uses the fixed
// verification code 424242 instead of sending a real email. See:
// https://clerk.com/docs/testing/test-emails-and-phones
const TEST_EMAIL = `balance-e2e+clerk_test@example.com`;
const TEST_PASSWORD = "Sup3r-Secret-Password!";
const TEST_CODE = "424242";

test.describe.configure({ mode: "serial" });

/** Signs the shared test account in, creating it the first time it's needed. */
async function authenticate(page: Page) {
  await page.goto("/sign-in");
  await page.getByPlaceholder("Email").fill(TEST_EMAIL);
  await page.getByPlaceholder("Password").fill(TEST_PASSWORD);
  await page.getByText("Sign in", { exact: true }).click();

  const code = page.getByPlaceholder("Verification code");
  const accountMissing = page.getByText("Couldn't find your account.");
  await expect(code.or(accountMissing)).toBeVisible({ timeout: 20_000 });

  if (await accountMissing.isVisible()) {
    await page.goto("/sign-up");
    await page.getByPlaceholder("Email").fill(TEST_EMAIL);
    await page.getByPlaceholder("Password").fill(TEST_PASSWORD);
    await page.getByText("Sign up", { exact: true }).click();
    await expect(code).toBeVisible({ timeout: 20_000 });
  }

  await code.fill(TEST_CODE);
  await page.getByText("Verify", { exact: true }).click();
  await expect(page).toHaveURL(/\/track/, { timeout: 20_000 });
}

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

  test("sign in and land on Track", async () => {
    await authenticate(page);
    await expect(page.getByText("Logged")).toBeVisible({ timeout: 15_000 });
  });

  test("create a category by splitting the week ring", async () => {
    await page.goto("/categories");
    await expect(page.getByText("Rest + Buffer")).toBeVisible();

    // The suite runs against a persistent account, so only create it once.
    const names = () =>
      page
        .getByPlaceholder("Category name")
        .evaluateAll((fields) => fields.map((field) => (field as HTMLInputElement).value));

    if (!(await names()).includes("Deep Work")) {
      await page.getByLabel("Split off a category").click();
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
    await page.goto("/activities");
    if (await page.getByLabel("Edit Coding").isVisible()) {
      await page.getByLabel("Edit Coding").click();
    } else {
      await page.getByLabel("Add activity").click();
    }

    await page.getByPlaceholder("Activity name").fill("Coding");
    await page.getByLabel("Deep Work share", { exact: true }).fill("60");
    await page.getByText("Save", { exact: true }).click();

    const codingRow = page.getByLabel("Edit Coding");
    await expect(codingRow).toBeVisible({ timeout: 10_000 });
    await expect(codingRow).toContainText("Deep Work 60%");
  });

  test("start and stop a timer, entry shows in the list", async () => {
    await page.goto("/track");
    await page.getByLabel("Start Coding").click();

    await expect(page.getByText("Stop", { exact: true })).toBeVisible({ timeout: 10_000 });
    await page.getByText("Stop", { exact: true }).click();

    await expect(page.getByText("Stop", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Coding").first()).toBeVisible();
  });

  test("balance screen shows the category against its target", async () => {
    await page.goto("/stats");
    await expect(page.getByText("Deep Work", { exact: true }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/tracked of .* planned/)).toBeVisible();
  });
});
