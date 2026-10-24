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
	kind: "branch" | "understory" | "grass";
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
	x: 620,
	y: 320,
	width: 1_660,
	height: 820
} as const;

// Traced against the pond-rim artwork in world coordinates. Shared by
// pointer validation, the water mask, and the stationary shoreline blend.
export const MISTWATER_SHORELINE: ReadonlyArray<MistwaterPoint> = [
	{ x: 1_100, y: 378 },
	{ x: 1_140, y: 364 },
	{ x: 1_190, y: 357 },
	{ x: 1_240, y: 353 },
	{ x: 1_280, y: 352 },
	{ x: 1_310, y: 358 },
	{ x: 1_334, y: 370 },
	{ x: 1_370, y: 373 },
	{ x: 1_400, y: 376 },
	{ x: 1_412, y: 390 },
	{ x: 1_418, y: 408 },
	{ x: 1_430, y: 416 },
	{ x: 1_450, y: 422 },
	{ x: 1_470, y: 435 },
	{ x: 1_490, y: 445 },
	{ x: 1_510, y: 446 },
	{ x: 1_530, y: 445 },
	{ x: 1_550, y: 453 },
	{ x: 1_570, y: 457 },
	{ x: 1_590, y: 466 },
	{ x: 1_610, y: 475 },
	{ x: 1_630, y: 484 },
	{ x: 1_650, y: 497 },
	{ x: 1_670, y: 498 },
	{ x: 1_690, y: 500 },
	{ x: 1_710, y: 497 },
	{ x: 1_730, y: 508 },
	{ x: 1_750, y: 512 },
	{ x: 1_770, y: 520 },
	{ x: 1_790, y: 522 },
	{ x: 1_810, y: 540 },
	{ x: 1_840, y: 537 },
	{ x: 1_880, y: 540 },
	{ x: 1_898, y: 560 },
	{ x: 1_930, y: 570 },
	{ x: 1_960, y: 574 },
	{ x: 1_990, y: 590 },
	{ x: 2_010, y: 603 },
	{ x: 2_040, y: 613 },
	{ x: 2_070, y: 628 },
	{ x: 2_100, y: 637 },
	{ x: 2_130, y: 648 },
	{ x: 2_160, y: 671 },
	{ x: 2_180, y: 685 },
	{ x: 2_198, y: 699 },
	{ x: 2_205, y: 721 },
	{ x: 2_190, y: 733 },
	{ x: 2_206, y: 750 },
	{ x: 2_220, y: 764 },
	{ x: 2_230, y: 788 },
	{ x: 2_220, y: 803 },
	{ x: 2_193, y: 809 },
	{ x: 2_160, y: 816 },
	{ x: 2_130, y: 837 },
	{ x: 2_115, y: 865 },
	{ x: 2_110, y: 885 },
	{ x: 2_075, y: 905 },
	{ x: 2_052, y: 921 },
	{ x: 2_030, y: 936 },
	{ x: 2_028, y: 950 },
	{ x: 2_000, y: 955 },
	{ x: 1_980, y: 970 },
	{ x: 1_953, y: 979 },
	{ x: 1_920, y: 992 },
	{ x: 1_910, y: 1_008 },
	{ x: 1_885, y: 1_021 },
	{ x: 1_855, y: 1_030 },
	{ x: 1_810, y: 1_044 },
	{ x: 1_780, y: 1_057 },
	{ x: 1_730, y: 1_075 },
	{ x: 1_680, y: 1_092 },
	{ x: 1_640, y: 1_100 },
	{ x: 1_595, y: 1_091 },
	{ x: 1_560, y: 1_088 },
	{ x: 1_510, y: 1_090 },
	{ x: 1_480, y: 1_075 },
	{ x: 1_460, y: 1_057 },
	{ x: 1_430, y: 1_050 },
	{ x: 1_400, y: 1_045 },
	{ x: 1_370, y: 1_037 },
	{ x: 1_340, y: 1_032 },
	{ x: 1_325, y: 1_013 },
	{ x: 1_290, y: 1_005 },
	{ x: 1_255, y: 996 },
	{ x: 1_215, y: 990 },
	{ x: 1_180, y: 987 },
	{ x: 1_150, y: 975 },
	{ x: 1_120, y: 973 },
	{ x: 1_095, y: 968 },
	{ x: 1_084, y: 941 },
	{ x: 1_064, y: 920 },
	{ x: 1_040, y: 908 },
	{ x: 1_012, y: 897 },
	{ x: 985, y: 893 },
	{ x: 952, y: 897 },
	{ x: 926, y: 889 },
	{ x: 904, y: 879 },
	{ x: 890, y: 858 },
	{ x: 864, y: 840 },
	{ x: 832, y: 827 },
	{ x: 800, y: 825 },
	{ x: 787, y: 818 },
	{ x: 779, y: 800 },
	{ x: 780, y: 780 },
	{ x: 767, y: 762 },
	{ x: 739, y: 746 },
	{ x: 710, y: 730 },
	{ x: 696, y: 707 },
	{ x: 688, y: 686 },
	{ x: 678, y: 664 },
	{ x: 670, y: 638 },
	{ x: 670, y: 607 },
	{ x: 672, y: 584 },
	{ x: 680, y: 560 },
	{ x: 700, y: 542 },
	{ x: 721, y: 530 },
	{ x: 754, y: 518 },
	{ x: 786, y: 507 },
	{ x: 811, y: 494 },
	{ x: 847, y: 484 },
	{ x: 878, y: 475 },
	{ x: 910, y: 462 },
	{ x: 940, y: 450 },
	{ x: 962, y: 442 },
	{ x: 984, y: 438 },
	{ x: 1_008, y: 428 },
	{ x: 1_024, y: 410 },
	{ x: 1_050, y: 398 },
	{ x: 1_075, y: 388 }
];

