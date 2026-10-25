import { drawGardenNight, lightingMinutes, type LightingPreview } from "./lighting";
import { PLAYER_CELL, PLAYER_FOOT, type PlayerSheets } from "./playerSprites";
import { ANIMATIONS, playerFrame } from "./animation";
import { PALETTE, treeAppearance } from "./appearance";
import type { GameState } from "./state";
import { paintGardenWaterGround } from "./water";
import { hash, MAPS, terrain, TILE, type MapId, type ObjectKind, type Tool } from "./world";
export const INTERIOR_URL = "/images/hearthwild/interior-atlas-v1.png";
export const ART_URL = "/images/hearthwild/woodland-atlas-v1.png";
const RECTS: number[][] = [
	[0, 0, 314, 362],
	[314, 0, 347, 364],
	[660, 66, 292, 298],
	[967, 121, 283, 231],
	[29, 370, 258, 281],
	[370, 370, 211, 285],
	[631, 393, 310, 258],
	[961, 388, 290, 269],
	[14, 650, 285, 264],
	[331, 679, 300, 234],
	[650, 663, 293, 249],
	[959, 659, 292, 255],
	[80, 911, 160, 333],
	[390, 911, 160, 333],
	[708, 911, 160, 333],
	[1015, 911, 160, 333]
];
export const SPRITES: Record<ObjectKind, number> = {
	tree: 0,
	rock: 2,
	chest: 3,
	bed: 4,
	lantern: 5,
	fence: 6,
	crop: 7,
	crystal: 8,
	mushroom: 10,
	bush: 11
};
export function sprite(
	ctx: CanvasRenderingContext2D,
	art: HTMLImageElement | HTMLCanvasElement,
	index: number,
	x: number,
	y: number,
	w: number,
	h: number
) {
	const r = RECTS[index],
		scale = ("naturalWidth" in art ? art.naturalWidth : art.width) / 1254;
	ctx.drawImage(
		art,
		r[0] * scale,
		r[1] * scale,
		r[2] * scale,
		r[3] * scale,
		Math.round(x),
		Math.round(y),
		w,
		h
	);
}
function rect(
	ctx: CanvasRenderingContext2D,
	color: string,
	x: number,
	y: number,
	w: number,
	h: number
) {
	ctx.fillStyle = color;
	ctx.fillRect(x, y, w, h);
}
export function makeGround(map: MapId, s: GameState) {
	const { width, height } = MAPS[map],
		c = document.createElement("canvas");
	c.width = width * TILE;
	c.height = height * TILE;
	const g = c.getContext("2d")!;
	for (let y = 0; y < height; y++)
		for (let x = 0; x < width; x++) {
			const baseTerrain = terrain(map, x, y),
				t =
					baseTerrain === "water"
						? baseTerrain
						: (s.tiles[`${map}:${x}:${y}`] ?? baseTerrain),
				px = x * TILE,
				py = y * TILE,
				n = hash(x, y),
				waterUnderlay = map === "garden" && t === "water";
			const base =
				t === "grass" || waterUnderlay
					? PALETTE.grass[Math.floor(n * 3)]
					: t === "path"
						? PALETTE.path
						: t === "soil"
							? "#725337"
							: t === "water"
								? PALETTE.water
								: t === "floor"
									? "#8c674a"
									: t === "stone"
										? "#343d47"
										: map === "garden"
											? PALETTE.forest
											: "#222b32";
			rect(g, base, px, py, 32, 32);
			for (let i = 0; i < 18; i++) {
				const a = hash(x * 27 + i, y * 13 + i),
					b = hash(x * 9 + i, y * 33 - i),
					xx = px + Math.floor(a * 30),
					yy = py + Math.floor(b * 30);
				if (t === "grass" || waterUnderlay) {
					rect(
						g,
						i % 3 ? PALETTE.grassLight : PALETTE.grassShade,
						xx,
						yy,
						1 + (i % 3),
						1 + (i % 2)
					);
					if (i % 4 === 0) rect(g, PALETTE.grassTip, xx + 1, yy - 2, 1, 3);
				}
				if (t === "path")
					rect(
						g,
						i % 2 ? PALETTE.pathLight : PALETTE.pathShade,
						xx,
						yy,
						2 + (i % 3),
						1 + (i % 2)
					);
				if (t === "stone") rect(g, i % 2 ? "#3b4650" : "#303840", xx, yy, 4, 2);
			}
			if (t === "floor") {
				rect(g, "#6e4f3b", px, py + 31, 32, 1);
				rect(g, "#75523c", px + (y % 2 ? 16 : 0), py, 1, 32);
				rect(g, "#9c7551", px + 3, py + 3, 25, 1);
				rect(g, "#805c42", px + 5, py + 20, 20, 1);
			}
			if (t === "soil")
				for (let a = 5; a < 32; a += 8) {
					rect(g, "#4f3a2d", px + 2, py + a, 28, 2);
					rect(g, "#926748", px + 2, py + a + 2, 28, 1);
				}
			if (t === "stone") {
				rect(g, "#28333d", px, py + 31, 32, 1);
				rect(g, "#424c54", px + 2, py, 29, 1);
				rect(g, "#28333d", px + (y % 2 ? 16 : 0), py, 1, 32);
			}
			if (t === "wall" && map !== "garden") {
				rect(g, "#4e5156", px, py, 32, 27);
				rect(g, "#656366", px + 1, py + 1, 30, 2);
				rect(g, "#30363e", px, py + 27, 32, 5);
				rect(g, "#3d4148", px + 15, py, 2, 27);
			}
		}
	if (map === "garden") {
		paintGardenWaterGround(g, width, height);
		// Hand-laid stepping stones around the cottage and a tilled starter garden.
		for (let x = 8; x < 12; x++)
			for (let y = 16; y < 19; y++) {
				rect(g, "#715237", x * 32, y * 32, 32, 32);
				for (let i = 3; i < 32; i += 7) rect(g, "#4e3b2b", x * 32 + 2, y * 32 + i, 28, 2);
			}
		for (let y = 9; y < 12; y++) {
			rect(g, "#756f57", 14 * 32 + 3, y * 32 + 9, 25, 14);
			rect(g, "#b7b497", 14 * 32 + 4, y * 32 + 8, 23, 11);
		}
	}
	if (map === "home") {
		rect(g, "#413732", 32, 32, 576, 51);
		rect(g, "#675348", 36, 34, 568, 38);
		for (let x = 36; x < 600; x += 32) rect(g, "#806554", x, 36, 2, 35);
		// Woven rug, dining table, hearth and window are fixed interior architecture.
		rect(g, "#5d423d", 7 * 32, 7 * 32, 6 * 32, 4 * 32);
		rect(g, "#a65f48", 7 * 32 + 3, 7 * 32 + 3, 6 * 32 - 6, 4 * 32 - 6);
		rect(g, "#d5ad76", 7 * 32 + 8, 7 * 32 + 8, 6 * 32 - 16, 3);
		rect(g, "#d5ad76", 7 * 32 + 8, 11 * 32 - 11, 6 * 32 - 16, 3);
		for (let x = 7 * 32 + 16; x < 13 * 32 - 12; x += 16)
			rect(g, "#bf805a", x, 7 * 32 + 17, 4, 90);
	}
	return c;
}
export type View = {
	zoom: number;
	cameraX: number;
	cameraY: number;
	width: number;
	height: number;
};
export function viewFor(s: GameState, width: number, height: number, zoom = 1.2): View {
	const map = MAPS[s.map],
		ww = map.width * TILE,
		wh = map.height * TILE;
	const cameraX =
		ww < width / zoom
			? (ww - width / zoom) / 2
			: Math.max(0, Math.min(ww - width / zoom, s.x * TILE - width / zoom / 2));
	const cameraY =
		wh < height / zoom
			? (wh - height / zoom) / 2
			: Math.max(
					0,
					Math.min(
						wh - height / zoom,
						s.y * TILE - height / zoom / 2 - (s.map === "garden" ? 64 : 0)
					)
				);
	return { zoom, cameraX, cameraY, width, height };
}
export function renderWorld(
	ctx: CanvasRenderingContext2D,
	art: HTMLImageElement | HTMLCanvasElement,
	interior: HTMLImageElement,
	players: PlayerSheets,
	ground: HTMLCanvasElement,
	s: GameState,
	v: View,
	time: number,
	tool: Tool,
	hover: [number, number] | null,
	grid: boolean,
	lightingPreview: LightingPreview = "auto"
) {
	ctx.imageSmoothingEnabled = false;
	ctx.clearRect(0, 0, v.width, v.height);
	rect(ctx, s.map === "garden" ? "#102c37" : "#141e24", 0, 0, v.width, v.height);
	ctx.save();
	ctx.scale(v.zoom, v.zoom);
	ctx.translate(-Math.round(v.cameraX), -Math.round(v.cameraY));
	ctx.drawImage(ground, 0, 0);
	const { width, height } = MAPS[s.map];
	if (s.map === "garden") {
		// Little windblown petals remain independent from the still scenery.
		for (let i = 0; i < 18; i++) {
			const x = (i * 137 + time * 0.008) % (width * TILE),
				y = (i * 91 + time * 0.004) % (height * TILE);
			if (terrain("garden", Math.floor(x / TILE), Math.floor(y / TILE)) !== "water")
				rect(ctx, "#769eac", x, y, 2, 1);
		}
	}
	if (grid || tool !== "hand") {
		ctx.strokeStyle = s.map === "garden" ? "#96c7cb24" : "#dce6dd28";
		ctx.lineWidth = 0.5;
		for (let x = 0; x <= width; x++) {
			ctx.beginPath();
			ctx.moveTo(x * 32, 0);
			ctx.lineTo(x * 32, height * 32);
			ctx.stroke();
		}
		for (let y = 0; y <= height; y++) {
			ctx.beginPath();
			ctx.moveTo(0, y * 32);
			ctx.lineTo(width * 32, y * 32);
			ctx.stroke();
		}
	}

	for (const p of MAPS[s.map].portals) {
		ctx.globalAlpha = 0.45 + 0.2 * Math.sin(time / 500);
		ctx.strokeStyle = "#f2d78c";
		ctx.strokeRect(p.x * 32 + 5, p.y * 32 + 5, 22, 22);
		ctx.globalAlpha = 1;
	}
	const drawables: { y: number; draw: () => void }[] = [];
	const furnishing = (index: number, x: number, y: number, w: number, h: number) => {
		const cw = interior.naturalWidth / 2,
			ch = interior.naturalHeight / 2;
		ctx.drawImage(interior, (index % 2) * cw, Math.floor(index / 2) * ch, cw, ch, x, y, w, h);
	};
	if (s.map === "home") {
		drawables.push({
			y: 9 * 32,
			draw: () => furnishing(0, 11.6 * 32, 5.6 * 32, 3.8 * 32, 3.5 * 32)
		});
		drawables.push({
			y: 3 * 32,
			draw: () => furnishing(1, 8.8 * 32, 0.6 * 32, 3.5 * 32, 3 * 32)
		});
		drawables.push({
			y: 2 * 32,
			draw: () => furnishing(2, 4.5 * 32, 0.6 * 32, 2.8 * 32, 2.5 * 32)
		});
	}
	if (s.map === "garden")
		drawables.push({
			y: 5.6 * 32,
			draw: () => furnishing(3, 31.7 * 32, 2.1 * 32, 3.6 * 32, 3.8 * 32)
		});

	if (s.map === "garden")
		drawables.push({
			y: 9 * 32,
			draw: () => sprite(ctx, art, 1, 10.5 * 32, 1.8 * 32, 8 * 32, 7.5 * 32)
		});
	for (const o of s.objects[s.map])
		drawables.push({
			y: (o.y + 1) * 32,
			draw: () => {
				const cx = (o.x + 0.5) * 32,
					bottom = (o.y + 1) * 32;
				const size: Record<ObjectKind, [number, number]> = {
					tree: [76, 94],
					rock: [37, 36],
					chest: [33, 29],
					bed: [48, 60],
					lantern: [22, 40],
					fence: [34, 30],
					crop: [31, 29],
					crystal: [37, 42],
					mushroom: [28, 26],
					bush: [40, 34]
				};
				let [w, h] = size[o.kind];
				if (o.kind === "tree") {
					const shape = treeAppearance(o);
					w = shape.width;
					h = shape.height;
				}
				if (o.kind === "crop" && s.minutes - (o.planted ?? 0) < 90) {
					w = 18;
					h = 17;
				}
				ctx.fillStyle = "#182e2938";
				ctx.beginPath();
				ctx.ellipse(cx, bottom - 2, w * 0.34, 5, 0, 0, Math.PI * 2);
				ctx.fill();
				if (o.opened) ctx.globalAlpha = 0.55;
				sprite(ctx, art, SPRITES[o.kind], cx - w / 2, bottom - h, w, h);
				ctx.globalAlpha = 1;
			}
		});
	if (s.map === "dungeon")
		for (const e of s.enemies)
			if (e.hp > 0)
				drawables.push({
					y: (e.y + 0.4) * 32,
					draw: () => {
						const bob = Math.sin(time / 180 + e.id) * 2;
						sprite(ctx, art, 9, e.x * 32 - 19, e.y * 32 - 18 + bob, 38, 30 - bob);
						rect(ctx, "#1c1d28", e.x * 32 - 12, e.y * 32 - 22, 24, 3);
						rect(ctx, "#c184a6", e.x * 32 - 12, e.y * 32 - 22, e.hp * 8, 3);
					}
				});
	drawables.push({
		y: s.y * 32 + 6,
		draw: () => {
			if (s.hurt > 0 && Math.floor(time / 90) % 2 === 0) ctx.globalAlpha = 0.4;
			ctx.fillStyle = "#17292166";
			ctx.beginPath();
			ctx.ellipse(s.x * 32, s.y * 32 + 5, 11, 4, 0, 0, Math.PI * 2);
			ctx.fill();
			const pose = playerFrame(s),
				sheet = players[pose.action],
				sourceWidth = "naturalWidth" in sheet ? sheet.naturalWidth : sheet.width,
				sourceHeight = "naturalHeight" in sheet ? sheet.naturalHeight : sheet.height,
				compiled =
					pose.action === "walk" || pose.action === "idle" || pose.action === "run",
				cw = sourceWidth / ANIMATIONS[pose.action].frames,
				rowRect = ANIMATIONS[pose.action].rowRects?.[pose.row],
				sourceY = rowRect
					? (rowRect[0] * sourceHeight) / 1254
					: (pose.row * sourceHeight) / 4,
				ch = rowRect ? (rowRect[1] * sourceHeight) / 1254 : sourceHeight / 4,
				drawHeight = (64 * ch) / cw;
			ctx.save();
			ctx.translate(Math.round(s.x * 32), Math.round(s.y * 32));
			if (pose.mirror) ctx.scale(-1, 1);
			ctx.drawImage(
				sheet,
				pose.frame * cw,
				sourceY,
				cw,
				ch,
				-32,
				compiled ? Math.round(6 - (PLAYER_FOOT.y / PLAYER_CELL) * 64) : 6 - drawHeight,
				64,
				drawHeight
			);
			ctx.restore();
			ctx.globalAlpha = 1;
		}
	});
	drawables.sort((a, b) => a.y - b.y).forEach((d) => d.draw());
	for (const p of s.projectiles) {
		ctx.save();
		ctx.translate(p.x * 32, p.y * 32 - 12);
		ctx.rotate(Math.atan2(p.dy, p.dx));
		rect(ctx, "#c5a774", -10, -1, 20, 2);
		ctx.fillStyle = "#d3e6ef";
		ctx.beginPath();
		ctx.moveTo(12, 0);
		ctx.lineTo(5, -4);
		ctx.lineTo(5, 4);
		ctx.closePath();
		ctx.fill();
		rect(ctx, "#82a6c2", -10, -3, 4, 6);
		ctx.restore();
	}

	if (hover && tool !== "hand") {
		const [x, y] = hover;
		ctx.fillStyle = Math.hypot(s.x - x - 0.5, s.y - y - 0.5) <= 4.5 ? "#e4eebd55" : "#df745b66";
		ctx.fillRect(x * 32, y * 32, 32, 32);
		ctx.strokeStyle = "#f3e4ae";
		ctx.lineWidth = 1;
		ctx.strokeRect(x * 32 + 0.5, y * 32 + 0.5, 31, 31);
		if (["crop", "lantern", "tree", "fence"].includes(tool)) {
			ctx.globalAlpha = 0.55;
			sprite(ctx, art, SPRITES[tool as ObjectKind], x * 32, y * 32 - 8, 32, 40);
			ctx.globalAlpha = 1;
		}
	}
	const minutes = lightingMinutes(s.minutes, lightingPreview);
	const gardenNight = drawGardenNight(
		ctx,
		{ map: s.map, x: s.x, y: s.y, minutes },
		width * TILE,
		height * TILE
	);
	const hour = (minutes / 60) % 24;
	if (s.map === "dungeon" || hour >= 18 || hour < 6) {
		if (!gardenNight) {
			ctx.fillStyle = s.map === "dungeon" ? "#0b142d77" : "#14264488";
			ctx.fillRect(0, 0, width * TILE, height * TILE);
		}
		for (const o of s.objects[s.map])
			if (o.kind === "lantern" || o.kind === "crystal") {
				const x = (o.x + 0.5) * 32,
					y = o.y * 32,
					g = ctx.createRadialGradient(x, y, 1, x, y, 75);
				g.addColorStop(0, o.kind === "lantern" ? "#faba5344" : "#53d1c433");
				g.addColorStop(1, "#ffe2a000");
				ctx.fillStyle = g;
				ctx.fillRect(x - 75, y - 75, 150, 150);
			}
	}
	ctx.restore();
	const vignette = ctx.createRadialGradient(
		v.width / 2,
		v.height / 2,
		v.height * 0.25,
		v.width / 2,
		v.height / 2,
		v.width * 0.65
	);
	vignette.addColorStop(0, "#13251a00");
	vignette.addColorStop(1, gardenNight ? "rgba(4,11,23,0.12)" : "#101d2055");
	ctx.fillStyle = vignette;
	ctx.fillRect(0, 0, v.width, v.height);
}
