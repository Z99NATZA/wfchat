export const MISTWATER_TILE_SIZE = 32;
export const MISTWATER_MAP_COLUMNS = 50;
export const MISTWATER_MAP_ROWS = 31;
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
};

export type MistwaterSceneryKind = "tree" | "rock" | "reeds" | "lilies" | "bridge" | "island";

export type MistwaterSceneryObject = MistwaterPoint & {
	id: string;
	kind: MistwaterSceneryKind;
	variant?: number;
	scale?: number;
	rotation?: number;
};

export type MistwaterFogVeil = MistwaterPoint & {
	id: string;
	width: number;
	height: number;
	drift: number;
	duration: number;
};

const WATER_BASINS: ReadonlyArray<EllipseArea> = [
	{ x: 800, y: 500, rx: 590, ry: 300 },
	{ x: 350, y: 470, rx: 225, ry: 225 },
	{ x: 1250, y: 450, rx: 250, ry: 240 }
];

const WATER_CHANNELS: ReadonlyArray<MapPath> = [
	{ id: "northwest-inlet", from: { x: 190, y: 40 }, to: { x: 530, y: 350 }, width: 190 },
	{ id: "northeast-inlet", from: { x: 1400, y: 35 }, to: { x: 1090, y: 330 }, width: 180 },
	{ id: "south-outlet", from: { x: 830, y: 670 }, to: { x: 710, y: 1_030 }, width: 210 },
	{ id: "southeast-creek", from: { x: 1_150, y: 590 }, to: { x: 1_560, y: 880 }, width: 145 }
];

const LAND_ISLANDS: ReadonlyArray<EllipseArea> = [
	{ x: 805, y: 410, rx: 132, ry: 95 },
	{ x: 560, y: 570, rx: 82, ry: 58 },
	{ x: 1_085, y: 590, rx: 96, ry: 70 },
	{ x: 1_280, y: 355, rx: 62, ry: 48 }
];

const LAND_PATHS: ReadonlyArray<MapPath> = [
	{ id: "northwest-bank", from: { x: 65, y: 250 }, to: { x: 390, y: 150 }, width: 58 },
	{ id: "north-bank", from: { x: 520, y: 100 }, to: { x: 990, y: 95 }, width: 62 },
	{ id: "northeast-bank", from: { x: 1_200, y: 150 }, to: { x: 1_550, y: 250 }, width: 58 },
	{ id: "west-bank", from: { x: 85, y: 690 }, to: { x: 330, y: 820 }, width: 62 },
	{ id: "south-bank", from: { x: 350, y: 850 }, to: { x: 1_250, y: 875 }, width: 66 }
];

export const MISTWATER_FLOW_CURRENTS: ReadonlyArray<MistwaterFlowCurrent> = [
	{
		id: "northwest-current",
		from: { x: 205, y: 55 },
		to: { x: 520, y: 345 },
		width: 70,
		speed: 0.055,
		motes: 7
	},
	{
		id: "northeast-current",
		from: { x: 1_395, y: 55 },
		to: { x: 1_095, y: 335 },
		width: 65,
		speed: 0.05,
		motes: 6
	},
	{
		id: "basin-current",
		from: { x: 470, y: 395 },
		to: { x: 1_170, y: 560 },
		width: 85,
		speed: 0.032,
		motes: 10
	},
	{
		id: "south-current",
		from: { x: 850, y: 650 },
		to: { x: 720, y: 1_010 },
		width: 75,
		speed: 0.052,
		motes: 7
	},
	{
		id: "southeast-current",
		from: { x: 1_120, y: 585 },
		to: { x: 1_565, y: 875 },
		width: 55,
		speed: 0.06,
		motes: 7
	}
];