export const MISTWATER_SHORE_BLEND_WIDTH = 32;

// The default scene has no standalone trees; runtime editing can add them.
export const MISTWATER_TREE_OBJECTS: ReadonlyArray<MistwaterTreeObject> = [];

export const MISTWATER_FOLIAGE_LAYERS: ReadonlyArray<MistwaterFoliageLayer> = [
	{
		id: "pond-bank-grass",
		kind: "grass",
		x: 1_900,
		y: 1_170,
		scale: 0.24,
		originX: 0.5,
		originY: 0.76,
		flipX: false,
		alpha: 1,
		tint: 0xffffff,
		rotation: 0,
		sway: 1,
		phase: 0.6,
		depthFactor: 1,
		depth: 2.65
	},
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
		tint: 0x659eaa,
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
		tint: 0x6399a8,
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
		tint: 0x71adba,
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
		tint: 0x68a4b4,
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
		tint: 0x568d9f,
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
		tint: 0x4d8197,
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
		tint: 0x568d9f,
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
		tint: 0x5d98ac,
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

// Fade water effects only inside the shoreline so land always stays stationary.
export function getMistwaterWaterBlend(x: number, y: number): number {
	if (!isMistwaterWaterPoint(x, y)) {
		return 0;
	}
	let nearestSquared = Infinity;
	for (let index = 0; index < MISTWATER_SHORELINE.length; index += 1) {
		const a = MISTWATER_SHORELINE[index];
		const b = MISTWATER_SHORELINE[(index + 1) % MISTWATER_SHORELINE.length];
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const lengthSquared = dx * dx + dy * dy;
		const projection =
			lengthSquared > 0 ? ((x - a.x) * dx + (y - a.y) * dy) / lengthSquared : 0;
		const along = Math.max(0, Math.min(1, projection));
		const distanceSquared = (x - a.x - dx * along) ** 2 + (y - a.y - dy * along) ** 2;
		nearestSquared = Math.min(nearestSquared, distanceSquared);
	}
	const blend = Math.min(1, Math.sqrt(nearestSquared) / MISTWATER_SHORE_BLEND_WIDTH);
	return blend * blend * (3 - 2 * blend);
}
