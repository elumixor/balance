import { expect, type Page } from "@playwright/test";

// Clerk test-mode convention: any email containing "+clerk_test" uses the fixed
// verification code 424242 instead of sending a real email. See:
// https://clerk.com/docs/testing/test-emails-and-phones
const TEST_EMAIL = `balance-e2e+clerk_test@example.com`;
const TEST_PASSWORD = "Sup3r-Secret-Password!";
const TEST_CODE = "424242";

/** Signs the shared test account in, creating it the first time it's needed. */
export async function authenticate(page: Page) {
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
  await expect(page).toHaveURL(/\/calendar/, { timeout: 20_000 });
}

/**
 * One row of the Activities list, by the name it carries. Rows are edited in place and every
 * field in them is a plain input, so the row itself is what tells two activities apart — the
 * archive button is the only thing in a row that says which one it belongs to.
 */
export function activityRow(page: Page, name: string) {
  return page.getByTestId("activity-row").filter({ has: page.getByLabel(`Archive ${name}`) }).first();
}

/** Records the API calls a page makes from here on, so a test can assert on what it didn't fetch. */
export function recordApiCalls(page: Page) {
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/mobile/")) calls.push(new URL(request.url()).pathname);
  });
  return calls;
}
