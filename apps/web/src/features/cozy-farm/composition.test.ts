import { describe, expect, it } from "vitest";
import {
	applyPathComposition,
	composedPathCells,
	forestStyle,
	legacyPathCell
} from "./composition";
import { blocked, createWorld, deserialize, HEIGHT, index, serialize, WIDTH } from "./world";
function legacyWorld() {
	const w = createWorld();
	delete w.pathComposition;
	for (let y = 0; y < HEIGHT; y++)
		for (let x = 0; x < WIDTH; x++)
			if (["grass", "path"].includes(w.terrain[index(x, y)]))
				w.terrain[index(x, y)] = legacyPathCell(x, y) ? "path" : "grass";
	return w;
}
describe("path and forest composition", () => {
	it("changes only walkable grass/path cells and keeps every collision footprint", () => {
		const w = legacyWorld(),
			before = structuredClone(w);
		const mask = Array.from({ length: WIDTH * HEIGHT }, (_, i) =>
			blocked(w, ((i % WIDTH) + 0.5) * 16, (Math.floor(i / WIDTH) + 0.5) * 16)
		);
		applyPathComposition(w, WIDTH, HEIGHT);
		expect(w.terrain).not.toEqual(before.terrain);
		for (let i = 0; i < w.terrain.length; i++) {
			expect(blocked(w, ((i % WIDTH) + 0.5) * 16, (Math.floor(i / WIDTH) + 0.5) * 16)).toBe(
				mask[i]
			);
			if (!["path", "grass"].includes(before.terrain[i]))
				expect(w.terrain[i]).toBe(before.terrain[i]);
		}
		expect(w.objects).toEqual(before.objects);
		expect(w.crops).toEqual(before.crops);
		expect(w.player).toEqual(before.player);
	});
	it("loads older saves once, preserves visible terrain edits, and respects subsequent edits", () => {
		const w = legacyWorld();
		w.terrain[index(6, 12)] = "path";
		w.terrain[index(19, 12)] = "grass";
		const loaded = deserialize(serialize(w))!;
		expect(loaded.pathComposition).toBe(1);
		expect(loaded.terrain[index(6, 12)]).toBe("path");
		expect(loaded.terrain[index(19, 12)]).toBe("grass");
		loaded.terrain[index(20, 20)] = "grass";
		expect(deserialize(serialize(loaded))).toEqual(loaded);
	});
	it("replaces the north-south cross with staggered routes and an open north clearing", () => {
		const cells = composedPathCells(WIDTH, HEIGHT);
		expect(cells.has(index(19, 4))).toBe(false);
		expect(cells.has(index(20, 8))).toBe(false);
		for (const [x, y] of [
			[16, 11],
			[11, 18],
			[11, 23],
			[11, 28],
			[20, 22],
			[24, 30]
		])
			expect(cells.has(index(x, y))).toBe(true);
		const w = createWorld(),
			start = index(11, 18),
			seen = new Set([start]),
			queue = [start];
		// The farm gate, cottage approach and dock approach share one walking route.
		while (queue.length) {
			const key = queue.shift()!,
				x = key % WIDTH,
				y = Math.floor(key / WIDTH);
			for (const [nx, ny] of [
				[x - 1, y],
				[x + 1, y],
				[x, y - 1],
				[x, y + 1]
			]) {
				const next = index(nx, ny);
				if (
					nx < 0 ||
					ny < 0 ||
					nx >= WIDTH ||
					ny >= HEIGHT ||
					seen.has(next) ||
					w.terrain[next] !== "path" ||
					blocked(w, (nx + 0.5) * 16, (ny + 0.5) * 16)
				)
					continue;
				seen.add(next);
				queue.push(next);
			}
		}
		expect(seen.has(index(16, 11))).toBe(true);
		expect(seen.has(index(24, 30))).toBe(true);
	});
	it("uses smaller foreground trees and varied clusters without moving trunk footprints", () => {
		expect(forestStyle(4, 4).scale).toBeLessThan(forestStyle(4, 1).scale);
		const trees = createWorld().objects.filter((o) => o.kind === "tree"),
			styles = trees.map((o) => forestStyle(o.x, o.y));
		expect(new Set(styles.map((s) => s.scale)).size).toBeGreaterThan(2);
		expect(new Set(styles.map((s) => s.variant)).size).toBe(2);
		for (const s of styles) {
			expect(Math.abs(s.offsetX)).toBeLessThanOrEqual(6);
			expect(Math.abs(s.offsetY)).toBeLessThanOrEqual(6);
			expect(s.scale).toBeGreaterThanOrEqual(0.6);
		}
	});
});
