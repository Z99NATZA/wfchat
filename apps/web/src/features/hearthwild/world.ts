export const TILE = 32;
export const GARDEN_SOUTH_WATER_ROW = 23;
export type MapId = "garden" | "home" | "dungeon";
export type ObjectKind =
	| "tree"
	| "rock"
	| "chest"
	| "bed"
	| "lantern"
	| "fence"
	| "crop"
	| "crystal"
	| "mushroom"
	| "bush";
export type Tool = "hand" | "path" | "soil" | "crop" | "lantern" | "fence" | "tree" | "remove";
export type WorldObject = {
	id: string;
	kind: ObjectKind;
	x: number;
	y: number;
	planted?: number;
	opened?: boolean;
};
export type Portal = { x: number; y: number; to: MapId; spawn: [number, number] };
export const MAPS: Record<MapId, { width: number; height: number; portals: Portal[] }> = {
	garden: {
		width: 38,
		height: 28,
		portals: [
			{ x: 14, y: 9, to: "home", spawn: [10, 12] },
			{ x: 33, y: 5, to: "dungeon", spawn: [4, 17] }
		]
	},
	home: { width: 20, height: 16, portals: [{ x: 10, y: 14, to: "garden", spawn: [14, 10] }] },
	dungeon: { width: 32, height: 23, portals: [{ x: 3, y: 19, to: "garden", spawn: [32, 6] }] }
};
export function hash(x: number, y: number) {
	const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
	return n - Math.floor(n);
}
export function terrain(
	map: MapId,
	x: number,
	y: number
): "grass" | "path" | "water" | "floor" | "wall" | "stone" {
	const { width, height } = MAPS[map];
	if (x < 0 || y < 0 || x >= width || y >= height) return "wall";
	if (map === "garden" && y >= GARDEN_SOUTH_WATER_ROW) return "water";
	if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) return "wall";
	if (map === "home") return "floor";
	if (map === "dungeon") {
		if (
			(x === 10 && y < 15 && y !== 8 && y !== 9) ||
			(y === 11 && x > 16 && x !== 23 && x !== 24)
		)
			return "wall";
		return "stone";
	}
	if (((x - 27) / 5.5) ** 2 + ((y - 19) / 4) ** 2 < 1) return "water";
	if (
		(x >= 13 && x <= 15 && y >= 9) ||
		(y >= 10 && y <= 12 && x >= 9 && x <= 32) ||
		(x >= 31 && x <= 33 && y >= 5 && y <= 12)
	)
		return "path";
	return "grass";
}
export function initialObjects(): Record<MapId, WorldObject[]> {
	let id = 0;
	const obj = (kind: ObjectKind, x: number, y: number): WorldObject => ({
		id: `initial-${id++}`,
		kind,
		x,
		y
	});
	const garden: WorldObject[] = [];
	for (let y = 2; y < 27; y++)
		for (let x = 2; x < 37; x++) {
			if (
				(x < 6 || y < 4 || x > 35 || y > 25) &&
				hash(x, y) > 0.48 &&
				Math.hypot(x - 33, y - 5) > 3
			)
				garden.push(obj("tree", x, y));
		}
	for (const [x, y] of [
		[7, 7],
		[8, 20],
		[20, 5],
		[22, 7],
		[19, 22],
		[7, 23]
	])
		garden.push(obj("tree", x, y));
	for (const [x, y] of [
		[19, 15],
		[8, 15],
		[21, 23],
		[31, 24]
	])
		garden.push(obj("rock", x, y));
	for (const [x, y] of [
		[9, 9],
		[18, 9],
		[30, 7],
		[22, 16],
		[32, 20]
	])
		garden.push(obj("bush", x, y));
	for (const [x, y] of [
		[6, 17],
		[20, 22],
		[32, 22]
	])
		garden.push(obj("mushroom", x, y));
	for (let x = 8; x < 12; x++)
		for (let y = 16; y < 19; y++) garden.push({ ...obj("crop", x, y), planted: -120 });
	for (let x = 7; x < 13; x++) garden.push(obj("fence", x, 20));
	garden.push(obj("lantern", 12, 10), obj("lantern", 16, 10), obj("chest", 17, 8));
	const home = [
		obj("bed", 5, 5),
		obj("chest", 14, 5),
		obj("lantern", 3, 3),
		obj("lantern", 16, 3),
		obj("bush", 4, 10)
	];
	const dungeon = [obj("chest", 27, 5), obj("chest", 26, 17)];
	for (const [x, y] of [
		[6, 5],
		[15, 5],
		[22, 6],
		[27, 14],
		[15, 18],
		[7, 12]
	])
		dungeon.push(obj("crystal", x, y));
	for (const [x, y] of [
		[12, 14],
		[18, 7],
		[25, 19],
		[6, 8]
	])
		dungeon.push(obj("rock", x, y));
	return { garden: garden.filter((o) => o.y < GARDEN_SOUTH_WATER_ROW), home, dungeon };
}
export function isSolid(kind: ObjectKind) {
	return !["crop", "mushroom"].includes(kind);
}
export function isBuilding(x: number, y: number) {
	return x >= 11 && x <= 17 && y >= 5 && y <= 8;
}

export function isFixture(map: MapId, x: number, y: number) {
	return map === "garden"
		? isBuilding(x, y)
		: map === "home" &&
				((x >= 12 && x <= 14 && y >= 7 && y <= 8) || (x >= 9 && x <= 11 && y === 2));
}
