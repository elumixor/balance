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
    await expect(page.getByLabel("Connect Google Calendar")).toBeVisible({ timeout: 15_000 });
    // The startup warm-up fetches every tab's data; let it finish before counting requests.
    await expect.poll(() => page.getByRole("link", { name: "Planning" }).count()).toBeGreaterThan(0);
    await page.waitForTimeout(2500);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("costs no requests when nothing has changed", async () => {
    const calls = recordApiCalls(page);

    for (const [label, marker] of [
      ["Planning", /Rest \+ Buffer/],
      ["Calendar", /Connect Google Calendar/],
      ["Planning", /Coding/],
    ] as const) {
      await page.getByRole("link", { name: label }).first().click();
      await expect(page.getByText(marker).first()).toBeVisible();
    }

    expect(calls).toEqual([]);
  });

  test("refetches the screens a write left stale", async () => {
    await page.goto("/planning");
    await page.getByLabel("Edit Coding").first().click();
    await page.getByPlaceholder("Activity name").fill("Coding");
    await page.getByText("Save", { exact: true }).click();
    await expect(page.getByPlaceholder("Activity name")).toHaveCount(0, { timeout: 10_000 });

    // An activity's split changes what its events count toward, so the week is now stale.
    const calls = recordApiCalls(page);
    await page.getByRole("link", { name: "Calendar" }).first().click();
    await expect.poll(() => calls.some((call) => call.startsWith("/mobile/calendar/events"))).toBe(true);
  });
});
