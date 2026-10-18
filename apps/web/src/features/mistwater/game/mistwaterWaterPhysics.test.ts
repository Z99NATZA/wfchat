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
			expect(pixels[index + 3]).toBe(255);
		}
	});

	it("resets active waves", () => {
		const water = new MistwaterWaterPhysics(9, 9);
		water.disturb(0.5, 0.5, 1);
		water.reset();

		expect(water.getPeak()).toBe(0);
	});
});
