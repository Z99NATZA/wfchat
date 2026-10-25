import { describe, expect, it } from "vitest";
import { GARDEN_SOUTH_WATER_ROW } from "./world";
import {
	gardenPondShoreline,
	gardenShoreOutline,
	gardenSouthShoreY,
	gardenWaterDepth
} from "./water";

describe("garden water presentation", () => {
	it("keeps land dry and increases depth away from the southern shoreline", () => {
		expect(gardenWaterDepth(14, 23)).toBe(0);
		expect(gardenWaterDepth(14, 24)).toBe(1);
		expect(gardenWaterDepth(14, 25)).toBeGreaterThan(gardenWaterDepth(14, 24));
		expect(gardenWaterDepth(14, 27)).toBeGreaterThan(gardenWaterDepth(14, 25));
	});

	it("treats the joined pond as shallow at land and deeper toward its middle", () => {
		expect(gardenWaterDepth(27, 16)).toBe(1);
		expect(gardenWaterDepth(27, 19)).toBeGreaterThan(gardenWaterDepth(27, 16));
	});

	it("breaks straight banks and the pond into stable sub-tile contours", () => {
		const southBank = Array.from({ length: 30 }, (_, index) => gardenSouthShoreY(index * 8)),
			pond = gardenPondShoreline();
		expect(southBank).toEqual(
			Array.from({ length: 30 }, (_, index) => gardenSouthShoreY(index * 8))
		);
		expect(new Set(southBank).size).toBeGreaterThan(3);
		expect(Math.min(...southBank)).toBeGreaterThan(GARDEN_SOUTH_WATER_ROW * 32);
		expect(pond).toHaveLength(64);
		expect(pond).toEqual(gardenPondShoreline());
		expect(pond.some(([x, y]) => x % 32 !== 0 && y % 32 !== 0)).toBe(true);
	});

	it("draws one outer shoreline and leaves the pond-to-south-water connection open", () => {
		const outline = gardenShoreOutline(),
			pondOpening = outline.filter(([x]) => x > 27 * 32 && x < 28 * 32);
		expect(outline[0][0]).toBe(0);
		expect(outline.at(-1)![0]).toBe(38 * 32);
		expect(Math.min(...pondOpening.map(([, y]) => y))).toBeLessThan(17 * 32);
		expect(pondOpening.filter(([x, y]) => Math.abs(y - gardenSouthShoreY(x)) < 3)).toHaveLength(
			0
		);
		expect(outline).toContainEqual([25 * 32, gardenSouthShoreY(25 * 32)]);
		expect(outline).toContainEqual([30 * 32, gardenSouthShoreY(30 * 32)]);
		expect(
			outline.some(([x, y]) => x > 25 * 32 && x < 27 * 32 && y < gardenSouthShoreY(x) - 4)
		).toBe(true);
	});
});
