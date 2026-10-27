import { describe, expect, it } from "vitest";
import { keepLargestAlphaIsland } from "./art";
import { coverage, hash, visualCoverage } from "./landscape";
import { blocked, createWorld, index, serialize } from "./world";

describe("visual terrain independent of gameplay", () => {
	it("rounds corners without mutating collision cells or saved state", () => {
		const world = createWorld();
		world.terrain.fill("grass");
		world.objects = [];
		world.terrain[index(10, 10)] = "water";
		const before = serialize(world);
		expect(coverage(world, 168, 168, "water")).toBe(1);
		expect(coverage(world, 160, 160, "water")).toBeCloseTo(0.25);
		expect(blocked(world, 161, 161)).toBe(true);
		expect(blocked(world, 159, 159)).toBe(false);
		expect(serialize(world)).toBe(before);
	});
	it("keeps a single-cell water channel connected and handles map boundaries", () => {
		const world = createWorld();
		world.terrain.fill("grass");
		for (let y = 0; y < 36; y++) world.terrain[index(10, y)] = "water";
		for (let y = 0; y < 576; y++) expect(coverage(world, 168, y, "water")).toBeCloseTo(1);
		expect(coverage(world, 0, 0, "grass")).toBe(1);
		expect(hash(11, 17)).toBe(hash(11, 17));
		expect(hash(11, 17)).not.toBe(hash(17, 11));
	});
	it("keeps warped water channels and all terrain cell centers intact", () => {
		const world = createWorld(),
			before = serialize(world);
		for (let y = 0; y < 36; y++)
			for (let x = 0; x < 48; x++) {
				const kind = world.terrain[index(x, y)];
				expect(visualCoverage(world, x * 16 + 8, y * 16 + 8, kind)).toBe(1);
			}
		expect(serialize(world)).toBe(before);
		world.terrain.fill("grass");
		for (let y = 0; y < 36; y++) world.terrain[index(10, y)] = "water";
		for (let y = 0; y < 576; y++) expect(visualCoverage(world, 168, y, "water")).toBe(1);
		expect(visualCoverage(world, 160, 175, "water")).toBe(
			visualCoverage(world, 160, 175, "water")
		);
	});

	it("removes adjacent atlas fragments while preserving the main alpha island", () => {
		const data = new Uint8ClampedArray(6 * 4 * 4);
		for (const i of [0, 1, 6, 7, 12, 13]) {
			data[i * 4] = 128;
			data[i * 4 + 3] = 200;
		}
		for (const i of [4, 5]) data[i * 4 + 3] = 255;
		keepLargestAlphaIsland(data, 6, 4);
		for (const i of [0, 1, 6, 7, 12, 13]) {
			expect(data[i * 4]).toBe(128);
			expect(data[i * 4 + 3]).toBe(200);
		}
		expect(data[4 * 4 + 3]).toBe(0);
		expect(data[5 * 4 + 3]).toBe(0);
	});
});
