import { ANIMATIONS } from "../src/features/hearthwild/animation";
import { WALK_SOURCES } from "../src/features/hearthwild/playerSprites";
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
	await page.clock.runFor(240);
	await page.keyboard.press("f");
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

test("Aiko changes from idle to walk and Shift sprint, then returns to idle", async ({ page }) => {
	const expectedSheets = new Set([
		...Object.values(ANIMATIONS).map((a) => a.url),
		...Object.values(WALK_SOURCES)
	]);
	const sheets = new Set<string>();
	page.on("response", (response) => {
		const path = new URL(response.url()).pathname;
		if (expectedSheets.has(path)) sheets.add(path);
	});
	const frozenTime = new Date("2026-01-01T00:00:00Z");
	await page.clock.install({ time: frozenTime });
	await openWorld(page);
	await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
	const stage = page.getByTestId("hearthwild-stage");
	await page.keyboard.down("d");
	await page.clock.runFor(300);
	await expect(stage).toHaveAttribute("data-motion", "walk");
	await page.keyboard.press("f");
	const walked = (await savedState(page)).x - 14.5;
	await page.keyboard.down("Shift");
	await page.clock.runFor(300);
	await expect(stage).toHaveAttribute("data-motion", "run");
	await page.keyboard.press("f");
	const ran = (await savedState(page)).x - 14.5 - walked;
	expect(ran).toBeGreaterThan(walked * 1.4);
	await page.screenshot({ path: "test-results/hearthwild-aiko-running.png" });
	await page.keyboard.up("Shift");
	await page.clock.runFor(200);
	await expect(stage).toHaveAttribute("data-motion", "walk");
	await page.keyboard.up("d");
	await page.clock.runFor(200);
	await expect(stage).toHaveAttribute("data-motion", "idle");
	expect(sheets).toEqual(expectedSheets);
});

test("Aiko equips a bow, draws, releases an arrow and saves her weapon choice", async ({
	page
}) => {
	const state = newGame();
	state.map = "dungeon";
	state.x = 12.5;
	state.y = 16.5;
	state.direction = 3;
	state.enemies = [{ id: 0, x: 18, y: 16.5, hp: 1 }];
	const frozenTime = new Date("2026-01-01T00:00:00Z");
	await page.clock.install({ time: frozenTime });
	await openWorld(page, state);
	await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
	await page.getByRole("button", { name: "Bow", exact: true }).click();
	await expect(page.getByTestId("hearthwild-stage")).toHaveAttribute("data-weapon", "bow");
	await page.keyboard.press(" ");
	await expect(page.getByTestId("hearthwild-stage")).toHaveAttribute("data-animation", "bow");
	await page.clock.runFor(180);
	await page.screenshot({ path: "test-results/hearthwild-aiko-bow.png" });
	await page.clock.runFor(180);
	await page.keyboard.press("f");
	let saved = await savedState(page);
	expect(saved.projectiles).toHaveLength(1);
	expect(saved.enemies[0].hp).toBe(1);
	await page.clock.runFor(500);
	await page.keyboard.press("f");
	saved = await savedState(page);
	expect(saved.enemies[0].hp).toBe(0);
	expect(saved.coins).toBe(37);
	await page.clock.resume();
	await page.reload();
	await expect(page.getByTestId("hearthwild-stage")).toHaveAttribute("data-weapon", "bow");
});

test("Aiko idle soles stay planted and every walking frame shares its registration", async ({
	page
}) => {
	await openWorld(page);
	const stats = await page.evaluate(async () => {
		const modulePath = "/src/features/hearthwild/playerSprites.ts";
		const { prepareIdle, prepareWalk, measureFrame, PLAYER_CELL } = await import(modulePath);
		const load = (src: string) =>
			new Promise<HTMLImageElement>((resolve, reject) => {
				const image = new Image();
				image.onload = () => resolve(image);
				image.onerror = reject;
				image.src = src;
			});
		const [idleImage, front, back, side] = await Promise.all([
			load("/images/hearthwild/aiko-idle-v2.png"),
			load("/images/hearthwild/aiko-walk-front-v2.png"),
			load("/images/hearthwild/aiko-walk-back-v2.png"),
			load("/images/hearthwild/aiko-walk-side-v2.png")
		]);
		const idle = prepareIdle(idleImage) as HTMLCanvasElement,
			walk = prepareWalk({ front, back, side }) as HTMLCanvasElement;
		const hash = (p: Uint8ClampedArray) => {
			let h = 2166136261;
			for (const n of p) h = Math.imul(h ^ n, 16777619);
			return h >>> 0;
		};
		const soles = Array.from({ length: 4 }, (_, row) =>
			Array.from({ length: 4 }, (_, col) =>
				hash(idle.getContext("2d")!.getImageData(col * 96, row * 96 + 58, 96, 38).data)
			)
		);
		const ctx = walk.getContext("2d")!,
			pixels = ctx.getImageData(0, 0, walk.width, walk.height).data;
		const registration = Array.from({ length: 4 }, (_, row) =>
			Array.from({ length: 8 }, (_, col) => {
				const b = measureFrame(pixels, walk.width, {
					x: col * PLAYER_CELL,
					y: row * PLAYER_CELL,
					width: PLAYER_CELL,
					height: PLAYER_CELL
				});
				return {
					head: b.anchorX - col * PLAYER_CELL,
					sole: b.anchorY - row * PLAYER_CELL,
					height: b.height
				};
			})
		);
		const review = document.createElement("section");
		review.id = "aiko-atlas-review";
		review.style.cssText =
			"position:fixed;inset:0;z-index:9999;background:#122c38;color:#d8e5eb;padding:22px;font:14px system-ui;display:flex;gap:16px;align-items:flex-start";
		for (const [title, canvas] of [
			["Walk · 8 frames × down / up / left / right", walk],
			["Idle · planted feet + breathing", idle]
		] as const) {
			const col = document.createElement("div"),
				label = document.createElement("p");
			label.textContent = title;
			label.style.margin = "0 0 16px";
			canvas.style.cssText = "image-rendering:pixelated;background:#29424a;display:block";
			col.append(label, canvas);
			review.append(col);
		}
		document.body.append(review);
		return { soles, registration };
	});
	for (const row of stats.soles) expect(new Set(row).size).toBe(1);
	for (const row of stats.registration) {
		expect(
			Math.max(...row.map((f) => f.sole)) - Math.min(...row.map((f) => f.sole))
		).toBeLessThanOrEqual(1);
		expect(
			Math.max(...row.map((f) => f.height)) - Math.min(...row.map((f) => f.height))
		).toBeLessThanOrEqual(1);
		for (const frame of row) expect(Math.abs(frame.head - 48)).toBeLessThan(1);
	}
	await page.screenshot({ path: "test-results/hearthwild-aiko-motion-contact.png" });
});
