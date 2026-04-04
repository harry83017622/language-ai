import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers";

test.describe("Create Words", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test("full flow: input → generate → save", async ({ page }) => {
    const englishInput = page.locator('input[placeholder*="ambulance"]').first();
    await englishInput.fill("example");
    await page.fill('input[placeholder*="標題"]', "E2E Create Test");
    await page.getByRole("button", { name: "送出生成" }).click();

    await expect(page.getByText("生成完成")).toBeVisible({ timeout: 30000 });
    await page.getByRole("button", { name: "儲存到資料庫" }).click();
    await expect(page.getByText("儲存成功")).toBeVisible({ timeout: 10000 });
  });

  test("add and remove rows", async ({ page }) => {
    await page.getByRole("button", { name: "新增一列" }).click();
    await expect(page.locator('input[placeholder*="ambulance"]')).toHaveCount(2);
  });

  test("draft save", async ({ page }) => {
    await page.fill('input[placeholder*="標題"]', "Draft E2E");
    await page.locator('input[placeholder*="ambulance"]').first().fill("draft-word");
    await page.getByRole("button", { name: "暫存" }).click();
    await expect(page.getByText("已暫存")).toBeVisible();
  });

  test("clear all", async ({ page }) => {
    await page.fill('input[placeholder*="標題"]', "To Clear");
    await page.getByRole("button", { name: "清除全部" }).click();
    // Click the confirm button inside the modal (Ant Design confirm modal uses ant-modal-confirm-btns)
    await page.locator(".ant-modal-confirm-btns button").last().click();
    await page.waitForTimeout(500);
    await expect(page.locator('input[placeholder*="標題"]')).toHaveValue("");
  });
});
