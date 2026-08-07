import { expect, test, type Page } from "@playwright/test";
import { authenticate, recordApiCalls } from "./auth";

test.describe.configure({ mode: "serial" });

/**
 * The app holds every screen's data for the session, so moving between tabs is a render and
 * nothing else. These two tests pin both halves of that: no request when nothing changed, and
 * a request when a write means the other screens are showing something out of date.
 */
test.describe("Moving between tabs", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await authenticate(page);
    await expect(page.getByText("Logged")).toBeVisible({ timeout: 15_000 });
    // The startup warm-up fetches every tab's data; let it finish before counting requests.
    await expect.poll(() => page.getByRole("link", { name: "Balance" }).count()).toBeGreaterThan(0);
    await page.waitForTimeout(2500);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("costs no requests when nothing has changed", async () => {
    const calls = recordApiCalls(page);

    for (const [label, marker] of [
      ["Balance", /tracked of .* planned/],
      ["Week", /Rest \+ Buffer/],
      ["Activities", /Coding/],
      ["Track", /Logged/],
      ["Balance", /tracked of .* planned/],
    ] as const) {
      await page.getByRole("link", { name: label }).first().click();
      await expect(page.getByText(marker).first()).toBeVisible();
    }

    expect(calls).toEqual([]);
  });

  test("refetches the screens a write left stale", async () => {
    await page.getByRole("link", { name: "Track" }).first().click();
    await page.getByLabel("Start Coding").first().click();
    await expect(page.getByText("Stop", { exact: true })).toBeVisible({ timeout: 10_000 });
    await page.getByText("Stop", { exact: true }).click();
    await expect(page.getByText("Stop", { exact: true })).toHaveCount(0);

    // Balance was left holding totals from before the entry existed.
    const calls = recordApiCalls(page);
    await page.getByRole("link", { name: "Balance" }).first().click();
    await expect(page.getByText(/tracked of .* planned/)).toBeVisible();
    await expect.poll(() => calls).toContain("/mobile/stats");
  });
});
