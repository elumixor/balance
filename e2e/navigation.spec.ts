import { expect, test, type Page } from "@playwright/test";
import { activityRow, authenticate, recordApiCalls } from "./auth";

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
    await expect(page.getByLabel("Connect Google Calendar").first()).toBeVisible({ timeout: 15_000 });
    // The startup warm-up fetches every tab's data; let it finish before counting requests.
    await expect.poll(() => page.getByRole("link", { name: "Planning" }).count()).toBeGreaterThan(0);
    await page.waitForTimeout(2500);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("costs no requests when nothing has changed", async () => {
    const calls = recordApiCalls(page);

    // Each marker is something only that screen's own data can draw: the plan dial's readout of
    // how much of the week is claimed, the calendar's connect card, and a row of the activities
    // list. Seeing them means the screen rendered from what the store already held.
    for (const [label, marker] of [
      ["Planning", page.getByText(/of 168h claimed/)],
      ["Calendar", page.getByLabel("Connect Google Calendar")],
      ["Planning", page.getByLabel("Archive Coding")],
    ] as const) {
      await page.getByRole("link", { name: label }).first().click();
      await expect(marker.first()).toBeVisible();
    }

    expect(calls).toEqual([]);
  });

  test("refetches the screens a write left stale", async () => {
    await page.goto("/planning");

    // Narrowing a share is the whole write: the rows save themselves, so the edit is the split
    // itself rather than anything a dialog would have collected first. Giving hours back is
    // always allowed, and app.spec leaves this row at 60, so the nudge is the same every run.
    const share = activityRow(page, "Coding").getByRole("textbox", { name: "Deep Work percent", exact: true });
    await expect(share).toBeVisible({ timeout: 10_000 });
    const next = String(Number(await share.inputValue()) - 5);
    // Every write in the app rides one endpoint now — see `@elumixor/synced`.
    const written = page.waitForResponse(
      (response) => response.request().method() === "POST" && response.url().includes("/mobile/sync"),
    );
    await share.fill(next);
    await share.press("Enter");
    await written;

    // An activity's split changes what its events count toward, so the week is now stale.
    const calls = recordApiCalls(page);
    await page.getByRole("link", { name: "Calendar" }).first().click();
    await expect.poll(() => calls.some((call) => call.startsWith("/mobile/calendar/events"))).toBe(true);
  });
});
