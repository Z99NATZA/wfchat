import { applyPathComposition } from "./composition";
export const TILE_SIZE = 16;
export const WIDTH = 48;
export const HEIGHT = 36;
export const SAVE_KEY = "wfchat.cozy-farm.v1";
export type Terrain = "grass" | "path" | "water" | "soil";
export type ObjectKind =
	| "cottage"
	| "shed"
	| "tree"
	| "rock"
	| "fence"
	| "lamp"
	| "dock"
	| "flowers"
	| "boat"
	| "sign"
	| "scarecrow";
export const DEFINITIONS: Record<
	ObjectKind,
	{ w: number; h: number; blocking: boolean; removable: boolean }
> = {
	cottage: { w: 7, h: 4, blocking: true, removable: false },
	shed: { w: 4, h: 3, blocking: true, removable: false },
	tree: { w: 2, h: 2, blocking: true, removable: true },
	rock: { w: 1, h: 1, blocking: true, removable: true },
	fence: { w: 1, h: 1, blocking: true, removable: true },
	lamp: { w: 1, h: 1, blocking: true, removable: true },
	dock: { w: 2, h: 1, blocking: false, removable: false },
	flowers: { w: 1, h: 1, blocking: false, removable: true },
	boat: { w: 2, h: 2, blocking: true, removable: false },
	sign: { w: 1, h: 1, blocking: true, removable: false },
	scarecrow: { w: 1, h: 1, blocking: true, removable: true }
};
export interface WorldObject {
	id: number;
	kind: ObjectKind;
	x: number;
	y: number;
}
export interface Crop {
	kind: "turnip" | "berry";
	watered: boolean;
	growth: number;
}
export interface World {
	version: 1;
	pathComposition?: 1;
	terrain: Terrain[];
	objects: WorldObject[];
	crops: Record<string, Crop>;
	player: { x: number; y: number; dx: number; dy: number };
	seeds: number;
	harvest: number;
	elapsed: number;
}
export const index = (x: number, y: number) => y * WIDTH + x;
export const inside = (x: number, y: number) =>
	Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT;
export const cell = (world: World, x: number, y: number) =>
	inside(x, y) ? world.terrain[index(x, y)] : undefined;
export const objectsAt = (world: World, x: number, y: number) =>
	world.objects.filter(
		(o) =>
			x >= o.x &&
			y >= o.y &&
			x < o.x + DEFINITIONS[o.kind].w &&
			y < o.y + DEFINITIONS[o.kind].h
	);
