import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createWorld, SAVE_KEY } from "../src/features/cozy-farm/world";
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
		"/images/cozy-farm/crops-v1.png",
		"/images/cozy-farm/environment-v1.png",
		"/images/cozy-farm/farmer-v1.png"
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
	await page.getByRole("link", { name: "Hearthwild", exact: true }).click();
	await expect(canvas).toHaveCount(0);
	expect(errors).toEqual([]);
});

test("missing artwork shows an explicit error instead of a partial placeholder world", async ({
	page
}) => {
	await page.route("**/images/cozy-farm/environment-v1.png", (route) => route.abort());
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
