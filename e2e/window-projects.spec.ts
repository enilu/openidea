import { expect, test } from "./fixtures";

test("window projects retain closed entries across reloads without replacing the active project", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    const key = "openidea.window.projects:main";
    if (!localStorage.getItem(key)) {
      localStorage.setItem(
        key,
        JSON.stringify([
          { path: "/dev/acme-api", name: "acme-api" },
          { path: "/dev/web", name: "web" },
          { path: "/dev/tools", name: "tools" },
        ]),
      );
    }
  });
  await page.goto("/");
  const sidebar = page.getByRole("complementary", { name: "Window Projects" });
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByText("Open", { exact: true })).toHaveCount(1);
  await expect(sidebar.getByText("Closed", { exact: true })).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath("window-projects.png"), animations: "disabled" });
  const web = sidebar.getByRole("listitem").filter({ has: page.getByText("/dev/web", { exact: true }) });
  await web.getByRole("button", { name: "Remove from this window (keep files)" }).click();
  await expect(sidebar.getByText("/dev/web", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("tree", { name: "Project" })).toBeVisible();
  await page.reload();
  await expect(sidebar.getByRole("listitem")).toHaveCount(2);
  await expect(sidebar.getByText("Open", { exact: true })).toHaveCount(1);
  await expect(sidebar.getByText("/dev/tools", { exact: true })).toBeVisible();
});
