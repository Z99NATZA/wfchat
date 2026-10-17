export const MISTWATER_TILE_SIZE = 32;
export const MISTWATER_MAP_COLUMNS = 56;
export const MISTWATER_MAP_ROWS = 28;
export const MISTWATER_WORLD_WIDTH = MISTWATER_MAP_COLUMNS * MISTWATER_TILE_SIZE;
export const MISTWATER_WORLD_HEIGHT = MISTWATER_MAP_ROWS * MISTWATER_TILE_SIZE;

export type MistwaterPoint = {
	x: number;
	y: number;
};

type EllipseArea = MistwaterPoint & {
	rx: number;
	ry: number;
};

type MapPath = {
	id: string;
	from: MistwaterPoint;
	to: MistwaterPoint;
	width: number;
};

export type MistwaterFlowCurrent = MapPath & {
	speed: number;
	motes: number;
	curve?: number;
};

export type MistwaterSurfaceGlint = MistwaterPoint & {
	id: string;
	width: number;
	drift: number;
	duration: number;
};

export type MistwaterEddy = MistwaterPoint & {
	id: string;
	radius: number;
	duration: number;
	direction: 1 | -1;
};

// Overlapping editable zones approximate the irregular pond shoreline without
// baking collision or effect placement into the generated background image.
const WATER_BASINS: ReadonlyArray<EllipseArea> = [
	{ x: 900, y: 455, rx: 690, ry: 300 },
	{ x: 480, y: 455, rx: 265, ry: 225 },
	{ x: 1_365, y: 480, rx: 260, ry: 220 },
	{ x: 975, y: 650, rx: 450, ry: 150 }
];

export const MISTWATER_FLOW_CURRENTS: ReadonlyArray<MistwaterFlowCurrent> = [
	{
		id: "upper-current",
		from: { x: 480, y: 300 },
		to: { x: 1_320, y: 350 },
		width: 76,
		speed: 0.035,
		motes: 14,
		curve: -34
	},
	{
		id: "center-current",
		from: { x: 390, y: 465 },
		to: { x: 1_430, y: 520 },
		width: 92,
		speed: 0.042,
		motes: 17,
		curve: 44
	},
	{
		id: "lower-current",
		from: { x: 1_360, y: 620 },
		to: { x: 640, y: 680 },
		width: 76,
		speed: 0.032,
		motes: 13,
		curve: 28
	}
];

export const MISTWATER_BLOOM_POINTS: ReadonlyArray<MistwaterPoint> = [
	{ x: 470, y: 335 },
	{ x: 680, y: 245 },
	{ x: 930, y: 250 },
	{ x: 1_175, y: 285 },
	{ x: 1_405, y: 385 },
	{ x: 1_430, y: 550 },
	{ x: 1_230, y: 690 },
	{ x: 965, y: 715 },
	{ x: 700, y: 655 },
	{ x: 470, y: 555 }
];

export const MISTWATER_SURFACE_GLINTS: ReadonlyArray<MistwaterSurfaceGlint> = [
	{ id: "glint-northwest", x: 520, y: 350, width: 90, drift: 20, duration: 3_100 },
	{ id: "glint-north", x: 850, y: 285, width: 116, drift: -24, duration: 3_700 },
	{ id: "glint-northeast", x: 1_210, y: 345, width: 98, drift: 20, duration: 3_300 },
	{ id: "glint-west", x: 420, y: 505, width: 104, drift: -18, duration: 3_900 },
	{ id: "glint-center", x: 920, y: 500, width: 136, drift: 26, duration: 3_450 },
	{ id: "glint-east", x: 1_400, y: 510, width: 96, drift: -20, duration: 3_800 },
	{ id: "glint-southwest", x: 690, y: 640, width: 94, drift: 18, duration: 3_500 },
	{ id: "glint-southeast", x: 1_180, y: 650, width: 104, drift: -20, duration: 4_000 }
];

export const MISTWATER_EDDIES: ReadonlyArray<MistwaterEddy> = [
	{ id: "eddy-west", x: 560, y: 465, radius: 24, duration: 5_800, direction: 1 },
	{ id: "eddy-center", x: 940, y: 585, radius: 29, duration: 6_500, direction: -1 },
	{ id: "eddy-east", x: 1_300, y: 445, radius: 23, duration: 5_400, direction: 1 }
];

export const MISTWATER_PLAYER_START: MistwaterPoint = { x: 900, y: 515 };

export function isMistwaterWaterPoint(x: number, y: number): boolean {
	return WATER_BASINS.some((basin) => pointInEllipse(x, y, basin));
}

function pointInEllipse(x: number, y: number, ellipse: EllipseArea): boolean {
	const normalizedX = (x - ellipse.x) / ellipse.rx;
	const normalizedY = (y - ellipse.y) / ellipse.ry;
	return normalizedX * normalizedX + normalizedY * normalizedY <= 1;
}