export function blocked(world: World, x: number, y: number) {
	const gx = Math.floor(x / TILE_SIZE),
		gy = Math.floor(y / TILE_SIZE);
	const terrain = cell(world, gx, gy),
		objects = objectsAt(world, gx, gy);
	return (
		!terrain ||
		objects.some((o) => DEFINITIONS[o.kind].blocking) ||
		(terrain === "water" && !objects.some((o) => o.kind === "dock"))
	);
}
export function canStand(world: World, x: number, y: number) {
	return [
		[-3, -2],
		[3, -2],
		[-3, 2],
		[3, 2]
	].every(([dx, dy]) => !blocked(world, x + dx, y + dy));
}
export function move(world: World, dx: number, dy: number, dt: number) {
	const length = Math.hypot(dx, dy);
	if (!length) return;
	world.player.dx = dx / length;
	world.player.dy = dy / length;
	// Substeps keep collision reliable even after a slow frame.
	const steps = Math.ceil((54 * dt) / 3);
	for (let i = 0; i < steps; i++) {
		const x = world.player.x + ((dx / length) * 54 * dt) / steps,
			y = world.player.y + ((dy / length) * 54 * dt) / steps;
		if (canStand(world, x, world.player.y)) world.player.x = x;
		if (canStand(world, world.player.x, y)) world.player.y = y;
	}
}
// Eight neighbors, with diagonals admitted only when both adjacent cardinal cells match.
export function waterMask(world: World, x: number, y: number) {
	const water = (dx: number, dy: number) => cell(world, x + dx, y + dy) === "water";
	const n = water(0, -1),
		e = water(1, 0),
		s = water(0, 1),
		w = water(-1, 0);
	return (
		+n |
		(+e << 1) |
		(+s << 2) |
		(+w << 3) |
		(+(n && e && water(1, -1)) << 4) |
		(+(e && s && water(1, 1)) << 5) |
		(+(s && w && water(-1, 1)) << 6) |
		(+(w && n && water(-1, -1)) << 7)
	);
}
export function createWorld(): World {
	const world: World = {
		version: 1,
		terrain: [],
		objects: [],
		crops: {},
		player: { x: 17 * TILE_SIZE, y: 15 * TILE_SIZE, dx: 0, dy: 1 },
		seeds: 24,
		harvest: 0,
		elapsed: 0
	};
	for (let y = 0; y < HEIGHT; y++)
		for (let x = 0; x < WIDTH; x++) {
			const lake =
				y > 31 ||
				x > 45 ||
				(x > 27 + Math.sin(y * 0.35) * 3 && y > 13) ||
				(x > 42 && y > 8);
			world.terrain.push(
				lake
					? "water"
					: y === 14 || y === 15 || x === 19 || x === 20 || (y === 29 && x < 25)
						? "path"
						: "grass"
			);
		}
	const add = (kind: ObjectKind, x: number, y: number) =>
		world.objects.push({ id: world.objects.length + 1, kind, x, y });
	add("cottage", 13, 7);
	add("shed", 21, 8);
	for (let y = 19; y < 28; y++)
		for (let x = 5; x < 17; x++)
			if (x !== 10 && x !== 11 && y !== 23) {
				world.terrain[index(x, y)] = "soil";
				world.crops[index(x, y)] = {
					kind: x < 11 ? "turnip" : "berry",
					watered: y % 2 === 0,
					growth: ((x + y) % 4) / 3
				};
			}
	for (let x = 4; x < 18; x++) {
		if (x !== 10 && x !== 11) {
			add("fence", x, 18);
			add("fence", x, 28);
		}
	}
	for (let y = 19; y < 28; y += 2) {
		add("fence", 4, y);
		add("fence", 17, y);
	}
	for (let x = 23; x < 27; x += 2) for (let y = 26; y < 33; y++) add("dock", x, y);
	add("boat", 27, 29);
	add("sign", 29, 13);
	add("scarecrow", 18, 26);
	for (const [x, y] of [
		[4, 16],
		[18, 18],
		[18, 28],
		[22, 25],
		[25, 30],
		[31, 17],
		[39, 6],
		[9, 10]
	])
		add("lamp", x, y);
	for (let y = 1; y < 33; y += 3)
		for (let x = 1; x < 46; x += 3) {
			if (
				cell(world, x, y) === "grass" &&
				(y < 5 || x < 3 || (x > 32 && y < 12) || (x === 22 && y > 19))
			)
				add("tree", x, y);
		}
	for (let y = 1; y < HEIGHT - 1; y++)
		for (let x = 1; x < WIDTH - 1; x++) {
			if (cell(world, x, y) === "grass" && !objectsAt(world, x, y).length) {
				if (cell(world, x + 1, y) === "water" || cell(world, x, y + 1) === "water")
					add("rock", x, y);
				else if ((x * 17 + y * 31) % 19 === 0) add("flowers", x, y);
			}
		}
	applyPathComposition(world, WIDTH, HEIGHT);
	return world;
}
export type Tool =
	| "hand"
	| "hoe"
	| "turnip"
	| "water"
	| "berry"
	| "lamp"
	| "fence"
	| "tree"
	| "remove"
	| "path"
	| "grass"
	| "flowers";
