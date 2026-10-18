export const MISTWATER_TILE_SIZE = 32;
export const MISTWATER_MAP_COLUMNS = 84;
export const MISTWATER_MAP_ROWS = 42;
export const MISTWATER_WORLD_WIDTH = MISTWATER_MAP_COLUMNS * MISTWATER_TILE_SIZE;
export const MISTWATER_WORLD_HEIGHT = MISTWATER_MAP_ROWS * MISTWATER_TILE_SIZE;

export type MistwaterPoint = {
	x: number;
	y: number;
};

export type MistwaterFoliageLayer = {
	id: string;
	kind: "branch" | "understory";
	x: number;
	y: number;
	scale: number;
	originX: number;
	originY: number;
	flipX: boolean;
	alpha: number;
	tint: number;
	rotation: number;
	sway: number;
	phase: number;
	depthFactor: number;
	depth: number;
};

export type MistwaterTreeObject = {
	id: string;
	x: number;
	y: number;
	scale: number;
	crownOffsetX: number;
	crownOffsetY: number;
	flipX: boolean;
	tint: number;
	rotation: number;
	sway: number;
	phase: number;
	depthFactor: number;
};

export type MistwaterArea = {
	x: number;
	y: number;
	width: number;
	height: number;
};

export const MISTWATER_WATER_BOUNDS = {
	x: 680,
	y: 350,
	width: 1_600,
	height: 800
} as const;

// Shared by pointer validation and the animated water mask.
export const MISTWATER_SHORELINE: ReadonlyArray<MistwaterPoint> = [
	{ x: 1_010, y: 420 },
	{ x: 1_230, y: 390 },
	{ x: 1_470, y: 390 },
	{ x: 1_700, y: 410 },
	{ x: 1_910, y: 470 },
	{ x: 2_100, y: 550 },
	{ x: 2_220, y: 650 },
	{ x: 2_250, y: 750 },
	{ x: 2_160, y: 840 },
	{ x: 2_030, y: 940 },
	{ x: 1_840, y: 1_020 },
	{ x: 1_640, y: 1_080 },
	{ x: 1_460, y: 1_090 },
	{ x: 1_230, y: 1_080 },
	{ x: 1_040, y: 1_000 },
	{ x: 890, y: 900 },
	{ x: 770, y: 790 },
	{ x: 720, y: 680 },
	{ x: 750, y: 570 },
	{ x: 830, y: 490 },
	{ x: 920, y: 440 }
];

// Each entry is an independent scene object. Add, remove, or move entries
// without repainting the terrain or pond.
export const MISTWATER_TREE_OBJECTS: ReadonlyArray<MistwaterTreeObject> = [
	{
		id: "back-left",
		x: 95,
		y: 260,
		scale: 0.34,
		crownOffsetX: -8,
		crownOffsetY: -198,
		flipX: false,
		tint: 0x7e936f,
		rotation: -0.025,
		sway: 0.55,
		phase: 0.3,
		depthFactor: 0.62
	},
	{
		id: "back-left-center",
		x: 610,
		y: 410,
		scale: 0.32,
		crownOffsetX: 4,
		crownOffsetY: -186,
		flipX: true,
		tint: 0x789070,
		rotation: 0.018,
		sway: 0.5,
		phase: 1.7,
		depthFactor: 0.58
	},
	{
		id: "back-center",
		x: 1_210,
		y: 230,
		scale: 0.29,
		crownOffsetX: -5,
		crownOffsetY: -170,
		flipX: false,
		tint: 0x70886d,
		rotation: -0.012,
		sway: 0.46,
		phase: 3.2,
		depthFactor: 0.52
	},
	{
		id: "back-right-center",
		x: 1_900,
		y: 300,
		scale: 0.31,
		crownOffsetX: 7,
		crownOffsetY: -182,
		flipX: true,
		tint: 0x768d6c,
		rotation: 0.014,
		sway: 0.48,
		phase: 4.6,
		depthFactor: 0.56
	},
	{
		id: "back-right",
		x: 2_590,
		y: 320,
		scale: 0.36,
		crownOffsetX: 8,
		crownOffsetY: -210,
		flipX: false,
		tint: 0x81966f,
		rotation: -0.02,
		sway: 0.58,
		phase: 5.7,
		depthFactor: 0.66
	},
	{
		id: "left-bank",
		x: 160,
		y: 720,
		scale: 0.43,
		crownOffsetX: -10,
		crownOffsetY: -250,
		flipX: true,
		tint: 0x82986f,
		rotation: 0.022,
		sway: 0.7,
		phase: 2.4,
		depthFactor: 0.9
	},
	{
		id: "right-bank",
		x: 2_590,
		y: 800,
		scale: 0.44,
		crownOffsetX: 10,
		crownOffsetY: -256,
		flipX: false,
		tint: 0x7c936b,
		rotation: -0.018,
		sway: 0.72,
		phase: 0.9,
		depthFactor: 0.92
	},
	{
		id: "front-left",
		x: 300,
		y: 1_300,
		scale: 0.55,
		crownOffsetX: -14,
		crownOffsetY: -320,
		flipX: false,
		tint: 0x758d68,
		rotation: -0.028,
		sway: 0.88,
		phase: 4.1,
		depthFactor: 1.18
	},
	{
		id: "front-left-center",
		x: 930,
		y: 1_340,
		scale: 0.5,
		crownOffsetX: 10,
		crownOffsetY: -292,
		flipX: true,
		tint: 0x708765,
		rotation: 0.02,
		sway: 0.84,
		phase: 5.3,
		depthFactor: 1.15
	},
	{
		id: "front-right-center",
		x: 1_740,
		y: 1_340,
		scale: 0.52,
		crownOffsetX: -8,
		crownOffsetY: -304,
		flipX: false,
		tint: 0x788e68,
		rotation: -0.016,
		sway: 0.86,
		phase: 1.4,
		depthFactor: 1.17
	},
	{
		id: "front-right",
		x: 2_530,
		y: 1_230,
		scale: 0.54,
		crownOffsetX: 14,
		crownOffsetY: -315,
		flipX: true,
		tint: 0x748b65,
		rotation: 0.026,
		sway: 0.9,
		phase: 2.8,
		depthFactor: 1.2
	}
];

