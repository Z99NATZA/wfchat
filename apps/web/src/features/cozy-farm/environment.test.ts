import { describe, expect, it } from "vitest";
import { GARDEN_ACCENTS, pierEdges, sceneryFits } from "./environment";
import { blocked, createWorld, index, serialize, TILE_SIZE, WIDTH, HEIGHT } from "./world";

describe("nonblocking environmental scenery", () => {
	it("joins pier modules without ropes across the deck or land-facing entrances", () => {
		const world = createWorld();
		world.terrain.fill("water");
		world.objects = [
			{ id: 1, kind: "dock", x: 10, y: 10 },
			{ id: 2, kind: "dock", x: 12, y: 10 },
			{ id: 3, kind: "dock", x: 10, y: 11 },
			{ id: 4, kind: "dock", x: 12, y: 11 }
		];
		const before = serialize(world);
		expect(pierEdges(world)).toEqual([
			{ x: 162, from: 163, to: 189 },
			{ x: 222, from: 163, to: 189 }
		]);
		expect(serialize(world)).toBe(before);
		world.terrain[index(9, 10)] = "grass";
		world.terrain[index(9, 11)] = "grass";
		expect(pierEdges(world)).toEqual([{ x: 222, from: 163, to: 189 }]);
	});
	it("opens mooring gaps and follows edited pier edges regardless of object order", () => {
		const world = createWorld();
		world.terrain.fill("water");
		world.objects = [0, 1, 2, 3, 4].map((i) => ({
			id: i + 1,
			kind: "dock",
			x: 10,
			y: 10 + i
		}));
		world.objects.push({ id: 6, kind: "boat", x: 12, y: 11 });
		const edges = pierEdges(world);
		expect(edges.filter((edge) => edge.x === 190)).toEqual([
			{ x: 190, from: 163, to: 173 },
			{ x: 190, from: 211, to: 237 }
		]);
		world.objects.reverse();
		expect(pierEdges(world).sort((a, b) => a.x - b.x || a.from - b.from)).toEqual(
			edges.sort((a, b) => a.x - b.x || a.from - b.from)
		);
		world.objects = [];
		expect(pierEdges(world)).toEqual([]);
	});
	it("keeps all authored accents off paths, planting soil and gameplay objects", () => {
		const world = createWorld(),
			before = serialize(world);
		for (const prop of GARDEN_ACCENTS)
			expect(
				sceneryFits(world, prop.x * TILE_SIZE, prop.y * TILE_SIZE, prop.width, prop.height),
				prop.name
			).toBe(true);
		expect(serialize(world)).toBe(before);
	});
	it("rejects the whole image when a player builds or plants beneath its edge", () => {
		const world = createWorld();
		world.terrain.fill("grass");
		world.objects = [];
		world.crops = {};
		const fits = () => sceneryFits(world, 168, 176, 28, 18);
		expect(fits()).toBe(true);
		world.terrain[index(9, 10)] = "path";
		expect(fits()).toBe(false);
		world.terrain[index(9, 10)] = "soil";
		world.crops[index(9, 10)] = { kind: "turnip", growth: 0, watered: false };
		expect(fits()).toBe(false);
		world.terrain[index(9, 10)] = "grass";
		delete world.crops[index(9, 10)];
		world.objects.push({ id: 1, kind: "fence", x: 11, y: 11 });
		expect(fits()).toBe(false);
		expect(sceneryFits(world, 0, 0, 28, 18)).toBe(false);
	});
	it("reserves the complete water animation envelope and allows reeds on mixed banks", () => {
		const world = createWorld();
		world.terrain.fill("water");
		world.objects = [];
		world.crops = {};
		expect(sceneryFits(world, 168, 176, 30, 16, "water", 0)).toBe(true);
		world.terrain[index(9, 10)] = "grass";
		expect(sceneryFits(world, 168, 176, 30, 16, "water", 0)).toBe(false);
		expect(sceneryFits(world, 168, 176, 30, 16, ["grass", "water"], 0)).toBe(true);
	});
	it("keeps every planting square and important destination reachable", () => {
		const world = createWorld(),
			start = index(
				Math.floor(world.player.x / TILE_SIZE),
				Math.floor(world.player.y / TILE_SIZE)
			),
			seen = new Set([start]),
			queue = [start];
		for (let head = 0; head < queue.length; head++) {
			const key = queue[head],
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
					blocked(world, (nx + 0.5) * TILE_SIZE, (ny + 0.5) * TILE_SIZE)
				)
					continue;
				seen.add(next);
				queue.push(next);
			}
		}
		for (let i = 0; i < world.terrain.length; i++)
			if (world.terrain[i] === "soil") expect(seen.has(i)).toBe(true);
		for (const [x, y] of [
			[16, 11],
			[23, 11],
			[24, 30],
			[11, 6],
			[3, 15]
		])
			expect(seen.has(index(x, y))).toBe(true);
	});
});
