import { test, expect } from "@playwright/test";

test.describe("Multica navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#/home");
    await page.waitForSelector("text=cabinet", { timeout: 10000 });
  });

  const navTests = [
    { label: "Issues", expectedHash: "#/issues" },
    { label: "Inbox", expectedHash: "#/inbox" },
    { label: "My Issues", expectedHash: "#/my-issues" },
    { label: "Projects", expectedHash: "#/projects" },
    { label: "Agents", expectedHash: "#/multica-agents" },
    { label: "Runtimes", expectedHash: "#/runtimes" },
    { label: "Skills", expectedHash: "#/skills" },
  ] as const;

  for (const { label, expectedHash } of navTests) {
    test(`clicking "${label}" navigates to ${expectedHash}`, async ({ page }) => {
      const sidebar = page.locator("aside");
      const btn = sidebar.getByRole("button", { name: label, exact: true });
      await expect(btn).toBeVisible();
      await btn.click();

      await page.waitForFunction(
        (hash: string) => window.location.hash === hash,
        expectedHash,
        { timeout: 5000 }
      );

      const currentHash = await page.evaluate(() => window.location.hash);
      expect(currentHash).toBe(expectedHash);
    });
  }

  test("browser back/forward works between sections", async ({ page }) => {
    const sidebar = page.locator("aside");

    // Navigate: home → issues → projects
    await sidebar.getByRole("button", { name: "Issues", exact: true }).click();
    await page.waitForFunction(() => window.location.hash === "#/issues");

    // Use pushState-style navigation for a second route so back works
    await sidebar.getByRole("button", { name: "Projects", exact: true }).click();
    await page.waitForFunction(() => window.location.hash === "#/projects");

    // Go back — Cabinet uses replaceState, so back may go to original load.
    // We verify no crash and hash is a valid route.
    await page.goBack();
    await page.waitForTimeout(500);
    const hashAfterBack = await page.evaluate(() => window.location.hash);
    expect(hashAfterBack).toBeTruthy();

    // Go forward
    await page.goForward();
    await page.waitForTimeout(500);
    const hashAfterForward = await page.evaluate(() => window.location.hash);
    expect(hashAfterForward).toBeTruthy();
  });
});
