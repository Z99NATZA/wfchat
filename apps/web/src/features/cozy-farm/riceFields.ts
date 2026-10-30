import {
	cell,
	DEFINITIONS,
	index,
	objectsAt,
	TILE_SIZE,
	WIDTH,
	type World,
	type WorldObject
} from "./world";

// One continuous tilled field fills both former plots and their middle lane.
export const RICE_FIELD = { x: 31, y: 6, w: 10, h: 7 } as const;

export interface PaddyEdge {
	x: number;
	y: number;
	side: "north" | "south" | "east" | "west";
}

// Follow live terrain, including harvested plots and later player edits.
export function paddyEdges(world: World): PaddyEdge[] {
	const edges: PaddyEdge[] = [];
	for (let key = 0; key < world.terrain.length; key++) {
		if (world.terrain[key] !== "paddy") continue;
		const x = key % WIDTH,
			y = Math.floor(key / WIDTH);
		for (const [side, dx, dy] of [
			["north", 0, -1],
			["south", 0, 1],
			["west", -1, 0],
			["east", 1, 0]
		] as const)
			if (cell(world, x + dx, y + dy) !== "paddy") edges.push({ x, y, side });
	}
	return edges;
}

const inClearing = (x: number, y: number) => x >= 30 && x <= 41 && y >= 5 && y <= 13;
const touchesClearing = (object: WorldObject) => {
	const { w, h } = DEFINITIONS[object.kind];
	return object.x <= 41 && object.x + w > 30 && object.y <= 13 && object.y + h > 5;
};
const sameObject = (a: WorldObject, b: WorldObject) =>
	a.id === b.id && a.kind === b.kind && a.x === b.x && a.y === b.y;

const overlapsField = (o: WorldObject) => {
	const { w, h } = DEFINITIONS[o.kind];
	return (
		o.x < RICE_FIELD.x + RICE_FIELD.w &&
		o.x + w > RICE_FIELD.x &&
		o.y < RICE_FIELD.y + RICE_FIELD.h &&
		o.y + h > RICE_FIELD.y
	);
};

function moveRimObjects(world: World, seed: World) {
	const targets = [
		{ kind: "lamp", x: 39, y: 6, toX: 42, toY: 6 },
		...[31, 34, 37, 40].map((x) => ({ kind: "tree", x, y: 4, toX: x, toY: 3 }))
	] as const;
	for (const target of targets) {
		const original = seed.objects.find(
				(o) => o.kind === target.kind && o.x === target.x && o.y === target.y
			),
			object = world.objects.find(
				(o) =>
					o.id === original?.id &&
					o.kind === target.kind &&
					o.x === target.x &&
					o.y === target.y
			);
		if (!object) continue;
		const { w, h } = DEFINITIONS[object.kind];
		let clear = true;
		for (let y = target.toY; y < target.toY + h; y++)
			for (let x = target.toX; x < target.toX + w; x++)
				if (
					cell(world, x, y) !== "grass" ||
					world.crops[index(x, y)] ||
					objectsAt(world, x, y).some(
						(o) => o !== object && !(object.kind === "tree" && o.kind === "flowers")
					) ||
					(world.player.x + 3 >= x * TILE_SIZE &&
						world.player.x - 3 < (x + 1) * TILE_SIZE &&
						world.player.y + 2 >= y * TILE_SIZE &&
						world.player.y - 2 < (y + 1) * TILE_SIZE)
				)
					clear = false;
		if (clear) {
			object.x = target.toX;
			object.y = target.toY;
		}
	}
}

// Original forests require an untouched clearing. Earlier rice layouts expand
// into clear ground, retain played paddy cells and clear removable field obstacles.
export function applyRiceFields(world: World, seed: World) {
	if (world.riceComposition === 5) return;
	if (world.riceComposition === 4) {
		for (let y = RICE_FIELD.y; y < RICE_FIELD.y + RICE_FIELD.h; y++)
			for (let x = RICE_FIELD.x; x < RICE_FIELD.x + RICE_FIELD.w; x++)
				if (cell(world, x, y) === "paddy") world.terrain[index(x, y)] = "soil";
		world.objects = world.objects.filter((o) => !(o.kind === "fence" && overlapsField(o)));
		world.riceComposition = 5;
		return;
	}
	const composed =
		world.riceComposition === 1 || world.riceComposition === 2 || world.riceComposition === 3;
	world.riceComposition = 5;
	const original = seed.objects.filter(touchesClearing),
		current = world.objects.filter(touchesClearing);
	if (
		!composed &&
		(current.length !== original.length ||
			!current.every((object) => original.some((s) => sameObject(object, s))))
	)
		return;
	if (!composed)
		for (let y = 5; y <= 13; y++)
			for (let x = 30; x <= 41; x++)
				if (cell(world, x, y) !== cell(seed, x, y) || world.crops[index(x, y)]) return;
	moveRimObjects(world, seed);

	const paths = new Set<number>();
	for (let y = 6; y <= 12; y++) paths.add(index(30, y));
	for (let x = 28; x < 30; x++) paths.add(index(x, 12));
	const paddies = new Set<number>();
	for (let y: number = RICE_FIELD.y; y < RICE_FIELD.y + RICE_FIELD.h; y++)
		for (let x: number = RICE_FIELD.x; x < RICE_FIELD.x + RICE_FIELD.w; x++)
			paddies.add(index(x, y));
	const removed = new Set(
		original
			.filter(
				(o) =>
					(!composed && o.kind === "tree" && inClearing(o.x, o.y)) ||
					(o.kind === "flowers" &&
						(paths.has(index(o.x, o.y)) || paddies.has(index(o.x, o.y))))
			)
			.map((o) => o.id)
	);
	world.objects = world.objects.filter(
		(o) =>
			!(DEFINITIONS[o.kind].removable && overlapsField(o)) &&
			(!removed.has(o.id) || !original.some((s) => sameObject(o, s)))
	);
	for (const key of paths) {
		const x = key % WIDTH,
			y = Math.floor(key / WIDTH);
		// The western junction sits outside the clearing's edit guard.
		if (
			world.terrain[key] === seed.terrain[key] &&
			!world.crops[key] &&
			!objectsAt(world, x, y).length
		)
			world.terrain[key] = "path";
	}
	for (const key of paddies) {
		const x = key % WIDTH,
			y = Math.floor(key / WIDTH);
		// Existing paddy cells retain harvested holes and exact crop progress.
		if (world.terrain[key] === "paddy") {
			world.terrain[key] = "soil";
			continue;
		}
		if (world.terrain[key] === "soil") continue;
		if (
			world.crops[key] ||
			objectsAt(world, x, y).length ||
			!(world.terrain[key] === "grass" || (y === 9 && world.terrain[key] === "path"))
		)
			continue;
		world.terrain[key] = "soil";
		// Keep the player's immediate footing clear when upgrading an old save.
		if (
			Math.abs(world.player.x - (x + 0.5) * TILE_SIZE) < 12 &&
			Math.abs(world.player.y - (y + 0.5) * TILE_SIZE) < 10
		)
			continue;
		world.crops[key] = {
			kind: "rice",
			watered: true,
			growth: 1
		};
	}
}
