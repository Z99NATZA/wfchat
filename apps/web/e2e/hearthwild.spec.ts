import { expect, test, type Page } from "@playwright/test";
import { viewFor } from "../src/features/hearthwild/render";
import { newGame, SAVE_KEY, type GameState } from "../src/features/hearthwild/state";
async function openWorld(page: Page, state = newGame()) {
	await page.route("**/api/**", (route) =>
		route.fulfill({
			status: route.request().url().endsWith("/api/auth/me") ? 200 : 503,
			contentType: "application/json",
			body: route.request().url().endsWith("/api/auth/me")
				? JSON.stringify({ user_id: "guest", session_id: "guest", kind: "guest" })
				: "{}"
		})
	);
	await page.addInitScript(
		({ key, save }) => {
			localStorage.setItem("wfchat.locale", "en");
			if (!localStorage.getItem(key)) localStorage.setItem(key, save);
		},
		{ key: SAVE_KEY, save: JSON.stringify(state) }
	);
	await page.goto("/hearthwild");
	await expect(page.locator(".hw-place h2")).toBeVisible();
	await expect(page.getByText("Opening the garden…")).toBeHidden();
	await expect(page.getByText("Artwork could not load")).toBeHidden();
	await page.getByTestId("hearthwild-stage").focus();
}
async function savedState(page: Page): Promise<GameState> {
	return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
}

test("garden artwork, keyboard travel, grid edits, inventory and saved reload", async ({
	page
}) => {
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	await openWorld(page);
	const stage = page.getByTestId("hearthwild-stage"),
		canvas = page.getByTestId("hearthwild-canvas");
	await page.screenshot({ path: "test-results/hearthwild-garden.png" });
	await page.keyboard.press("g");
	await expect(page.getByRole("button", { name: "Toggle grid" })).toHaveAttribute(
		"aria-pressed",
		"true"
	);
	await page.getByRole("button", { name: "Place lantern", exact: true }).click();
	const bounds = (await canvas.boundingBox())!;
	const view = viewFor(newGame(), bounds.width, bounds.height, 1.2);
	const position = { x: (16.5 * 32 - view.cameraX) * 1.2, y: (12.5 * 32 - view.cameraY) * 1.2 };
	await canvas.click({ position });
	let saved = await savedState(page);
	expect(saved.wood).toBe(21);
	expect(
		saved.objects.garden.some((o) => o.id.startsWith("placed-") && o.kind === "lantern")
	).toBe(true);
	await page.getByRole("button", { name: "Remove & reclaim" }).click();
	await canvas.click({ position });
	saved = await savedState(page);
	expect(saved.wood).toBe(24);
	await page.getByRole("button", { name: "Explore", exact: true }).click();
	await stage.focus();
	await page.keyboard.down("w");
	await page.waitForTimeout(450);
	await page.keyboard.up("w");
	await page.keyboard.press("e");
	await expect(
		page.getByRole("heading", { name: "The Little Hearth", exact: true })
	).toBeVisible();
	await page.reload();
	await expect(
		page.getByRole("heading", { name: "The Little Hearth", exact: true })
	).toBeVisible();
	await page.getByRole("button", { name: "Backpack", exact: true }).first().click();
	await expect(page.getByRole("dialog", { name: "Backpack" })).toBeVisible();
	await page.getByRole("button", { name: "Close", exact: true }).click();
	expect(errors).toEqual([]);
	await page.screenshot({ path: "test-results/hearthwild-home.png" });
});
test("the bed darkens the world for ten seconds and advances exactly six hours", async ({
	page
}) => {
	const state = newGame();
	state.map = "home";
	state.x = 6.5;
	state.y = 6.5;
	state.hp = 40;
	state.awake = 30;
	await page.clock.install();
	await openWorld(page, state);
	await page.keyboard.press("e");
	await expect(page.getByTestId("sleep-overlay")).toBeVisible();
	const bedtime = (await savedState(page)).minutes;
	await page.clock.runFor(9000);
	await expect(page.getByTestId("sleep-overlay")).toBeVisible();
	await page.clock.runFor(1300);
	await expect(page.getByTestId("sleep-overlay")).toBeHidden();
	await page.getByTestId("hearthwild-stage").focus();
	await page.keyboard.press("f");
	const rested = await savedState(page);
	expect(rested.minutes - bedtime).toBeGreaterThanOrEqual(360);
	expect(rested.minutes - bedtime).toBeLessThan(362);
	expect(rested.hp).toBe(100);
});
test("forced sleep, paused menus and cavern combat work without a backend", async ({ page }) => {
	const state = newGame();
	state.map = "dungeon";
	state.x = 7.5;
	state.y = 15.5;
	state.awake = 8;
	await page.clock.install();
	await openWorld(page, state);
	await page.screenshot({ path: "test-results/hearthwild-dungeon.png" });
	await page.getByRole("button", { name: "How to play", exact: true }).click();
	await page.clock.runFor(200);
	const timer = await page.getByTestId("awake-timer").textContent();
	await page.clock.runFor(5000);
	expect(await page.getByTestId("awake-timer").textContent()).toBe(timer);
	await expect(page.getByTestId("sleep-overlay")).toBeHidden();
	await page.getByRole("button", { name: "Close", exact: true }).click();
	await page.getByTestId("hearthwild-stage").focus();
	await page.clock.runFor(32);
	await page.keyboard.press(" ");
	expect((await savedState(page)).enemies[0].hp).toBe(2);
	await page.clock.runFor(9000);
	await expect(page.getByTestId("sleep-overlay")).toBeVisible();
});
test("mobile Thai interface keeps the world and controls inside the viewport", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await openWorld(page);
	await page.evaluate(() => localStorage.setItem("wfchat.locale", "th"));
	// The initialization script only supplies English for a fresh device.
	await page.addInitScript(() => localStorage.setItem("wfchat.locale", "th"));
	await page.reload();
	await expect(page.getByRole("heading", { name: "สวนวิลโลว์บรูก" })).toBeVisible();
	const bounds = (await page.getByTestId("hearthwild-stage").boundingBox())!,
		toolbar = (await page.locator(".hw-toolbar").boundingBox())!;
	expect(toolbar.x).toBeGreaterThanOrEqual(bounds.x);
	expect(toolbar.x + toolbar.width).toBeLessThanOrEqual(390);
	await page.getByRole("button", { name: "วิธีเล่น", exact: true }).click();
	await expect(page.getByRole("dialog", { name: "วิธีเล่น" })).toBeVisible();
	await page.getByRole("button", { name: "ปิด", exact: true }).click();
	await page.screenshot({ path: "test-results/hearthwild-mobile-th.png" });
});
