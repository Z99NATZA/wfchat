import { describe, expect, it } from "vitest";
import { calculateCafeCameraFraming } from "@/features/cafe/engine/cafeCamera";

describe("calculateCafeCameraFraming", () => {
	it("covers a wide desktop game area without exposing the space outside the map", () => {
		const framing = calculateCafeCameraFraming(1872, 1216, 1280, 800);

		expect(framing.zoom).toBeCloseTo(1.52);
		expect(framing.deadZoneWidth).toBe(160);
		expect(framing.deadZoneHeight).toBe(100);
	});

	it("keeps the game readable on a narrow mobile viewport", () => {
		const framing = calculateCafeCameraFraming(390, 700, 1280, 800);

		expect(framing.zoom).toBe(0.9);
		expect(framing.deadZoneWidth).toBeCloseTo(60.67, 1);
		expect(framing.deadZoneHeight).toBe(100);
	});

	it("does not shrink a landscape viewport below the readable zoom", () => {
		const framing = calculateCafeCameraFraming(844, 390, 1280, 800);

		expect(framing.zoom).toBe(0.9);
	});
});
