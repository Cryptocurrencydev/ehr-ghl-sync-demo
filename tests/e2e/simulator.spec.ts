import { expect, test, type Page } from "@playwright/test";

const run = async (page: Page, id: string, title: string) => {
  await page.getByTestId(`run-${id}`).click();
  await expect(page.getByTestId("result-title")).toHaveText(title);
};
const after = (page: Page) => page.getByTestId("after");
const before = (page: Page) => page.getByTestId("before");
const latestLedgerRow = (page: Page) => page.getByTestId("ledger").locator("tbody tr").first();

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("starts empty and shows the DC Tech credit", async ({ page }) => {
  await expect(page.getByText("Choose a scenario to send its webhook")).toBeVisible();
  await expect(page.getByTestId("ledger-empty")).toBeVisible();
  const link = page.getByRole("link", { name: "DC Tech" });
  await expect(link).toHaveAttribute("href", "https://dctechltd.com");
  await expect(page.locator("footer")).toContainText("Demo by DC Tech");
});

test("the footer also appears on the not-found page", async ({ page }) => {
  await page.goto("/nowhere");
  await expect(page.getByRole("link", { name: "DC Tech" })).toHaveAttribute("href", "https://dctechltd.com");
});

test("organic lead books", async ({ page }) => {
  await run(page, "organic-books", "Organic lead books");
  await expect(before(page)).toContainText("New Lead");
  await expect(after(page)).toContainText("Consult Booked");
  await expect(after(page)).toContainText("consult-booked");
  await expect(after(page).locator("[data-changed]").filter({ hasText: "Follow-up running" })).toContainText("None");
  await expect(latestLedgerRow(page)).toContainText("Applied");
});

test("paid lead keeps its pipeline and attribution", async ({ page }) => {
  await run(page, "paid-books", "Paid ad lead books");
  await expect(after(page)).toContainText("Northfield Paid Ads");
  await expect(after(page)).toContainText("Spring back pain relief");
  await expect(after(page).locator("[data-changed]").filter({ hasText: "Campaign" })).toHaveCount(0);
  await expect(after(page).locator("[data-changed]").filter({ hasText: "Pipeline" })).toHaveCount(0);
  await expect(after(page).locator("[data-changed]").filter({ hasText: "Source" })).toHaveCount(0);
});

test("a duplicate delivery changes nothing", async ({ page }) => {
  await run(page, "duplicate-delivery", "Same webhook arrives twice");
  await expect(page.getByTestId("meridian")).toHaveCount(2);
  await expect(page.getByTestId("meridian").nth(1)).toContainText("Duplicate");
  await expect(page.getByTestId("calls").getByText("PUT")).toHaveCount(1);
  await expect(latestLedgerRow(page)).toContainText("Duplicate");
});

test("a new email with the same phone finds the same contact", async ({ page }) => {
  await run(page, "different-email", "New email, same phone");
  await expect(page.getByTestId("meridian")).toContainText("By phone");
  await expect(after(page)).toContainText("priya.raman@example.com");
  await expect(after(page)).toContainText("9 contacts");
});

test("a reschedule changes the time and keeps the stage", async ({ page }) => {
  await run(page, "reschedule", "Patient reschedules");
  await expect(after(page).locator("[data-changed]")).toHaveCount(1);
  await expect(after(page).locator("[data-changed]")).toContainText("Consult time");
  await expect(after(page)).toContainText("Consult Booked");
});

test("a cancellation starts the re-book sequence", async ({ page }) => {
  await run(page, "cancellation", "Patient cancels");
  await expect(after(page)).toContainText("Consult Cancelled");
  await expect(after(page)).toContainText("Re-book sequence");
});

test("a treatment is ignored", async ({ page }) => {
  await run(page, "treatment-ignored", "Existing patient books a treatment");
  await expect(page.getByTestId("no-calls")).toBeVisible();
  await expect(after(page).locator("[data-changed]")).toHaveCount(0);
  await expect(latestLedgerRow(page)).toContainText("Ignored");
});

test("an unknown person gets a contact and opportunity", async ({ page }) => {
  await run(page, "unknown-consult", "Unknown person books a consult");
  await expect(before(page)).toContainText("No contact with this phone or email");
  await expect(after(page)).toContainText("Owen Mercer");
  await expect(after(page)).toContainText("direct booking");
  await expect(after(page)).toContainText("10 contacts and 9 opportunities");
});

test("an unclear match is flagged and nothing is merged", async ({ page }) => {
  await run(page, "ambiguous", "Unclear match");
  await expect(page.getByTestId("meridian")).toContainText("Needs review");
  await expect(after(page).locator("[data-changed]")).toHaveCount(0);
  await expect(latestLedgerRow(page)).toContainText("Needs review");
  await expect(latestLedgerRow(page)).toContainText("c_katherine");
});

test("notes and card data are stripped", async ({ page }) => {
  await run(page, "notes-and-card", "Notes and card data in the payload");
  const payload = page.getByTestId("payload");
  for (const field of ["notes", "diagnosis", "card"]) {
    await expect(payload.locator("[data-dropped]").filter({ hasText: field }).first()).toBeVisible();
  }
  const row = latestLedgerRow(page);
  await expect(row).toContainText("card.number");
  await expect(row).toContainText("diagnosis");
  await expect(row).not.toContainText("4111");
  await expect(row).not.toContainText("migraine");
  await expect(page.getByTestId("calls")).not.toContainText("migraine");
});

test("the payload is labelled as assumed", async ({ page }) => {
  await run(page, "organic-books", "Organic lead books");
  await expect(page.getByTestId("assumed-label")).toContainText("Assumed format");
  await expect(page.getByRole("heading", { name: "Assumed until we see a real webhook" })).toBeVisible();
});

test("a scenario can be repeated and the ledger grows", async ({ page }) => {
  await run(page, "organic-books", "Organic lead books");
  await expect(page.getByTestId("ledger").locator("tbody tr")).toHaveCount(1);
  await page.getByTestId("run-organic-books").click();
  await expect(page.getByTestId("ledger").locator("tbody tr")).toHaveCount(2);
  await expect(latestLedgerRow(page)).toContainText("Applied");
});

test("the ledger survives a reload", async ({ page }) => {
  await run(page, "cancellation", "Patient cancels");
  await expect(latestLedgerRow(page)).toContainText("Applied");
  await page.reload();
  await expect(latestLedgerRow(page)).toContainText("Applied");
});

test("the page has no sideways scroll at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await run(page, "notes-and-card", "Notes and card data in the payload");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
});

test("the webhook refuses a wrong secret", async ({ request }) => {
  const res = await request.put("/api/webhooks/optimantra/not-the-secret", { data: {} });
  expect(res.status()).toBe(404);
});
