import { describe, expect, it } from "vitest";
import { MistwaterCaustics } from "@/features/mistwater/game/mistwaterCaustics";

describe("Mistwater caustics", () => {
	it("requires enough samples to estimate an optical field", () => {
		expect(() => new MistwaterCaustics(2, 8, 2)).toThrow(/at least a 3x3 field/);
	});

	it("produces an uneven focused-light field from surface curvature", () => {
		const caustics = new MistwaterCaustics(48, 24, 2);
		const pixels = new Uint8ClampedArray(48 * 24 * 4);
		caustics.writeLightMap(pixels, 0);

		const alpha = Array.from(pixels.filter((_, index) => index % 4 === 3));
		expect(new Set(alpha).size).toBeGreaterThan(20);
		expect(Math.max(...alpha)).toBeGreaterThan(80);
		expect(alpha.filter((value) => value === 0).length).toBeGreaterThan(alpha.length * 0.25);
	});

	it("moves the focused light as the wave phases advance", () => {
		const caustics = new MistwaterCaustics(32, 16, 2);
		const first = new Uint8ClampedArray(32 * 16 * 4);
		const later = new Uint8ClampedArray(32 * 16 * 4);
		caustics.writeLightMap(first, 0);
		caustics.writeLightMap(later, 0.5);

		expect(later).not.toEqual(first);
	});

	it("focuses interactive ripple curvature into the light map", () => {
		const caustics = new MistwaterCaustics(32, 16, 2, []);
		const flat = new Uint8ClampedArray(32 * 16 * 4);
		const rippled = new Uint8ClampedArray(32 * 16 * 4);
		caustics.writeLightMap(flat, 0);
		caustics.writeLightMap(
			rippled,
			0,
			(x, y) => Math.exp(-((x - 0.5) ** 2 + (y - 0.5) ** 2) * 220) * 4
		);

		expect(rippled).not.toEqual(flat);
		expect(Math.max(...rippled)).toBeGreaterThan(0);
	});

	it("rejects a pixel buffer with the wrong dimensions", () => {
		const caustics = new MistwaterCaustics(8, 4, 2);
		expect(() => caustics.writeLightMap(new Uint8ClampedArray(8), 0)).toThrow(
			/buffer does not match/
		);
	});
});
