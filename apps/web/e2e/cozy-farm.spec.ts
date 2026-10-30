import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createWorld, DEFINITIONS, SAVE_KEY, TILE_SIZE } from "../src/features/cozy-farm/world";
test("independent Pixi world supports farming, placement, movement, pause and saved reload", async ({
	page
}, testInfo) => {
	if (testInfo.project.name === "chromium-csp") {
		const nginx = readFileSync(new URL("../nginx.conf", import.meta.url), "utf8");
		const csp = nginx.match(/add_header Content-Security-Policy "([^"]+)" always;/)?.[1];
		expect(csp).toBeTruthy();
		await page.route("**/*", async (route) => {
			if (route.request().resourceType() !== "document") return route.fallback();
			const response = await route.fetch();
			await route.fulfill({
				response,
				headers: { ...response.headers(), "content-security-policy": csp! }
			});
		});
	}
	const assets = new Set<string>();
	page.on("response", (response) => {
		if (response.ok() && /\/images\/cozy-farm\/.*\.png$/.test(response.url()))
			assets.add(new URL(response.url()).pathname);
	});
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	await page.route("**/api/**", (route) =>
		route.fulfill({
			status: route.request().url().endsWith("/api/auth/me") ? 200 : 503,
			contentType: "application/json",
			body: route.request().url().endsWith("/api/auth/me")
				? JSON.stringify({ user_id: "guest", session_id: "guest", kind: "guest" })
				: "{}"
		})
	);
	await page.addInitScript(() => localStorage.setItem("wfchat.locale", "en"));
	await page.goto("/cozy-farm");
	await expect(page.locator(".cozy-canvas canvas")).toBeVisible();
	await expect(page.getByText("Opening your garden…")).toBeHidden();
	expect([...assets].sort()).toEqual([
		"/images/cozy-farm/aiko-idle-v2.png",
		"/images/cozy-farm/aiko-run-back-v2.png",
		"/images/cozy-farm/aiko-run-front-v2.png",
		"/images/cozy-farm/aiko-run-side-v2.png",
		"/images/cozy-farm/aiko-walk-back-v2.png",
		"/images/cozy-farm/aiko-walk-front-v2.png",
		"/images/cozy-farm/aiko-walk-side-v2.png",
		"/images/cozy-farm/buildings-front-v2.png",
		"/images/cozy-farm/crops-v1.png",
		"/images/cozy-farm/environment-v1.png",
		"/images/cozy-farm/garden-props-v1.png",
		"/images/cozy-farm/rice-growth-v3.png"
	]);
	const canvas = page.locator(".cozy-canvas canvas"),
		host = page.locator(".cozy-canvas");
	const box = (await canvas.boundingBox())!;
	const scale = Math.min(box.width / (48 * 16), box.height / (36 * 16));
	const position = {
		x: (box.width - 48 * 16 * scale) / 2 + 18.5 * 16 * scale,
		y: (box.height - 36 * 16 * scale) / 2 + 16.5 * 16 * scale
	};
	await page.getByRole("button", { name: "Till soil", exact: true }).click();
	await canvas.click({ position });
	await expect(page.getByRole("status")).toContainText("A little more like home");
	await page.getByRole("button", { name: "Plant turnip", exact: true }).click();
	await canvas.click({ position });
	await expect(page.getByRole("status")).toContainText("A new beginning");
	await page.getByRole("button", { name: "Water crops", exact: true }).click();
	await canvas.click({ position });
	await expect(page.getByRole("status")).toContainText("A cool drink");
	const saved = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
	expect((await saved()).seeds).toBe(23);
	expect((await saved()).crops[16 * 48 + 18].watered).toBe(true);
	await host.focus();
	await page.keyboard.press("g");
	await expect(page.getByRole("button", { name: "Grid (G)", exact: true })).toHaveAttribute(
		"aria-pressed",
		"true"
	);
	const before = (await saved()).player.x;
	await page.keyboard.down("d");
	await page.waitForTimeout(350);
	await page.keyboard.up("d");
	await page.getByRole("button", { name: "Pause", exact: true }).click();
	expect((await saved()).player.x).toBeGreaterThan(before);
	const elapsed = (await saved()).elapsed;
	await page.waitForTimeout(300);
	await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
	expect((await saved()).elapsed).toBe(elapsed);
	await page.screenshot({ path: "test-results/cozy-farm-desktop.png" });
	await page.reload();
	await expect(page.locator(".cozy-canvas canvas")).toBeVisible();
	await expect(page.getByText("Opening your garden…")).toBeHidden();
	expect((await saved()).seeds).toBe(23);
	await page.getByRole("button", { name: "Place lantern", exact: true }).click();
	await canvas.click({ position: { ...position, x: position.x + 16 * scale } });
	await expect(page.getByRole("status")).toContainText("Just the right spot");
	expect((await saved()).objects.length).toBe(createWorld().objects.length + 1);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.screenshot({ path: "test-results/cozy-farm-mobile.png" });
	const toolbar = (await page.locator(".cozy-toolbar").boundingBox())!;
	expect(toolbar.x).toBeGreaterThanOrEqual(48);
	expect(toolbar.x + toolbar.width).toBeLessThanOrEqual(390);
	await expect(page.locator('a[href="/hearthwild"]')).toHaveCount(0);
	await page.getByRole("link", { name: "Mistwater", exact: true }).click();
	await expect(canvas).toHaveCount(0);
	expect(errors).toEqual([]);
});

