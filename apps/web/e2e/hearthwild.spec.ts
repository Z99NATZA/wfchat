import { ANIMATIONS } from "../src/features/hearthwild/animation";
import { WALK_SOURCES, RUN_SOURCES } from "../src/features/hearthwild/playerSprites";
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
test("the bed keeps the dimmed map visible for ten seconds and advances exactly six hours", async ({
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
	const stage = page.getByTestId("hearthwild-stage"),
		canvas = page.getByTestId("hearthwild-canvas"),
		sleep = page.getByTestId("sleep-overlay");
	await page.keyboard.press("e");
	await expect(sleep).toBeVisible();
	await expect(stage).toHaveAttribute("data-sleeping", "true");
	await expect(sleep).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
	await expect(canvas).toHaveCSS("filter", "brightness(0.3) saturate(0.68) contrast(0.94)");
	await expect(sleep.getByText("Resting", { exact: true })).toBeVisible();
	await expect(sleep.locator("b")).toHaveText(/^(9|10)s$/);
	await page.screenshot({ path: "test-results/hearthwild-sleep-map-dim.png" });
	const bedtime = (await savedState(page)).minutes;
	await page.clock.runFor(9000);
	await expect(sleep).toBeVisible();
	await page.clock.runFor(1300);
	await expect(sleep).toBeHidden();
	await expect(stage).toHaveAttribute("data-sleeping", "false");
	await stage.focus();
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
		...Object.values(WALK_SOURCES),
		...Object.values(RUN_SOURCES)
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

test("Aiko idle soles stay planted and walking poses keep one stable anatomical scale", async ({
	page
}) => {
	await openWorld(page);
	const stats = await page.evaluate(async () => {
		const modulePath = "/src/features/hearthwild/playerSprites.ts";
		const { prepareIdle, prepareWalk, measureFrame, PLAYER_CELL, PLAYER_HEAD_WIDTH } =
			await import(modulePath);
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
					headWidth: b.headWidth,
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
		return { soles, registration, headWidth: PLAYER_HEAD_WIDTH };
	});
	for (const row of stats.soles) expect(new Set(row).size).toBe(1);
	for (const row of stats.registration) {
		expect(
			Math.max(...row.map((f) => f.sole)) - Math.min(...row.map((f) => f.sole))
		).toBeLessThanOrEqual(1);
		expect(
			Math.max(...row.map((f) => f.height)) - Math.min(...row.map((f) => f.height))
		).toBeLessThanOrEqual(3);
		for (const frame of row) {
			expect(Math.abs(frame.head - 48)).toBeLessThan(1);
			expect(Math.abs(frame.headWidth - stats.headWidth)).toBeLessThanOrEqual(2);
		}
	}
	await page.screenshot({ path: "test-results/hearthwild-aiko-motion-contact.png" });
});

test("Aiko running keeps standing scale and a supporting sole in all directions", async ({
	page
}) => {
	await openWorld(page);
	const stats = await page.evaluate(async () => {
		const modulePath = "/src/features/hearthwild/playerSprites.ts";
		const {
			prepareIdle,
			prepareRun,
			measureFrame,
			PLAYER_CELL,
			PLAYER_FOOT,
			PLAYER_BODY_HEIGHT,
			PLAYER_HEAD_WIDTH
		} = await import(modulePath);
		const load = (src: string) =>
			new Promise<HTMLImageElement>((resolve, reject) => {
				const image = new Image();
				image.onload = () => resolve(image);
				image.onerror = reject;
				image.src = src;
			});
		const [idleImage, front, back, side] = await Promise.all([
			load("/images/hearthwild/aiko-idle-v2.png"),
			load("/images/hearthwild/aiko-run-front-v2.png"),
			load("/images/hearthwild/aiko-run-back-v2.png"),
			load("/images/hearthwild/aiko-run-side-v2.png")
		]);
		const idle = prepareIdle(idleImage) as HTMLCanvasElement,
			run = prepareRun({ front, back, side }) as HTMLCanvasElement,
			ctx = run.getContext("2d")!,
			pixels = ctx.getImageData(0, 0, run.width, run.height).data;
		const frames = Array.from({ length: 4 }, (_, row) =>
			Array.from({ length: 8 }, (_, col) => {
				const b = measureFrame(pixels, run.width, {
					x: col * PLAYER_CELL,
					y: row * PLAYER_CELL,
					width: PLAYER_CELL,
					height: PLAYER_CELL
				});
				const ground = ctx.getImageData(
					col * PLAYER_CELL,
					row * PLAYER_CELL + PLAYER_FOOT.y - 3,
					PLAYER_CELL,
					3
				).data;
				let support = 0;
				for (let i = 3; i < ground.length; i += 4) if (ground[i] >= 48) support++;
				return {
					head: b.anchorX - col * PLAYER_CELL,
					headWidth: b.headWidth,
					sole: b.anchorY - row * PLAYER_CELL,
					height: b.height,
					support
				};
			})
		);
		const idleContext = idle.getContext("2d")!,
			idlePixels = idleContext.getImageData(0, 0, idle.width, idle.height).data,
			idleHeights = Array.from({ length: 4 }, (_, row) =>
				Array.from(
					{ length: 4 },
					(_, col) =>
						measureFrame(idlePixels, idle.width, {
							x: col * PLAYER_CELL,
							y: row * PLAYER_CELL,
							width: PLAYER_CELL,
							height: PLAYER_CELL
						}).height
				)
			);
		const review = document.createElement("section");
		review.style.cssText =
			"position:fixed;inset:0;z-index:9999;background:#122c38;color:#d8e5eb;padding:24px;font:14px system-ui;display:flex;gap:24px;align-items:flex-start";
		const idleReview = document.createElement("div"),
			runReview = document.createElement("div"),
			idleLabel = document.createElement("p");
		idleLabel.textContent = "Aiko idle · standing scale reference";
		idle.style.cssText = "image-rendering:pixelated;background:#29424a;display:block";
		idleReview.append(idleLabel, idle);
		const label = document.createElement("p");
		label.textContent =
			"Aiko grounded run · 8 phases × down / up / left / right · common contact plane";
		run.style.cssText = "image-rendering:pixelated;background:#29424a;display:block";
		runReview.append(label, run);
		review.append(idleReview, runReview);
		document.body.append(review);
		return {
			frames,
			idleHeights,
			foot: PLAYER_FOOT.y,
			height: PLAYER_BODY_HEIGHT,
			headWidth: PLAYER_HEAD_WIDTH
		};
	});
	for (const [rowIndex, row] of stats.frames.entries()) {
		for (const frame of row) {
			expect(Math.abs(frame.head - 48)).toBeLessThan(1);
			expect(Math.abs(frame.headWidth - stats.headWidth)).toBeLessThanOrEqual(2);
			expect(Math.abs(frame.sole - stats.foot)).toBeLessThanOrEqual(1);
			expect(Math.abs(frame.height - stats.height)).toBeLessThanOrEqual(1);
			expect(frame.support).toBeGreaterThanOrEqual(3);
		}
		const runHeight = row.reduce((sum, frame) => sum + frame.height, 0) / row.length,
			idleHeight =
				stats.idleHeights[rowIndex].reduce((sum, height) => sum + height, 0) /
				stats.idleHeights[rowIndex].length;
		expect(Math.abs(runHeight - idleHeight)).toBeLessThanOrEqual(2);
	}
	await page.screenshot({ path: "test-results/hearthwild-aiko-run-contact.png" });
});

test("garden night visibility is brighter near Aiko, dim but readable outside and follows world coordinates", async ({
	page
}) => {
	const state = newGame();
	state.minutes = 1200;
	state.x = 18.5;
	state.y = 12.5;
	await page.clock.install();
	await openWorld(page, state);
	await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
	const samples = await page.evaluate(async () => {
		const modulePath = "/src/features/hearthwild/lighting.ts";
		const { drawGardenNight } = await import(modulePath);
		const s = { map: "garden", minutes: 1200, x: 5, y: 244 / 32 };
		const canvas = document.createElement("canvas");
		canvas.width = 960;
		canvas.height = 672;
		const ctx = canvas.getContext("2d")!;
		const brightness = (x: number, y: number) => {
			const c = ctx.getImageData(x, y, 1, 1).data;
			return (c[0] + c[1] + c[2]) / 3;
		};
		const paint = (zoom = 1, cameraX = 0, cameraY = 0) => {
			ctx.fillStyle = "#808080";
			ctx.fillRect(0, 0, 960, 672);
			ctx.save();
			ctx.scale(zoom, zoom);
			ctx.translate(-cameraX, -cameraY);
			drawGardenNight(ctx, s, 960, 672);
			ctx.restore();
		};
		paint();
		const night = {
			near: brightness(160, 224),
			middle: brightness(224, 224),
			far: brightness(528, 224)
		};
		s.x += 8;
		paint();
		const moved = { near: brightness(416, 224), old: brightness(160, 224) };
		paint(1.5, 80, 20);
		const zoomed = brightness((416 - 80) * 1.5, (224 - 20) * 1.5);
		s.minutes = 720;
		paint();
		const day = { near: brightness(416, 224), far: brightness(528, 224) };
		return { night, moved, zoomed, day };
	});
	expect(samples.night.near).toBeGreaterThan(samples.night.far * 2.2);
	expect(samples.night.near).toBeGreaterThan(samples.night.middle);
	expect(samples.night.middle).toBeGreaterThan(samples.night.far);
	expect(samples.night.far).toBeGreaterThan(25);
	expect(samples.night.far).toBeLessThan(65);
	expect(samples.moved.near).toBeGreaterThan(samples.moved.old * 2.2);
	expect(Math.abs(samples.zoomed - samples.night.near)).toBeLessThan(2);
	expect(samples.day).toEqual({ near: 128, far: 128 });
	await page.screenshot({ path: "test-results/hearthwild-night-player-light.png" });
	await page.getByTestId("hearthwild-stage").focus();
	await page.keyboard.down("d");
	await page.clock.runFor(600);
	await page.keyboard.up("d");
	await page.clock.runFor(160);
	await page.keyboard.press("f");
	expect((await savedState(page)).x).toBeGreaterThan(20);
	await page.getByRole("button", { name: "Zoom in", exact: true }).click();
	await page.clock.runFor(160);
	await page.screenshot({ path: "test-results/hearthwild-night-follow-zoom.png" });
});

test("day/night test button previews lighting without changing game time or saves", async ({
	page
}) => {
	await page.clock.install();
	await openWorld(page);
	await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
	const stage = page.getByTestId("hearthwild-stage"),
		toggle = page.getByRole("button", {
			name: "Toggle day/night lighting (test)",
			exact: true
		});
	const luminance = () =>
		page.getByTestId("hearthwild-canvas").evaluate((el) => {
			const canvas = el as HTMLCanvasElement,
				p = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
			let sum = 0,
				n = 0;
			for (let i = 0; i < p.length; i += 4 * 64) {
				sum += (p[i] + p[i + 1] + p[i + 2]) / 3;
				n++;
			}
			return sum / n;
		});
	await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
	const before = await savedState(page);
	await expect(stage).toHaveAttribute("data-lighting-preview", "auto");
	await toggle.focus();
	await page.keyboard.press("Enter");
	await page.clock.runFor(160);
	await expect(stage).toHaveAttribute("data-lighting-preview", "night");
	await expect(toggle).toHaveAttribute("aria-pressed", "true");
	const night = await luminance();
	await page.screenshot({ path: "test-results/hearthwild-light-test-night.png" });
	await toggle.click();
	await page.clock.runFor(160);
	await expect(stage).toHaveAttribute("data-lighting-preview", "day");
	await expect(toggle).toHaveAttribute("aria-pressed", "false");
	const day = await luminance();
	expect(day).toBeGreaterThan(night * 1.4);
	await page.getByRole("button", { name: "Follow the game clock", exact: true }).click();
	await page.clock.runFor(160);
	await expect(stage).toHaveAttribute("data-lighting-preview", "auto");
	await toggle.click();
	await page.clock.runFor(160);
	await expect(stage).toHaveAttribute("data-lighting-preview", "night");
	await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
	const after = await savedState(page);
	expect(after.minutes - before.minutes).toBeGreaterThanOrEqual(0);
	expect(after.minutes - before.minutes).toBeLessThan(2);
	expect(before.awake - after.awake).toBeLessThan(1.5);
	expect(after.objects).toEqual(before.objects);
	expect(after.food).toBe(before.food);
	expect(after.sleep).toBe(0);
	expect(after).not.toHaveProperty("lightingPreview");
	await expect(page.locator(".hw-clock b")).toHaveText(/^06:/);
	await page.clock.resume();
	await page.reload();
	await expect(stage).toHaveAttribute("data-lighting-preview", "auto");
	await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("th");
	await page.setViewportSize({ width: 390, height: 844 });
	const thaiToggle = page.getByRole("button", {
		name: "สลับกลางวัน/กลางคืน (ทดสอบ)",
		exact: true
	});
	await expect(thaiToggle).toBeVisible();
	await thaiToggle.click();
	await expect(stage).toHaveAttribute("data-lighting-preview", "night");
	const bounds = (await page.locator(".hw-light-preview").boundingBox())!;
	expect(bounds.x).toBeGreaterThanOrEqual(48);
	expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
	await page.screenshot({ path: "test-results/hearthwild-light-test-mobile.png" });
	await page.getByRole("button", { name: "กลับไปใช้เวลาในเกม", exact: true }).click();
	await expect(stage).toHaveAttribute("data-lighting-preview", "auto");
});

test("southern garden becomes open water and old saves return safely to shore", async ({
	page
}) => {
	const state = newGame();
	state.x = 14.5;
	state.y = 25.5;
	state.coins = 432;
	state.gems = 3;
	state.objects.garden.push(
		{ id: "initial-legacy-tree", kind: "tree", x: 7, y: 26 },
		{ id: "placed-legacy-lantern", kind: "lantern", x: 14, y: 25 }
	);
	state.tiles["garden:14:25"] = "path";
	await page.clock.install();
	await openWorld(page, state);
	await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 500);
	await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
	const saved = await savedState(page);
	expect(saved.y).toBeLessThan(24);
	expect(saved.coins).toBe(432);
	expect(saved.gems).toBe(3);
	expect(saved.wood).toBe(state.wood + 4);
	expect(saved.objects.garden.every((o) => o.y < 24)).toBe(true);
	expect(saved.tiles["garden:14:25"]).toBeUndefined();
	const canvas = page.getByTestId("hearthwild-canvas");
	const water = await page.evaluate(async () => {
		const renderPath = "/src/features/hearthwild/render.ts",
			{ makeGround } = await import(renderPath);
		const s = JSON.parse(localStorage.getItem("wfchat.hearthwild.v1")!);
		s.tiles["garden:14:25"] = "path";
		const ground = makeGround("garden", s) as HTMLCanvasElement,
			ctx = ground.getContext("2d")!;
		const southern = Array.from({ length: 38 }, (_, x) =>
			Array.from(ctx.getImageData(x * 32 + 16, 26 * 32 + 16, 1, 1).data).slice(0, 3)
		);
		const stalePath = Array.from(ctx.getImageData(14 * 32 + 16, 25 * 32 + 16, 1, 1).data).slice(
			0,
			3
		);
		const landEdge = Array.from(ctx.getImageData(16, 20 * 32 + 16, 1, 1).data).slice(0, 3);
		const map = document.querySelector<HTMLCanvasElement>(".hw-minimap canvas")!,
			m = map.getContext("2d")!;
		const minimap = Array.from({ length: 38 }, (_, x) =>
			Array.from(m.getImageData(x * 3 + 1, 82, 1, 1).data).slice(0, 3)
		);
		const pixels = ctx.getImageData(0, 0, ground.width, ground.height).data;
		let shallowBrightness = 0,
			deepBrightness = 0;
		for (let x = 0; x < ground.width; x += 4) {
			const shallow = ((24 * 32 + 16) * ground.width + x) * 4,
				deep = ((27 * 32 + 16) * ground.width + x) * 4;
			shallowBrightness += pixels[shallow] + pixels[shallow + 1] + pixels[shallow + 2];
			deepBrightness += pixels[deep] + pixels[deep + 1] + pixels[deep + 2];
		}
		return {
			southern,
			stalePath,
			landEdge,
			minimap,
			shallowBrightness,
			deepBrightness
		};
	});
	for (const [r, g, b] of [...water.southern, ...water.minimap, water.stalePath]) {
		expect(b).toBeGreaterThan(g);
		expect(g).toBeGreaterThan(r);
	}
	expect(water.landEdge[1]).toBeGreaterThan(65);
	expect(water.landEdge[2]).toBeGreaterThan(65);
	expect(water.shallowBrightness).toBeGreaterThan(water.deepBrightness * 1.25);
	await page.getByTestId("hearthwild-stage").focus();
	await page.keyboard.down("s");
	await page.clock.runFor(800);
	await page.keyboard.up("s");
	await page.clock.runFor(100);
	await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
	expect((await savedState(page)).y).toBeLessThan(24);
	await page.getByRole("button", { name: "Place lantern", exact: true }).click();
	const s = await savedState(page),
		box = (await canvas.boundingBox())!,
		view = viewFor(s, box.width, box.height, 1.2);
	await canvas.click({
		position: { x: (14.5 * 32 - view.cameraX) * 1.2, y: (24.05 * 32 - view.cameraY) * 1.2 }
	});
	expect((await savedState(page)).wood).toBe(saved.wood);
	await page.getByRole("button", { name: "Explore", exact: true }).click();
	await page.screenshot({ path: "test-results/hearthwild-southern-water.png" });
});
