import { describe, expect, it } from "vitest";
import { MistwaterWaterPhysics } from "@/features/mistwater/game/mistwaterWaterPhysics";

describe("Mistwater water physics", () => {
	it("propagates a local disturbance to neighboring cells", () => {
		const water = new MistwaterWaterPhysics(9, 9);
		water.disturb(0.5, 0.5, 1, 1);

		expect(water.getHeight(4, 4)).toBeCloseTo(1);
		water.step();

		expect(water.getHeight(4, 4)).toBeCloseTo(0);
		expect(water.getHeight(5, 4)).toBeGreaterThan(0.45);
	});

	it("damps wave energy over time", () => {
		const water = new MistwaterWaterPhysics(21, 11);
		water.disturb(0.5, 0.5, 1, 2);
		for (let step = 0; step < 600; step += 1) {
			water.step();
		}

		expect(water.getPeak()).toBeLessThan(0.01);
	});

	it("writes a neutral displacement map at rest", () => {
		const water = new MistwaterWaterPhysics(5, 3);
		const pixels = new Uint8ClampedArray(5 * 3 * 4);
		water.writeDisplacementMap(pixels);

		for (let index = 0; index < pixels.length; index += 4) {
			expect(pixels[index]).toBe(128);
			expect(pixels[index + 1]).toBe(128);
			expect(pixels[index + 2]).toBe(128);
			expect(pixels[index + 3]).toBe(255);
		}
	});

	it("encodes horizontal and vertical wave slopes independently", () => {
		const water = new MistwaterWaterPhysics(7, 7);
		const pixels = new Uint8ClampedArray(7 * 7 * 4);
		water.disturb(0.5, 0.5, 1, 1);
		water.writeDisplacementMap(pixels);

		const leftOfWave = (3 * 7 + 2) * 4;
		const aboveWave = (2 * 7 + 3) * 4;
		expect(pixels[leftOfWave]).toBeGreaterThan(128);
		expect(pixels[leftOfWave + 1]).toBe(128);
		expect(pixels[aboveWave]).toBe(128);
		expect(pixels[aboveWave + 1]).toBeGreaterThan(128);
	});

	it("keeps idle water moving with continuous directional waves", () => {
		const water = new MistwaterWaterPhysics(11, 7);
		const first = new Uint8ClampedArray(11 * 7 * 4);
		const later = new Uint8ClampedArray(11 * 7 * 4);
		water.writeDisplacementMap(first, 0);
		water.writeDisplacementMap(later, 2);

		expect(first).not.toEqual(later);
		expect(first.some((value, index) => index % 4 < 2 && value !== 128)).toBe(true);
		expect(water.getPeak()).toBe(0);
	});

	it("samples the height field smoothly in normalized coordinates", () => {
		const water = new MistwaterWaterPhysics(5, 5);
		water.disturb(0.5, 0.5, 1, 1);

		expect(water.sampleHeight(0.5, 0.5)).toBeCloseTo(1);
		expect(water.sampleHeight(0.625, 0.5)).toBeCloseTo(0.5);
		expect(water.sampleHeight(-1, -1)).toBe(0);
	});

	it("resets active waves", () => {
		const water = new MistwaterWaterPhysics(9, 9);
		water.disturb(0.5, 0.5, 1);
		water.reset();

		expect(water.getPeak()).toBe(0);
	});
});
