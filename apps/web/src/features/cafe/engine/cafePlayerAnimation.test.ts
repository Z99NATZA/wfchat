import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
	CAFE_PLAYER_SPRITES,
	cafePlayerFrame,
	cafePlayerFrameTransform,
	cafePlayerIdlePhase,
	normalizeCafeAvatarId
} from "./cafePlayerAnimation";

describe("cafePlayerFrame", () => {
	it.each([
		["up", 0],
		["left", 6],
		["right", 12],
		["down", 18]
	] as const)("uses the neutral idle frame for %s", (direction, frame) => {
		expect(cafePlayerFrame(direction, false, 0)).toBe(frame);
	});

	it("shows the blink frame briefly during each idle cycle", () => {
		expect(cafePlayerFrame("down", false, 3_199)).toBe(18);
		expect(cafePlayerFrame("down", false, 3_200)).toBe(19);
		expect(cafePlayerFrame("down", false, 3_359)).toBe(19);
		expect(cafePlayerFrame("down", false, 3_360)).toBe(18);
	});

	it("applies a stable per-player idle phase", () => {
		const phase = cafePlayerIdlePhase("player-a");
		expect(phase).toBe(cafePlayerIdlePhase("player-a"));
		expect(phase).toBeGreaterThanOrEqual(0);
		expect(phase).toBeLessThan(4_000);
	});

	it("cycles through the four walk frames without using idle frames", () => {
		expect([0, 125, 250, 375, 500].map((time) => cafePlayerFrame("right", true, time))).toEqual(
			[14, 15, 16, 17, 14]
		);
	});

	it("clamps negative animation time to the first walk frame", () => {
		expect(cafePlayerFrame("down", true, -1)).toBe(20);
	});
});

describe("cafePlayerFrameTransform", () => {
	it.each(["boy", "girl"] as const)("normalizes the generated %s frames", (avatarId) => {
		const frames = [0, 6, 12, 18];
		const transforms = frames.map((frame) => cafePlayerFrameTransform(avatarId, frame));
		expect(transforms.every(({ x, y, scale }) => [x, y, scale].every(Number.isFinite))).toBe(
			true
		);
		expect(transforms.every(({ scale }) => scale > 0.45 && scale < 0.56)).toBe(true);
		expect(Math.abs(transforms[0].y - transforms[3].y)).toBeLessThan(2);
	});

	it("falls back to the default transform for an unknown frame", () => {
		expect(cafePlayerFrameTransform("boy", 99)).toEqual({ x: 0, y: 0, scale: 0.5 });
	});
});

describe("CAFE_PLAYER_SPRITES", () => {
	it.each(["boy", "girl"] as const)(
		"uses the %s sheet content hash in both the browser URL and Phaser key",
		async (avatarId) => {
			const sprite = CAFE_PLAYER_SPRITES[avatarId];
			const requestUrl = new URL(sprite.url, "https://wfchat.local");
			const assetUrl = new URL(`../../../../public${requestUrl.pathname}`, import.meta.url);
			const contents = await readFile(assetUrl);
			const fingerprint = createHash("sha256").update(contents).digest("hex");

			expect(requestUrl.searchParams.get("v")).toBe(fingerprint);
			expect(sprite.key).toContain(fingerprint);
		}
	);
});

describe("normalizeCafeAvatarId", () => {
	it("accepts the girl avatar and defaults unknown values to boy", () => {
		expect(normalizeCafeAvatarId("girl")).toBe("girl");
		expect(normalizeCafeAvatarId("unknown")).toBe("boy");
	});
});