for (const kind of ["cottage", "shed"] as const) {
	test(`${kind} has a solid level front and a walkable side approach`, async ({ page }) => {
		const world = createWorld(),
			building = world.objects.find((object) => object.kind === kind)!,
			{ w, h } = DEFINITIONS[kind],
			front = (building.y + h) * TILE_SIZE,
			right = (building.x + w) * TILE_SIZE;
		world.terrain.fill("grass");
		world.crops = {};
		world.objects = [building];
		world.player = {
			x: (building.x + w / 2) * TILE_SIZE,
			y: front + 12,
			dx: 0,
			dy: -1
		};
		await page.addInitScript(
			({ key, world }) => {
				localStorage.setItem("wfchat.locale", "en");
				localStorage.setItem(key, JSON.stringify(world));
			},
			{ key: SAVE_KEY, world }
		);
		await page.route("**/api/**", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ user_id: "guest", session_id: "guest", kind: "guest" })
			})
		);
		await page.goto("/cozy-farm");
		await expect(page.locator(".cozy-canvas canvas")).toBeVisible();
		await expect(page.getByText("Opening your garden…")).toBeHidden();
		const host = page.locator(".cozy-canvas"),
			player = () =>
				page.evaluate((key) => {
					window.dispatchEvent(new Event("pagehide"));
					return JSON.parse(localStorage.getItem(key)!).player as {
						x: number;
						y: number;
					};
				}, SAVE_KEY),
			walk = async (key: string, duration: number) => {
				await host.focus();
				await page.keyboard.down(key);
				await page.waitForTimeout(duration);
				await page.keyboard.up(key);
				await page.waitForTimeout(250);
			};
		await walk("w", 600);
		const stopped = await player();
		expect(stopped.y).toBeGreaterThanOrEqual(front + 2);
		expect(stopped.y).toBeLessThan(front + 5);
		await page.getByRole("button", { name: "Zoom in", exact: true }).click();
		await page.getByRole("button", { name: "Zoom in", exact: true }).click();
		await host.focus();
		await page.keyboard.press("g");
		await page.waitForTimeout(300);
		await page.screenshot({ path: `test-results/cozy-farm-${kind}-footprint.png` });
		await walk("d", 1800);
		const beside = await player();
		expect(beside.x).toBeGreaterThan(right + 3);
		expect(beside.y).toBeCloseTo(stopped.y, 1);
		await walk("w", 650);
		expect((await player()).y).toBeLessThan(front - 20);
	});
}

for (const asset of [
	"environment-v1.png",
	"garden-props-v1.png",
	"buildings-front-v2.png",
	"rice-growth-v3.png"
]) {
	test(`missing ${asset} shows an explicit artwork error`, async ({ page }) => {
		await page.route(`**/images/cozy-farm/${asset}`, (route) => route.abort());
		await page.route("**/api/**", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ user_id: "guest", session_id: "guest", kind: "guest" })
			})
		);
		await page.addInitScript(() => localStorage.setItem("wfchat.locale", "en"));
		await page.goto("/cozy-farm");
		await expect(page.locator('.cozy-loading[role="alert"]')).toContainText(
			"The game could not start"
		);
		await expect(page.locator(".cozy-canvas canvas")).toHaveCount(0);
	});
}

