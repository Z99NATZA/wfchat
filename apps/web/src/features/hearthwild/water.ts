import { hash, MAPS, terrain, TILE } from "./world";

const WATER_BASE = "#0a4059";
const WATER_DEEP = "#062f4b";
const WATER_SHALLOW = "#23777b";
const MAX_DEPTH_TILES = 6;
type WaterPoint = readonly [number, number];

function inGarden(x: number, y: number) {
	return x >= 0 && y >= 0 && x < MAPS.garden.width && y < MAPS.garden.height;
}

function dryGardenTile(x: number, y: number) {
	return inGarden(x, y) && terrain("garden", x, y) !== "water";
}

const SHORE_STEP = 8;
const POND_POINTS = 64;

export function gardenSouthShoreY(worldX: number): number {
	const point = Math.max(0, Math.floor(worldX / SHORE_STEP)),
		fraction = Math.max(0, worldX / SHORE_STEP - point),
		value = (index: number) => 2 + Math.floor(hash(index + 101, 719) * 6),
		from = value(point),
		to = value(point + 1);
	return 23 * TILE + Math.round(from + (to - from) * fraction);
}

export function gardenPondShoreline(): ReadonlyArray<WaterPoint> {
	const centerX = 27.5 * TILE,
		centerY = 19.5 * TILE,
		radiusX = 5.55 * TILE,
		radiusY = 4.05 * TILE;
	return Array.from({ length: POND_POINTS }, (_, index) => {
		const angle = -Math.PI / 2 + (index / POND_POINTS) * Math.PI * 2,
			organic =
				1 +
				(hash(index + 419, 887) - 0.5) * 0.065 +
				Math.sin(angle * 3 + 0.7) * 0.035 +
				Math.sin(angle * 7 - 0.4) * 0.018;
		return [
			Math.round((centerX + Math.cos(angle) * radiusX * organic) / 2) * 2,
			Math.round((centerY + Math.sin(angle) * radiusY * organic) / 2) * 2
		] as const;
	});
}

function tracePoints(ctx: CanvasRenderingContext2D, points: ReadonlyArray<WaterPoint>) {
	ctx.moveTo(...points[0]);
	for (let index = 1; index < points.length; index++) ctx.lineTo(...points[index]);
}

function waterMask(ctx: CanvasRenderingContext2D) {
	const { width, height } = MAPS.garden;
	const worldWidth = width * TILE,
		worldHeight = height * TILE,
		southBank = Array.from(
			{ length: Math.ceil(worldWidth / SHORE_STEP) + 1 },
			(_, index) =>
				[
					Math.min(worldWidth, index * SHORE_STEP),
					gardenSouthShoreY(index * SHORE_STEP)
				] as const
		);
	ctx.beginPath();
	tracePoints(ctx, southBank);
	ctx.lineTo(worldWidth, worldHeight);
	ctx.lineTo(0, worldHeight);
	ctx.closePath();
	tracePoints(ctx, gardenPondShoreline());
	ctx.closePath();
	ctx.clip();
}

export function gardenWaterDepth(x: number, y: number): number {
	if (!inGarden(x, y) || terrain("garden", x, y) !== "water") return 0;
	let nearest = MAX_DEPTH_TILES;
	for (let oy = -MAX_DEPTH_TILES; oy <= MAX_DEPTH_TILES; oy++)
		for (let ox = -MAX_DEPTH_TILES; ox <= MAX_DEPTH_TILES; ox++) {
			if (!dryGardenTile(x + ox, y + oy)) continue;
			nearest = Math.min(nearest, Math.hypot(ox, oy));
		}
	return Math.max(1, Math.min(MAX_DEPTH_TILES, nearest));
}