export const MISTWATER_FOLIAGE_LAYERS: ReadonlyArray<MistwaterFoliageLayer> = [
	{
		id: "upper-left-branch",
		kind: "branch",
		x: 20,
		y: 115,
		scale: 0.4,
		originX: 0,
		originY: 0.34,
		flipX: false,
		alpha: 0.44,
		tint: 0x91a879,
		rotation: -0.04,
		sway: 0.82,
		phase: 0.2,
		depthFactor: 0.9,
		depth: 2.5
	},
	{
		id: "upper-right-branch",
		kind: "branch",
		x: 2_668,
		y: 105,
		scale: 0.4,
		originX: 1,
		originY: 0.34,
		flipX: true,
		alpha: 0.42,
		tint: 0x8fa477,
		rotation: 0.035,
		sway: 0.78,
		phase: 1.8,
		depthFactor: 0.88,
		depth: 2.5
	},
	{
		id: "upper-left-understory",
		kind: "understory",
		x: 700,
		y: 465,
		scale: 0.22,
		originX: 0.5,
		originY: 1,
		flipX: false,
		alpha: 0.46,
		tint: 0x9bb381,
		rotation: 0,
		sway: 0.72,
		phase: 5.1,
		depthFactor: 0.72,
		depth: 2.35
	},
	{
		id: "upper-right-understory",
		kind: "understory",
		x: 2_080,
		y: 485,
		scale: 0.2,
		originX: 0.5,
		originY: 1,
		flipX: true,
		alpha: 0.44,
		tint: 0x91aa79,
		rotation: 0,
		sway: 0.7,
		phase: 4.2,
		depthFactor: 0.7,
		depth: 2.35
	},
	{
		id: "lower-left-understory",
		kind: "understory",
		x: 640,
		y: 1_105,
		scale: 0.31,
		originX: 0.5,
		originY: 1,
		flipX: true,
		alpha: 0.5,
		tint: 0x829b6e,
		rotation: 0,
		sway: 0.88,
		phase: 0.8,
		depthFactor: 1.05,
		depth: 2.42
	},
	{
		id: "foreground-left-understory",
		kind: "understory",
		x: 1_030,
		y: 1_335,
		scale: 0.39,
		originX: 0.5,
		originY: 1,
		flipX: false,
		alpha: 0.54,
		tint: 0x789067,
		rotation: 0,
		sway: 1,
		phase: 5.6,
		depthFactor: 1.2,
		depth: 2.7
	},
	{
		id: "foreground-right-understory",
		kind: "understory",
		x: 1_760,
		y: 1_335,
		scale: 0.42,
		originX: 0.5,
		originY: 1,
		flipX: true,
		alpha: 0.52,
		tint: 0x82996e,
		rotation: 0,
		sway: 1.02,
		phase: 0.9,
		depthFactor: 1.22,
		depth: 2.72
	},
	{
		id: "lower-right-understory",
		kind: "understory",
		x: 2_180,
		y: 1_095,
		scale: 0.3,
		originX: 0.5,
		originY: 1,
		flipX: false,
		alpha: 0.48,
		tint: 0x88a272,
		rotation: 0,
		sway: 0.9,
		phase: 2.3,
		depthFactor: 1.06,
		depth: 2.43
	}
];

export const MISTWATER_LEAF_SOURCE_AREAS: ReadonlyArray<MistwaterArea> = [
	{ x: 80, y: 20, width: 520, height: 300 },
	{ x: 600, y: 15, width: 520, height: 260 },
	{ x: 1_220, y: 15, width: 620, height: 270 },
	{ x: 1_900, y: 20, width: 620, height: 320 },
	{ x: 15, y: 350, width: 520, height: 520 },
	{ x: 2_250, y: 340, width: 420, height: 520 },
	{ x: 100, y: 900, width: 720, height: 390 },
	{ x: 1_850, y: 930, width: 720, height: 360 }
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
