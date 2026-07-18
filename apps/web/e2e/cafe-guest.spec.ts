import { expect, test } from "@playwright/test";

const cafeUrl = "http://localhost:5173/cafe";

test("guest-friendly badge stays readable in dark mode", async ({ page }) => {
	await page.goto("/cafe");
	await expect(page.locator("html")).toHaveClass(/dark/);
	const badge = page.getByText(/No login required|ไม่ต้องเข้าสู่ระบบ/);
	await expect(badge).toBeVisible();
	const colors = await badge.evaluate((element) => {
		const style = getComputedStyle(element);
		return { foreground: style.color, background: style.backgroundColor };
	});

	expect(contrastRatio(colors.foreground, colors.background)).toBeGreaterThanOrEqual(4.5);
	await page.screenshot({
		path: "test-results/aiko-cafe-dark-badge.png",
		fullPage: true
	});
});

test("two guests quick join the same cafe", async ({ browser }) => {
	const firstContext = await browser.newContext();
	const secondContext = await browser.newContext();
	const firstPage = await firstContext.newPage();
	const secondPage = await secondContext.newPage();

	try {
		await firstPage.goto(cafeUrl);
		await expect(firstPage.getByText("Aiko Cafe").first()).toBeVisible();
		await firstPage.getByRole("button", { name: /Quick Join|เข้าห้องทันที/ }).click();
		await expect(firstPage).toHaveURL(/\/cafe\/rooms\/[0-9a-f-]{36}$/);
		await expect(firstPage.locator("canvas")).toBeVisible();

		await secondPage.goto(cafeUrl);
		await secondPage.getByRole("button", { name: /Quick Join|เข้าห้องทันที/ }).click();
		await expect(secondPage).toHaveURL(firstPage.url());
		await expect(firstPage.getByText(/^Guest [0-9A-F]{4}$/)).toHaveCount(2);

		await firstPage.screenshot({
			path: "test-results/aiko-cafe-room.png",
			fullPage: true
		});

		await firstPage.setViewportSize({ width: 390, height: 844 });
		await expect(firstPage.getByRole("button", { name: "Up" })).toBeVisible();
		await expect(firstPage.getByRole("button", { name: /Interact|โต้ตอบ/ })).toBeVisible();
		await firstPage.screenshot({
			path: "test-results/aiko-cafe-mobile.png",
			fullPage: true
		});
	} finally {
		await firstContext.close();
		await secondContext.close();
	}
});

function contrastRatio(foreground: string, background: string) {
	const luminance = (value: string) => {
		const channels =
			value
				.match(/[\d.]+/g)
				?.slice(0, 3)
				.map(Number) ?? [];
		const linear = channels.map((channel) => {
			const normalized = channel / 255;
			return normalized <= 0.04045
				? normalized / 12.92
				: ((normalized + 0.055) / 1.055) ** 2.4;
		});
		return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
	};
	const lighter = Math.max(luminance(foreground), luminance(background));
	const darker = Math.min(luminance(foreground), luminance(background));
	return (lighter + 0.05) / (darker + 0.05);
}
