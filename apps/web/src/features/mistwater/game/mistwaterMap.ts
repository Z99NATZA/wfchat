export const MISTWATER_TILE_SIZE = 32;
export const MISTWATER_MAP_COLUMNS = 56;
export const MISTWATER_MAP_ROWS = 28;
export const MISTWATER_WORLD_WIDTH = MISTWATER_MAP_COLUMNS * MISTWATER_TILE_SIZE;
export const MISTWATER_WORLD_HEIGHT = MISTWATER_MAP_ROWS * MISTWATER_TILE_SIZE;

export type MistwaterPoint = {
	x: number;
	y: number;
};

export const MISTWATER_WATER_BOUNDS = {
	x: 250,
	y: 150,
	width: 1_400,
	height: 650
} as const;

// Shared by pointer validation and the animated water mask.
export const MISTWATER_SHORELINE: ReadonlyArray<MistwaterPoint> = [
	{ x: 510, y: 190 },
	{ x: 760, y: 155 },
	{ x: 1_040, y: 155 },
	{ x: 1_280, y: 205 },
	{ x: 1_470, y: 300 },
	{ x: 1_605, y: 420 },
	{ x: 1_645, y: 520 },
	{ x: 1_550, y: 650 },
	{ x: 1_400, y: 725 },
	{ x: 1_190, y: 780 },
	{ x: 930, y: 795 },
	{ x: 690, y: 735 },
	{ x: 500, y: 655 },
	{ x: 340, y: 570 },
	{ x: 270, y: 460 },
	{ x: 300, y: 345 },
	{ x: 390, y: 250 }
];

export function isMistwaterWaterPoint(x: number, y: number): boolean {
	let inside = false;
	for (
		let current = 0, previous = MISTWATER_SHORELINE.length - 1;
		current < MISTWATER_SHORELINE.length;
		previous = current, current += 1
	) {
		const a = MISTWATER_SHORELINE[current];
		const b = MISTWATER_SHORELINE[previous];
		const crosses = a.y > y !== b.y > y;
		if (crosses && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
			inside = !inside;
		}
	}
	return inside;
}
