import { expect, test, type Page } from "@playwright/test";
async function openWorld(page: Page) {
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
}
test("Aiko idle soles stay planted and walking poses keep one stable anatomical scale", async ({
	page
}) => {
	await openWorld(page);
	const stats = await page.evaluate(async () => {
		const modulePath = "/src/features/cozy-farm/playerSprites.ts";
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
			load("/images/cozy-farm/aiko-idle-v2.png"),
			load("/images/cozy-farm/aiko-walk-front-v2.png"),
			load("/images/cozy-farm/aiko-walk-back-v2.png"),
			load("/images/cozy-farm/aiko-walk-side-v2.png")
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
					height: b.height,
					legs: hash(
						ctx.getImageData(col * PLAYER_CELL, row * PLAYER_CELL + 65, PLAYER_CELL, 31)
							.data
					)
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
		expect(new Set(row.map((frame) => frame.legs)).size).toBeGreaterThanOrEqual(4);
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
	await page.screenshot({ path: "test-results/cozy-aiko-motion-contact.png" });
});

test("Aiko running keeps standing scale and a supporting sole in all directions", async ({
	page
}) => {
	await openWorld(page);
	const stats = await page.evaluate(async () => {
		const modulePath = "/src/features/cozy-farm/playerSprites.ts";
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
			load("/images/cozy-farm/aiko-idle-v2.png"),
			load("/images/cozy-farm/aiko-run-front-v2.png"),
			load("/images/cozy-farm/aiko-run-back-v2.png"),
			load("/images/cozy-farm/aiko-run-side-v2.png")
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
	await page.screenshot({ path: "test-results/cozy-aiko-run-contact.png" });
});
