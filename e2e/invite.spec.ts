import { expect, test } from "@playwright/test";

test("guest can enter the demo dojo and take a seat", async ({ page }) => {
  await page.goto("/g/demo");
  await expect(page.getByRole("heading", { name: "Friday Mah Jong" })).toBeVisible();
  await expect(page.getByText("6 of 8 seats taken")).toBeVisible();

  await page.getByRole("button", { name: "Enter the dojo" }).click();
  await page.getByLabel("Your name").fill("Eleanor");
  await page.getByRole("button", { name: "Take a seat" }).click();

  await expect(page.getByText("Eleanor")).toBeVisible();
  await expect(page.getByText("You're at Table 2.")).toBeVisible();
  await expect(page.getByText("7 of 8 seats taken")).toBeVisible();
});

test("guest can cancel a demo RSVP", async ({ page }) => {
  await page.goto("/g/demo");
  await page.getByRole("button", { name: "Enter the dojo" }).click();
  await page.getByLabel("Your name").fill("Eleanor");
  await page.getByRole("button", { name: "Take a seat" }).click();
  await page.getByRole("button", { name: "I can't make it" }).click();

  await expect(page.getByRole("button", { name: "Enter the dojo" })).toBeVisible();
  await expect(page.getByText("6 of 8 seats taken")).toBeVisible();
});