export const TOOLS: Tool[] = [
	"hand",
	"hoe",
	"turnip",
	"water",
	"berry",
	"lamp",
	"fence",
	"tree",
	"remove",
	"path",
	"grass",
	"flowers"
];
export function validTarget(world: World, tool: Tool, x: number, y: number): boolean {
	if (
		!inside(x, y) ||
		Math.hypot((x + 0.5) * TILE_SIZE - world.player.x, (y + 0.5) * TILE_SIZE - world.player.y) >
			4 * TILE_SIZE
	)
		return false;
	const terrain = cell(world, x, y),
		objects = objectsAt(world, x, y),
		crop = world.crops[index(x, y)];
	if (tool === "hand") return !!crop || objects.length > 0;
	if (tool === "remove") return objects.some((o) => DEFINITIONS[o.kind].removable);
	if (terrain === "water" || objects.length) return false;
	if (tool === "turnip" || tool === "berry")
		return terrain === "soil" && !crop && world.seeds > 0;
	if (tool === "water") return !!crop && !crop.watered;
	if (tool === "hoe" || tool === "path" || tool === "grass") return !crop;
	const def = DEFINITIONS[tool];
	for (let dy = 0; dy < def.h; dy++)
		for (let dx = 0; dx < def.w; dx++) {
			const cx = x + dx,
				cy = y + dy;
			if (
				!cell(world, cx, cy) ||
				cell(world, cx, cy) === "water" ||
				objectsAt(world, cx, cy).length ||
				world.crops[index(cx, cy)] ||
				(Math.floor(world.player.x / TILE_SIZE) === cx &&
					Math.floor(world.player.y / TILE_SIZE) === cy)
			)
				return false;
		}
	return true;
}
export function act(world: World, tool: Tool, x: number, y: number): string {
	if (!validTarget(world, tool, x, y)) return "invalid";
	const key = index(x, y),
		crop = world.crops[key];
	if (tool === "hand") {
		if (crop) {
			if (crop.growth < 1) return crop.watered ? "growing" : "thirsty";
			delete world.crops[key];
			world.harvest++;
			world.seeds += 2;
			return "harvested";
		}
		const object = objectsAt(world, x, y)[0];
		return object.kind === "cottage"
			? "home"
			: object.kind === "dock" || object.kind === "boat"
				? "lake"
				: "explore";
	}
	if (tool === "remove") {
		world.objects = world.objects.filter(
			(o) => !objectsAt(world, x, y).includes(o) || !DEFINITIONS[o.kind].removable
		);
		return "removed";
	}
	if (tool === "turnip" || tool === "berry") {
		world.crops[key] = { kind: tool, watered: false, growth: 0 };
		world.seeds--;
		return "planted";
	}
	if (tool === "water") {
		crop.watered = true;
		return "watered";
	}
	if (tool === "hoe" || tool === "path" || tool === "grass") {
		world.terrain[key] = tool === "hoe" ? "soil" : tool;
		return "changed";
	}
	world.objects.push({
		id: Math.max(0, ...world.objects.map((o) => o.id)) + 1,
		kind: tool,
		x,
		y
	});
	return "placed";
}
export function grow(world: World, dt: number) {
	world.elapsed += dt;
	for (const crop of Object.values(world.crops))
		if (crop.watered)
			crop.growth = Math.min(1, crop.growth + dt / (crop.kind === "turnip" ? 45 : 70));
}
export function serialize(world: World) {
	return JSON.stringify(world);
}
export function deserialize(raw: string): World | null {
	try {
		const w: World = JSON.parse(raw);
		if (
			!w ||
			w.version !== 1 ||
			(w.pathComposition !== undefined && w.pathComposition !== 1) ||
			!Array.isArray(w.terrain) ||
			w.terrain.length !== WIDTH * HEIGHT ||
			!w.terrain.every((t) => ["grass", "path", "water", "soil"].includes(t)) ||
			!Array.isArray(w.objects) ||
			w.objects.length > WIDTH * HEIGHT ||
			!w.crops ||
			typeof w.crops !== "object" ||
			Array.isArray(w.crops)
		)
			return null;
		if (
			!w.objects.every(
				(o) =>
					o &&
					Object.hasOwn(DEFINITIONS, o.kind) &&
					Number.isInteger(o.id) &&
					o.id > 0 &&
					inside(o.x, o.y) &&
					inside(o.x + DEFINITIONS[o.kind].w - 1, o.y + DEFINITIONS[o.kind].h - 1)
			) ||
			new Set(w.objects.map((o) => o.id)).size !== w.objects.length
		)
			return null;
		if (
			!Object.entries(w.crops).every(
				([key, c]) =>
					/^\d+$/.test(key) &&
					+key < WIDTH * HEIGHT &&
					w.terrain[+key] === "soil" &&
					c &&
					["turnip", "berry"].includes(c.kind) &&
					typeof c.watered === "boolean" &&
					Number.isFinite(c.growth) &&
					c.growth >= 0 &&
					c.growth <= 1
			)
		)
			return null;
		if (
			![w.seeds, w.harvest].every((v) => Number.isSafeInteger(v) && v >= 0) ||
			!Number.isFinite(w.elapsed) ||
			w.elapsed < 0 ||
			!w.player ||
			![w.player.x, w.player.y, w.player.dx, w.player.dy].every(Number.isFinite) ||
			!canStand(w, w.player.x, w.player.y)
		)
			return null;
		applyPathComposition(w, WIDTH, HEIGHT);
		return w;
	} catch {
		return null;
	}
}
