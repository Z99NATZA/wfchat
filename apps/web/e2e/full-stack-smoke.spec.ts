import { expect, test } from "@playwright/test";

test("guest chat is persisted through the Web, API, and PostgreSQL stack", async ({ page }) => {
	const message = `Full-stack smoke ${Date.now()}`;
	const assistantReply = `[aiko_default] mock reply: I received "${message}".`;

	const healthResponse = await page.request.get("/api/health");
	expect(healthResponse.ok()).toBe(true);
	await expect(healthResponse.json()).resolves.toEqual({ status: "ok" });

	await page.goto("/chat");
	await expect(page.getByText("Aiko").first()).toBeVisible();

	await page.getByPlaceholder("Message Aiko", { exact: true }).fill(message);
	await page.getByRole("button", { name: "Send message", exact: true }).click();

	await expect(page).toHaveURL(/\/chat\/[0-9a-f-]+$/);
	await expect(page.getByRole("article").getByText(message, { exact: true })).toBeVisible();
	await expect(
		page.getByRole("article").getByText(assistantReply, { exact: true })
	).toBeVisible();

	await page.reload();

	await expect(page.getByRole("article").getByText(message, { exact: true })).toBeVisible();
	await expect(
		page.getByRole("article").getByText(assistantReply, { exact: true })
	).toBeVisible();
});