function drawSubmergedStone(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number
) {
	ctx.fillStyle = "rgba(3, 31, 44, 0.34)";
	ctx.beginPath();
	ctx.ellipse(x, y + 2, width * 0.54, height * 0.55, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = "rgba(57, 112, 105, 0.24)";
	ctx.beginPath();
	ctx.ellipse(x - width * 0.08, y - 1, width * 0.42, height * 0.32, 0, Math.PI, Math.PI * 2);
	ctx.fill();
}

function strokeShore(ctx: CanvasRenderingContext2D, points: ReadonlyArray<WaterPoint>) {
	ctx.beginPath();
	tracePoints(ctx, points);
	ctx.stroke();
}

function gardenShoreSegments(worldWidth: number) {
	const southBank = Array.from(
		{ length: Math.ceil(worldWidth / SHORE_STEP) + 1 },
		(_, index) =>
			[
				Math.min(worldWidth, index * SHORE_STEP),
				gardenSouthShoreY(index * SHORE_STEP)
			] as const
	);
	const pondSegments: WaterPoint[][] = [];
	for (const point of gardenPondShoreline()) {
		if (point[1] < gardenSouthShoreY(point[0]) + 2) {
			const segment = pondSegments.at(-1);
			if (segment) segment.push(point);
			else pondSegments.push([point]);
		} else if (pondSegments.at(-1)?.length) pondSegments.push([]);
	}
	if (pondSegments.length > 1 && pondSegments[0].length && pondSegments.at(-1)?.length) {
		pondSegments[0] = [...pondSegments.at(-1)!, ...pondSegments[0]];
		pondSegments.pop();
	}
	let pondBank = pondSegments.filter((segment) => segment.length > 1)[0] ?? [];
	if (pondBank.length > 1 && pondBank[0][0] > pondBank.at(-1)![0])
		pondBank = [...pondBank].reverse();
	const leftBank = pondBank.length
		? southBank.filter((point) => point[0] < pondBank[0][0])
		: southBank;
	const rightBank = pondBank.length
		? southBank.filter((point) => point[0] > pondBank.at(-1)![0])
		: [];
	return {
		outline: [...leftBank, ...pondBank, ...rightBank],
		leftBank,
		pondBank,
		rightBank
	};
}

export function gardenShoreOutline(worldWidth = MAPS.garden.width * TILE) {
	return gardenShoreSegments(worldWidth).outline;
}

function drawShoreDetails(
	ctx: CanvasRenderingContext2D,
	points: ReadonlyArray<WaterPoint>,
	seedOffset: number,
	pond: boolean
) {
	const centerX = 27.5 * TILE,
		centerY = 19.5 * TILE;
	for (let index = 2; index < points.length - 2;) {
		const current = index,
			seed = hash(current + seedOffset, seedOffset + 37);
		index += 3 + Math.floor(hash(index + seedOffset, 977) * 5);
		if (seed < 0.35) continue;
		const [x, y] = points[current],
			previous = points[current - 1],
			next = points[current + 1],
			tangentLength = Math.max(1, Math.hypot(next[0] - previous[0], next[1] - previous[1])),
			tangentX = (next[0] - previous[0]) / tangentLength,
			tangentY = (next[1] - previous[1]) / tangentLength,
			normalLength = pond ? Math.max(1, Math.hypot(x - centerX, y - centerY)) : 1,
			normalX = pond ? (x - centerX) / normalLength : 0,
			normalY = pond ? (y - centerY) / normalLength : -1,
			distance = 2 + hash(current + seedOffset, 811) * 4,
			jitter = (hash(current + 97, seedOffset) - 0.5) * 7,
			detailX = Math.round(x + normalX * distance + tangentX * jitter),
			detailY = Math.round(y + normalY * distance + tangentY * jitter);
		if (seed > 0.78) {
			ctx.fillStyle = "#193c38";
			ctx.fillRect(detailX - 1, detailY, 8, 4);
			ctx.fillStyle = "#607264";
			ctx.fillRect(detailX, detailY - 1, 6, 3);
			ctx.fillStyle = "#819080";
			ctx.fillRect(detailX + 1, detailY - 1, 3, 1);
		} else {
			ctx.fillStyle = seed > 0.56 ? "#4d6652" : "#294c42";
			ctx.fillRect(detailX, detailY, seed > 0.56 ? 7 : 4, seed > 0.68 ? 2 : 1);
		}
		if (seed > 0.68) {
			ctx.fillStyle = seed > 0.91 ? "#75916c" : "#456e59";
			ctx.fillRect(detailX, detailY - 6, 1, 6);
			ctx.fillRect(detailX + 3, detailY - 4, 1, 4);
			if (seed > 0.88) ctx.fillRect(detailX + 4, detailY - 4, 1, 4);
		}
		if (pond && seed > 0.57 && seed < 0.82) {
			const waterX = Math.round(x - normalX * (8 + seed * 5)),
				waterY = Math.round(y - normalY * (8 + seed * 5));
			ctx.fillStyle = "rgba(8, 42, 45, 0.55)";
			ctx.beginPath();
			ctx.ellipse(waterX, waterY + 1, 5, 2.5, 0, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = seed > 0.7 ? "#557d50" : "#3e684d";
			ctx.beginPath();
			ctx.ellipse(waterX, waterY, 4, 2, 0, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = "#789365";
			ctx.fillRect(waterX - 2, waterY - 1, 2, 1);
			if (seed > 0.7) {
				ctx.fillStyle = "#365d46";
				ctx.beginPath();
				ctx.ellipse(waterX + 7, waterY + 3, 3, 1.5, 0, 0, Math.PI * 2);
				ctx.fill();
			}
		}
	}
}

function drawGardenShoreline(ctx: CanvasRenderingContext2D, worldWidth: number) {
	const { outline, leftBank, pondBank, rightBank } = gardenShoreSegments(worldWidth);
	ctx.lineCap = "round";
	ctx.lineJoin = "round";

	ctx.save();
	waterMask(ctx);
	ctx.strokeStyle = "rgba(67, 157, 149, 0.13)";
	ctx.lineWidth = 10;
	strokeShore(ctx, outline);
	ctx.restore();

	ctx.strokeStyle = "rgba(12, 43, 40, 0.7)";
	ctx.lineWidth = 3;
	strokeShore(ctx, outline);

	drawShoreDetails(ctx, leftBank, 1103, false);
	drawShoreDetails(ctx, pondBank, 1301, true);
	drawShoreDetails(ctx, rightBank, 1499, false);
}

/** Paints the complete still-water presentation. */
export function paintGardenWaterGround(
	ctx: CanvasRenderingContext2D,
	width = MAPS.garden.width,
	height = MAPS.garden.height
) {
	const worldWidth = width * TILE,
		worldHeight = height * TILE;
	ctx.save();
	waterMask(ctx);
	const waterDepth = ctx.createLinearGradient(0, 14 * TILE, 0, worldHeight);
	waterDepth.addColorStop(0, WATER_BASE);
	waterDepth.addColorStop(0.62, WATER_SHALLOW);
	waterDepth.addColorStop(1, WATER_DEEP);
	ctx.fillStyle = waterDepth;
	ctx.fillRect(0, 0, worldWidth, worldHeight);

	const pondDepth = ctx.createRadialGradient(
		24.5 * TILE,
		17.2 * TILE,
		4,
		24.5 * TILE,
		17.2 * TILE,
		6.8 * TILE
	);
	pondDepth.addColorStop(0, "rgba(1, 28, 48, 0.76)");
	pondDepth.addColorStop(0.62, "rgba(4, 48, 64, 0.28)");
	pondDepth.addColorStop(1, "rgba(4, 48, 64, 0)");
	ctx.fillStyle = pondDepth;
	ctx.fillRect(18 * TILE, 12 * TILE, 17 * TILE, 12 * TILE);

	const pondShallows = ctx.createRadialGradient(
		30.5 * TILE,
		21.5 * TILE,
		2,
		30.5 * TILE,
		21.5 * TILE,
		6 * TILE
	);
	pondShallows.addColorStop(0, "rgba(70, 164, 148, 0.54)");
	pondShallows.addColorStop(0.48, "rgba(35, 132, 132, 0.25)");
	pondShallows.addColorStop(1, "rgba(13, 72, 88, 0)");
	ctx.fillStyle = pondShallows;
	ctx.fillRect(24 * TILE, 15 * TILE, 14 * TILE, 10 * TILE);

	for (let y = 0; y < height; y++)
		for (let x = 0; x < width; x++) {
			if (terrain("garden", x, y) !== "water") continue;
			const depth = gardenWaterDepth(x, y),
				seed = hash(x + 211, y + 97),
				px = x * TILE,
				py = y * TILE;
			if (depth > 1.5 && seed > 0.84)
				drawSubmergedStone(
					ctx,
					px + 7 + hash(x + 19, y + 41) * 19,
					py + 8 + hash(x + 71, y + 13) * 16,
					8 + hash(x, y + 29) * 11,
					4 + hash(x + 31, y) * 5
				);
			ctx.fillStyle = depth < 2 ? "rgba(143, 208, 176, 0.16)" : "rgba(115, 192, 186, 0.1)";
			for (let speck = 0; speck < 4; speck++) {
				const sx = Math.floor(hash(x * 17 + speck, y * 31 + speck) * 29),
					sy = Math.floor(hash(x * 43 - speck, y * 11 + speck) * 29);
				ctx.fillRect(px + sx, py + sy, speck % 2 ? 2 : 1, 1);
			}
		}
	ctx.restore();

	drawGardenShoreline(ctx, worldWidth);
}