test("the large continuous rice field supports harvest, replanting and saved reload", async ({
	page
}) => {
	const world = createWorld();
	world.player = { x: 32.5 * TILE_SIZE, y: 9.5 * TILE_SIZE, dx: 0, dy: -1 };
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.route("**/api/**", (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ user_id: "guest", session_id: "guest", kind: "guest" })
		})
	);
	await page.addInitScript(
		({ key, world }) => {
			localStorage.setItem("wfchat.locale", "en");
			if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(world));
		},
		{ key: SAVE_KEY, world }
	);
	await page.goto("/cozy-farm");
	const canvas = page.locator(".cozy-canvas canvas");
	await expect(canvas).toBeVisible();
	await expect(page.getByText("Opening your garden…")).toBeHidden();
	await page.screenshot({ path: "test-results/cozy-farm-rice-fields.png" });
	const box = (await canvas.boundingBox())!,
		scale = Math.min(box.width / (48 * 16), box.height / (36 * 16)),
		position = {
			x: (box.width - 48 * 16 * scale) / 2 + 33.5 * 16 * scale,
			y: (box.height - 36 * 16 * scale) / 2 + 11.5 * 16 * scale
		};
	await canvas.click({ position });
	await expect(page.getByRole("status")).toContainText("Fresh harvest!");
	await page.getByRole("button", { name: "Garden tools", exact: true }).click();
	await page.getByRole("button", { name: "Plant rice", exact: true }).click();
	await canvas.click({ position });
	await expect(page.getByRole("status")).toContainText("A new beginning");
	const saved = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
	expect((await saved()).seeds).toBe(25);
	expect((await saved()).harvest).toBe(1);
	expect((await saved()).riceComposition).toBe(5);
	for (let y = 6; y <= 12; y++)
		for (let x = 31; x <= 40; x++) expect((await saved()).terrain[y * 48 + x]).toBe("soil");
	expect((await saved()).crops[11 * 48 + 33]).toMatchObject({ kind: "rice", watered: false });
	await page.getByRole("button", { name: "Water crops", exact: true }).click();
	await canvas.click({ position });
	await expect(page.getByRole("status")).toContainText("A cool drink");
	expect((await saved()).crops[11 * 48 + 33]).toMatchObject({ kind: "rice", watered: true });
	await page.reload();
	await expect(canvas).toBeVisible();
	await expect(page.getByText("Opening your garden…")).toBeHidden();
	expect((await saved()).seeds).toBe(25);
	expect((await saved()).crops[11 * 48 + 33]).toMatchObject({ kind: "rice", watered: true });
	await page.setViewportSize({ width: 390, height: 844 });
	await page.getByRole("button", { name: "Garden tools", exact: true }).click();
	const tools = (await page.locator(".cozy-build").boundingBox())!;
	expect(tools.x).toBeGreaterThanOrEqual(48);
	expect(tools.x + tools.width).toBeLessThanOrEqual(390);
	await expect(page.getByRole("button", { name: "Plant rice", exact: true })).toBeVisible();
	await page.screenshot({ path: "test-results/cozy-farm-rice-mobile.png" });
	expect(errors).toEqual([]);
});

test("Shift runs faster and releasing movement settles before saving", async ({ page }) => {
	const world = createWorld();
	world.terrain.fill("grass");
	world.objects = [];
	world.player = { x: 250, y: 250, dx: 0, dy: 1 };
	await page.addInitScript(
		({ key, world }) => {
			localStorage.setItem("wfchat.locale", "en");
			localStorage.setItem(key, JSON.stringify(world));
		},
		{ key: SAVE_KEY, world }
	);
	await page.route("**/api/**", (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ user_id: "guest", session_id: "guest", kind: "guest" })
		})
	);
	await page.goto("/cozy-farm");
	await expect(page.locator(".cozy-canvas canvas")).toBeVisible();
	await page.locator(".cozy-canvas").focus();
	const saved = () =>
		page.evaluate((key) => {
			window.dispatchEvent(new Event("pagehide"));
			return JSON.parse(localStorage.getItem(key)!);
		}, SAVE_KEY);
	const travel = async (run: boolean) => {
		const before = await saved();
		if (run) await page.keyboard.down("Shift");
		await page.keyboard.down("d");
		await page.waitForTimeout(500);
		const after = await saved();
		await page.keyboard.up("d");
		await page.keyboard.up("Shift");
		await page.waitForTimeout(300);
		return (after.player.x - before.player.x) / (after.elapsed - before.elapsed);
	};
	const walkSpeed = await travel(false),
		runSpeed = await travel(true);
	expect(runSpeed).toBeGreaterThan(walkSpeed * 1.45);
	const stopped = await saved();
	await page.waitForTimeout(250);
	const resting = await saved();
	expect(resting.player.x).toBeCloseTo(stopped.player.x, 1);
	expect(resting.player.dx).toBe(1);
	expect(resting.player.dy).toBe(0);
});

test("removed adventure route uses the app's unknown-route fallback", async ({ page }) => {
	await page.route("**/api/**", (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ user_id: "guest", session_id: "guest", kind: "guest" })
		})
	);
	await page.goto("/hearthwild");
	await expect(page).toHaveURL(/\/chat$/);
	await expect(page.locator('a[href="/hearthwild"]')).toHaveCount(0);
});