export const MISTWATER_SCENERY: ReadonlyArray<MistwaterSceneryObject> = [
	{ id: "tree-nw-1", kind: "tree", x: 80, y: 155, variant: 0, scale: 1.15 },
	{ id: "tree-nw-2", kind: "tree", x: 155, y: 205, variant: 1 },
	{ id: "tree-nw-3", kind: "tree", x: 245, y: 115, variant: 2, scale: 1.1 },
	{ id: "tree-north-1", kind: "tree", x: 485, y: 105, variant: 1 },
	{ id: "tree-north-2", kind: "tree", x: 690, y: 82, variant: 0, scale: 1.1 },
	{ id: "tree-north-3", kind: "tree", x: 920, y: 78, variant: 2 },
	{ id: "tree-ne-1", kind: "tree", x: 1_185, y: 105, variant: 0, scale: 1.05 },
	{ id: "tree-ne-2", kind: "tree", x: 1_405, y: 150, variant: 1, scale: 1.18 },
	{ id: "tree-east-1", kind: "tree", x: 1_505, y: 390, variant: 2 },
	{ id: "tree-east-2", kind: "tree", x: 1_500, y: 650, variant: 0, scale: 1.1 },
	{ id: "tree-se-1", kind: "tree", x: 1_385, y: 850, variant: 1, scale: 1.2 },
	{ id: "tree-south-1", kind: "tree", x: 1_145, y: 900, variant: 2 },
	{ id: "tree-south-2", kind: "tree", x: 960, y: 925, variant: 0, scale: 1.1 },
	{ id: "tree-south-3", kind: "tree", x: 530, y: 915, variant: 1 },
	{ id: "tree-sw-1", kind: "tree", x: 270, y: 865, variant: 2, scale: 1.16 },
	{ id: "tree-west-1", kind: "tree", x: 105, y: 690, variant: 0 },
	{ id: "tree-west-2", kind: "tree", x: 80, y: 455, variant: 1, scale: 1.1 },
	{ id: "tree-island-center", kind: "tree", x: 605, y: 345, variant: 2, scale: 0.92 },
	{ id: "tree-island-east", kind: "tree", x: 1_120, y: 445, variant: 0, scale: 0.82 },

	{ id: "rock-nw", kind: "rock", x: 340, y: 285, variant: 0, scale: 1.1 },
	{ id: "rock-west", kind: "rock", x: 185, y: 540, variant: 1 },
	{ id: "rock-center-left", kind: "rock", x: 520, y: 545, variant: 2 },
	{ id: "rock-center-right", kind: "rock", x: 985, y: 655, variant: 0 },
	{ id: "rock-east", kind: "rock", x: 1_385, y: 570, variant: 1, scale: 1.2 },
	{ id: "rock-southwest", kind: "rock", x: 410, y: 770, variant: 2 },
	{ id: "rock-south", kind: "rock", x: 1_020, y: 800, variant: 0 },

	{ id: "reeds-west-1", kind: "reeds", x: 290, y: 390, variant: 0 },
	{ id: "reeds-west-2", kind: "reeds", x: 405, y: 600, variant: 1 },
	{ id: "reeds-center-1", kind: "reeds", x: 690, y: 375, variant: 0 },
	{ id: "reeds-center-2", kind: "reeds", x: 900, y: 590, variant: 2 },
	{ id: "reeds-east-1", kind: "reeds", x: 1_205, y: 315, variant: 1 },
	{ id: "reeds-east-2", kind: "reeds", x: 1_290, y: 650, variant: 0 },
	{ id: "reeds-south", kind: "reeds", x: 755, y: 760, variant: 2 },

	{ id: "lilies-west", kind: "lilies", x: 315, y: 480, variant: 0 },
	{ id: "lilies-center", kind: "lilies", x: 760, y: 600, variant: 1 },
	{ id: "lilies-east", kind: "lilies", x: 1_250, y: 495, variant: 2 },
	{ id: "lilies-south", kind: "lilies", x: 870, y: 720, variant: 0 },
	{ id: "island-west", kind: "island", x: 320, y: 650, variant: 1, scale: 0.9 },
	{ id: "island-east", kind: "island", x: 1_325, y: 665, variant: 0, scale: 0.86 },

	{
		id: "bridge-northwest",
		kind: "bridge",
		x: 370,
		y: 210,
		rotation: 43,
		scale: 1.05
	},
	{
		id: "bridge-northeast",
		kind: "bridge",
		x: 1_245,
		y: 205,
		rotation: -42,
		scale: 1.05
	},
	{ id: "bridge-south", kind: "bridge", x: 765, y: 820, rotation: 72, scale: 1.08 }
];

export const MISTWATER_BLOOM_POINTS: ReadonlyArray<MistwaterPoint> = [
	{ x: 285, y: 345 },
	{ x: 485, y: 430 },
	{ x: 625, y: 285 },
	{ x: 925, y: 275 },
	{ x: 1_150, y: 390 },
	{ x: 1_345, y: 505 },
	{ x: 1_175, y: 690 },
	{ x: 900, y: 735 },
	{ x: 625, y: 690 },
	{ x: 390, y: 610 },
	{ x: 225, y: 490 }
];

export const MISTWATER_FOG_VEILS: ReadonlyArray<MistwaterFogVeil> = [
	{ id: "fog-northwest", x: 170, y: 190, width: 330, height: 110, drift: 45, duration: 5_500 },
	{ id: "fog-north", x: 570, y: 120, width: 410, height: 120, drift: -45, duration: 5_980 },
	{ id: "fog-northeast", x: 1_010, y: 170, width: 360, height: 115, drift: 45, duration: 6_460 },
	{ id: "fog-basin", x: 790, y: 535, width: 390, height: 110, drift: -38, duration: 7_100 },
	{ id: "fog-east", x: 1_420, y: 360, width: 300, height: 100, drift: -45, duration: 6_940 },
	{ id: "fog-south", x: 1_140, y: 830, width: 390, height: 120, drift: 45, duration: 7_420 },
	{ id: "fog-southwest", x: 360, y: 820, width: 410, height: 125, drift: -45, duration: 7_900 }
];

export const MISTWATER_PLAYER_START: MistwaterPoint = { x: 800, y: 535 };

export function isMistwaterWaterPoint(x: number, y: number): boolean {
	if (LAND_ISLANDS.some((island) => pointInEllipse(x, y, island))) {
		return false;
	}

	return (
		WATER_BASINS.some((basin) => pointInEllipse(x, y, basin)) ||
		WATER_CHANNELS.some(
			(channel) => distanceToSegment(x, y, channel.from, channel.to) <= channel.width / 2
		)
	);
}

export function isMistwaterPathPoint(x: number, y: number): boolean {
	return LAND_PATHS.some((path) => distanceToSegment(x, y, path.from, path.to) <= path.width / 2);
}

function pointInEllipse(x: number, y: number, ellipse: EllipseArea): boolean {
	const normalizedX = (x - ellipse.x) / ellipse.rx;
	const normalizedY = (y - ellipse.y) / ellipse.ry;
	return normalizedX * normalizedX + normalizedY * normalizedY <= 1;
}

function distanceToSegment(x: number, y: number, from: MistwaterPoint, to: MistwaterPoint): number {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	if (dx === 0 && dy === 0) {
		return Math.hypot(x - from.x, y - from.y);
	}

	const progress = Math.max(
		0,
		Math.min(1, ((x - from.x) * dx + (y - from.y) * dy) / (dx * dx + dy * dy))
	);
	return Math.hypot(x - (from.x + dx * progress), y - (from.y + dy * progress));
}
