import { expect, test, type Locator, type Page } from "@playwright/test";

async function openGlade(page: Page) {
	await page.route("**/api/**", (route) =>
		route.fulfill({
			json: route.request().url().includes("/auth/me")
				? { kind: "guest", user_id: "00000000-0000-4000-8000-000000000001" }
				: { personas: [], voice_credits: [] }
		})
	);
	await page.goto("/willow-glade");
	const game = page.getByTestId("willow-game");
	await expect(game).toHaveAttribute("data-status", "ready");
	await expect(game).toHaveAttribute("data-renderer", "webgl-3d");
	await expect(game.locator("canvas")).toHaveCount(1);
	return game;
}

async function position(game: Locator) {
	return game.evaluate((element) => ({
		x: Number((element as HTMLElement).dataset.playerX),
		y: Number((element as HTMLElement).dataset.playerY)
	}));
}

test("walks with pointer and keyboard, releases keys on blur, and remounts a single scene", async ({
	page
}) => {
	// Software WebGL compiles both the 3D scene and the existing Phaser scene here.
	test.setTimeout(60_000);
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	const game = await openGlade(page);
	const initial = await position(game);
	const box = (await game.boundingBox())!;
	await page.mouse.click(box.x + box.width * 0.56, box.y + box.height * 0.72);
	await expect
		.poll(async () => {
			const current = await position(game);
			return Math.hypot(current.x - initial.x, current.y - initial.y);
		})
		.toBeGreaterThan(25);
	await game.focus();
	const beforeKey = await position(game);
	await page.keyboard.down("ArrowRight");
	await expect.poll(async () => (await position(game)).x - beforeKey.x).toBeGreaterThan(20);
	await page.getByRole("link", { name: "Willow Glade", exact: true }).focus();
	await page.keyboard.up("ArrowRight");
	// The key was released outside the canvas; returning must not leave it held.
	await game.focus();
	const stopped = await position(game);
	await page.waitForTimeout(400);
	expect(Math.abs((await position(game)).x - stopped.x)).toBeLessThan(4);
	await page.getByRole("link", { name: "Mistwater", exact: true }).click();
	await expect(page.getByTestId("mistwater-game")).toBeVisible();
	await page.getByRole("link", { name: "Willow Glade", exact: true }).click();
	await expect(game).toHaveAttribute("data-status", "ready");
	await expect(game.locator("canvas")).toHaveCount(1);
	expect(errors).toEqual([]);
});

test("supports touch and keeps the scene sized to its mobile container", async ({ browser }) => {
	const context = await browser.newContext({
		viewport: { width: 390, height: 844 },
		isMobile: true,
		hasTouch: true,
		reducedMotion: "reduce"
	});
	const page = await context.newPage();
	try {
		const game = await openGlade(page);
		const before = await position(game);
		const box = (await game.boundingBox())!;
		await page.touchscreen.tap(box.x + box.width * 0.65, box.y + box.height * 0.63);
		await expect
			.poll(async () => {
				const after = await position(game);
				return Math.hypot(after.x - before.x, after.y - before.y);
			})
			.toBeGreaterThan(15);
		await page.setViewportSize({ width: 844, height: 390 });
		await expect
			.poll(async () =>
				game.evaluate((element) => {
					const canvas = element.querySelector("canvas")!;
					return (
						Math.abs(canvas.getBoundingClientRect().width - element.clientWidth) +
						Math.abs(canvas.getBoundingClientRect().height - element.clientHeight)
					);
				})
			)
			.toBeLessThan(2);
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
		).toBe(true);
	} finally {
		await context.close();
	}
});

test("offers recovery when the 3D graphics context is lost", async ({ page }) => {
	const game = await openGlade(page);
	await game
		.locator("canvas")
		.evaluate((canvas) =>
			canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }))
		);
	await expect(page.getByRole("alert")).toContainText("The 3D scene could not start");
	await page.getByRole("button", { name: "Try again", exact: true }).click();
	await expect(page.getByTestId("willow-game")).toHaveAttribute("data-status", "ready");
	await expect(page.getByTestId("willow-game").locator("canvas")).toHaveCount(1);
});
