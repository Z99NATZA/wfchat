// Install Pixi's static shader/uniform implementations before renderer initialization.
// This supports nginx CSP without allowing dynamic code evaluation.
import "pixi.js/unsafe-eval";
import { Application, Container, Graphics, Sprite } from "pixi.js";
import { Art, COTTAGE_CHIMNEY } from "./art";
import { forestStyle } from "./composition";
import { GARDEN_ACCENTS, sceneryFits } from "./environment";
import { CharacterAnimation, facingFor, PlayerMotion } from "./character";
import { CharacterSprite } from "./CharacterSprite";
import { ART_DENSITY, hash, Landscape } from "./landscape";
import {
	act,
	cell,
	createWorld,
	DEFINITIONS,
	deserialize,
	grow,
	HEIGHT,
	index,
	objectsAt,
	SAVE_KEY,
	serialize,
	TOOLS,
	TILE_SIZE,
	validTarget,
	WIDTH,
	type Tool,
	type Terrain,
	type World
} from "./world";
export interface Snapshot {
	seeds: number;
	harvest: number;
	elapsed: number;
	tool: Tool;
	grid: boolean;
	paused: boolean;
	hint: string;
	message: string;
	hover: string;
}
export class Game {
	readonly app = new Application();
	readonly art = new Art();
	world: World = createWorld();
	tool: Tool = "hand";
	grid = false;
	paused = false;
	private root = new Container();
	private ground = new Container();
	private actors = new Container();
	private landscape = new Landscape();
	private scenery = new Container();
	private floatingScenery: { sprite: Sprite; y: number; phase: number }[] = [];
	private shadows = new Graphics();
	private effects = new Graphics();
	private overlay = new Graphics();
	private player = new CharacterSprite(this.art);
	private contactShadow = new Graphics();
	private motion = new PlayerMotion();
	private animation = new CharacterAnimation();
	private keys = new Set<string>();
	private hover: { x: number; y: number } | null = null;
	private zoom = 1;
	private camera = { x: (WIDTH * TILE_SIZE) / 2, y: (HEIGHT * TILE_SIZE) / 2 };
	private clock = 0;
	private published = -1;
	private saved = 0;
	private visualRevision = "";
	private message = "welcome";
	private initialized = false;
	private disposed = false;
	private observer: ResizeObserver | null = null;
	private emit: (snapshot: Snapshot) => void;
	constructor(
		private host: HTMLElement,
		emit: (snapshot: Snapshot) => void
	) {
		this.emit = emit;
	}
	async start() {
		try {
			const raw = localStorage.getItem(SAVE_KEY);
			if (raw) {
				const loaded = deserialize(raw);
				if (loaded) {
					this.world = loaded;
					this.message = "loaded";
				} else this.message = "invalidSave";
			}
		} catch {
			this.message = "saveError";
		}
		await this.art.load();
		if (this.disposed) {
			this.art.destroy();
			return;
		}
		await this.app.init({
			background: "#132e32",
			antialias: false,
			autoDensity: true,
			resolution: Math.min(window.devicePixelRatio || 1, 2),
			preference: "webgl",
			width: Math.max(1, this.host.clientWidth),
			height: Math.max(1, this.host.clientHeight)
		});
		this.initialized = true;
		if (this.disposed) {
			this.app.destroy(true, { children: true });
			this.art.destroy();
			return;
		}
		this.host.appendChild(this.app.canvas);
		this.app.canvas.setAttribute("aria-label", "Cozy Fantasy Farm");
		this.root.addChild(
			this.ground,
			this.scenery,
			this.shadows,
			this.actors,
			this.effects,
			this.overlay
		);
		this.actors.sortableChildren = true;
		this.app.stage.addChild(this.root);
		this.animation.pose.facing = facingFor(this.world.player.dx, this.world.player.dy);
		this.player.update(this.animation.pose, this.world.player.x, this.world.player.y);
		this.contactShadow.ellipse(0, -1, 4.5, 1.6).fill({ color: 0x102820, alpha: 0.27 });
		this.root.addChildAt(this.contactShadow, this.root.getChildIndex(this.actors));
		this.rebuild();
		this.host.addEventListener("keydown", this.keydown);
		this.host.addEventListener("keyup", this.keyup);
		this.host.addEventListener("pointermove", this.pointermove);
		this.host.addEventListener("pointerdown", this.pointerdown);
		this.host.addEventListener("wheel", this.wheel, { passive: false });
		this.host.addEventListener("focusout", this.blur);
		window.addEventListener("blur", this.blur);
		document.addEventListener("visibilitychange", this.visibility);
		window.addEventListener("pagehide", this.save);
		this.observer = new ResizeObserver(() => {
			this.app.renderer.resize(
				Math.max(1, this.host.clientWidth),
				Math.max(1, this.host.clientHeight)
			);
			this.updateCamera(1);
		});
		this.observer.observe(this.host);
		this.updateCamera(1);
		this.app.ticker.add(this.tick);
		this.publish();
	}
	private rebuild() {
		if (this.landscape.rebuild(this.world)) {
			for (const child of this.ground.removeChildren()) child.destroy();
			const ground = new Sprite(this.landscape.texture!);
			ground.scale.set(1 / ART_DENSITY);
			this.ground.addChild(ground);
		}
		this.actors.removeChild(this.player);
		for (const child of this.actors.removeChildren()) child.destroy();
		for (const child of this.scenery.removeChildren()) child.destroy();
		this.floatingScenery = [];
		this.shadows.clear();
		this.decorate();
		for (const object of this.world.objects) {
			const def = DEFINITIONS[object.kind],
				treeStyle = object.kind === "tree" ? forestStyle(object.x, object.y) : null,
				shoreRock =
					object.kind === "rock" &&
					[
						[1, 0],
						[-1, 0],
						[0, 1],
						[0, -1]
					].some(
						([dx, dy]) => cell(this.world, object.x + dx, object.y + dy) === "water"
					),
				sprite = new Sprite(
					shoreRock
						? this.art.shoreRock(Math.floor(hash(object.x, object.y) * 4))
						: this.art.object(object.kind, treeStyle?.variant ?? object.id)
				);
			sprite.scale.set(TILE_SIZE / (16 * ART_DENSITY));
			sprite.anchor.set(0.5, 1);
			sprite.position.set((object.x + def.w / 2) * TILE_SIZE, (object.y + def.h) * TILE_SIZE);
			if (treeStyle) {
				sprite.scale.set(sprite.scale.x * treeStyle.scale);
				sprite.x += treeStyle.offsetX;
				sprite.y += treeStyle.offsetY;
			}
			if (
				(object.kind === "tree" || object.kind === "rock" || object.kind === "flowers") &&
				object.id % 2
			)
				sprite.scale.x *= -1;
			if (object.kind === "tree") sprite.tint = [0xf2efda, 0xddebd7, 0xffffff][object.id % 3];
			sprite.zIndex = (object.y + def.h) * TILE_SIZE;
			if (object.kind === "lamp" && cell(this.world, object.x, object.y) === "water")
				this.decoration("rock", sprite.x, sprite.y + 2, false);
			if (
				shoreRock &&
				hash(object.x, object.y, 125) > 0.72 &&
				cell(this.world, object.x + 1, object.y) === "water"
			) {
				const submerged = this.decoration("rock", sprite.x + 15, sprite.y + 8, false);
				submerged.tint = 0x418f96;
				submerged.alpha = 0.37;
			}
			if (object.kind !== "dock" && object.kind !== "flowers") {
				this.shadows
					.ellipse(sprite.x, sprite.zIndex - 3, def.w * TILE_SIZE * 0.48, 4 + def.h)
					.fill({ color: 0x112d28, alpha: object.kind === "tree" ? 0.18 : 0.27 });
			}
			if (object.kind === "cottage" || object.kind === "shed") {
				this.shadows
					.ellipse(sprite.x - 3, sprite.zIndex - 2, def.w * TILE_SIZE * 0.43, 5)
					.fill({ color: 0x102820, alpha: 0.23 });
			}
			this.actors.addChild(sprite);
		}
		for (const [key, crop] of Object.entries(this.world.crops)) {
			const x = +key % WIDTH,
				y = Math.floor(+key / WIDTH),
				sprite = new Sprite(
					this.art.crop(crop.kind, Math.min(3, Math.floor(crop.growth * 3)))
				);
			sprite.scale.set(TILE_SIZE / (16 * ART_DENSITY));
			sprite.anchor.set(0.5, 1);
			sprite.position.set((x + 0.5) * TILE_SIZE, (y + 1) * TILE_SIZE);
			sprite.zIndex = sprite.y;
			if (crop.watered)
				this.shadows
					.ellipse(sprite.x, sprite.y - 3, 7, 4)
					.fill({ color: 0x1b2928, alpha: 0.28 });
			this.actors.addChild(sprite);
		}
		this.actors.addChild(this.player);
	}
	private decoration(name: string, x: number, y: number, depth = true) {
		const sprite = new Sprite(this.art.scenery(name));
		sprite.scale.set(TILE_SIZE / (16 * ART_DENSITY));
		sprite.anchor.set(0.5, 1);
		sprite.position.set(x, y);
		sprite.zIndex = y;
		(depth ? this.actors : this.scenery).addChild(sprite);
		return sprite;
	}
	private accent(
		name: string,
		x: number,
		y: number,
		terrain: Terrain | readonly Terrain[] = "grass",
		depth = true,
		clearance = 2
	) {
		const texture = this.art.scenery(name),
			width = texture.width / ART_DENSITY,
			height = texture.height / ART_DENSITY;
		if (!sceneryFits(this.world, x, y, width, height, terrain, clearance)) return;
		const sprite = this.decoration(name, x, y, depth);
		if (terrain === "grass")
			this.shadows
				.ellipse(x, y - 1, width * 0.38, Math.min(3, width * 0.1))
				.fill({ color: 0x17352b, alpha: 0.22 });
		return sprite;
	}
	private decorate() {
		// Clusters around the forest margin and lake, keeping the walking/farming area clear.
		for (let y = 2; y < HEIGHT - 1; y += 2)
			for (let x = 2; x < WIDTH - 1; x += 2) {
				const kind = cell(this.world, x, y),
					r = hash(x, y);
				if (kind === "water") {
					if (
						r > 0.65 &&
						hash(Math.floor(x / 4), Math.floor(y / 4), 13) > 0.45 &&
						(cell(this.world, x - 1, y) === "grass" ||
							cell(this.world, x, y - 1) === "grass")
					)
						this.decoration("reeds", x * TILE_SIZE, (y + 1) * TILE_SIZE);
				} else if (
					kind === "grass" &&
					!objectsAt(this.world, x, y).length &&
					!this.world.crops[index(x, y)]
				) {
					const edge =
						y < 6 ||
						x < 5 ||
						(x > 32 && y < 13) ||
						cell(this.world, x + 1, y) === "water" ||
						cell(this.world, x, y + 1) === "water";
					if (edge && r > 0.58 && hash(Math.floor(x / 5), Math.floor(y / 4), 22) > 0.3)
						this.decoration(
							r > 0.72 ? "shrub" : "flowers",
							(x + 0.5) * TILE_SIZE + (r - 0.5) * 9,
							(y + 1) * TILE_SIZE
						);
				}
			}
		// Authored pockets leave the central lake open. Saved terrain/placed objects
		// are checked so decoration never forces a change to the world model.
		for (const [cx, cy, count] of [
			[33, 19.3, 3],
			[29.6, 33.4, 4],
			[44.5, 27.5, 3],
			[40, 16.2, 2]
		]) {
			for (let i = 0; i < count; i++) {
				const x = cx + (hash(i, cx, 9) - 0.5) * 2.2,
					y = cy + (hash(i, cy, 54) - 0.5) * 1.4;
				// Reserve the full image and its gentle bob, including player-built docks.
				const sprite = this.accent(
					"lilies",
					x * TILE_SIZE,
					y * TILE_SIZE,
					"water",
					false,
					1
				);
				if (sprite)
					this.floatingScenery.push({
						sprite,
						y: sprite.y,
						phase: hash(i, cx, 82) * Math.PI * 2
					});
			}
		}

		this.decoration("waterfall", 44 * TILE_SIZE, 15 * TILE_SIZE);
		for (const prop of GARDEN_ACCENTS)
			this.accent(prop.name, prop.x * TILE_SIZE, prop.y * TILE_SIZE);
		// Small woodland accents stay inside clear grass, away from the garden lanes.
		for (let y = 5; y < HEIGHT - 2; y += 3)
			for (const x of [3, 30, 34, 38])
				if (hash(x, y, 51) > 0.6)
					this.accent("mushrooms", (x + 0.4) * TILE_SIZE, (y + 0.8) * TILE_SIZE);
		// Worn stepping stones connect the door to the main path without adding blockers.
		for (let i = 0; i < 6; i++) {
			const x = (16.7 + Math.sin(i * 2) * 0.35) * TILE_SIZE,
				y = (11.2 + i * 0.47) * TILE_SIZE;
			if (!sceneryFits(this.world, x, y + 2, 10, 5, ["grass", "path"], 0)) continue;
			this.shadows
				.ellipse(x, y + 1, 5, 2)
				.fill({ color: 0x364b37, alpha: 0.4 })
				.ellipse(x, y, 5, 2)
				.fill({ color: i % 2 ? 0x999d80 : 0xb7b49a, alpha: 0.8 })
				.rect(x - 3, y - 1, 4, 0.5)
				.fill({ color: 0xd1c9a7, alpha: 0.55 });
		}
	}
	private target() {
		if (
			this.hover &&
			Math.hypot(
				(this.hover.x + 0.5) * TILE_SIZE - this.world.player.x,
				(this.hover.y + 0.5) * TILE_SIZE - this.world.player.y
			) <=
				4 * TILE_SIZE
		)
			return this.hover;
		const p = this.world.player;
		return {
			x: Math.floor((p.x + p.dx * (TILE_SIZE + 1)) / TILE_SIZE),
			y: Math.floor((p.y + p.dy * (TILE_SIZE + 1)) / TILE_SIZE)
		};
	}
	private hint() {
		const { x, y } = this.target(),
			crop = this.world.crops[index(x, y)];
		if (crop) return crop.growth >= 1 ? "harvest" : crop.watered ? "growing" : "water";
		const obj = objectsAt(this.world, x, y)[0];
		return obj
			? obj.kind === "cottage"
				? "home"
				: obj.kind === "dock"
					? "lake"
					: "explore"
			: "use";
	}
	private publish() {
		this.emit({
			seeds: this.world.seeds,
			harvest: this.world.harvest,
			elapsed: this.world.elapsed,
			tool: this.tool,
			grid: this.grid,
			paused: this.paused,
			hint: this.hint(),
			message: this.message,
			hover: this.hover ? `${this.hover.x}, ${this.hover.y}` : ""
		});
	}
	select(tool: Tool) {
		this.tool = tool;
		this.publish();
	}
	toggleGrid() {
		this.grid = !this.grid;
		this.publish();
	}
	togglePause() {
		this.paused = !this.paused;
		this.keys.clear();
		this.motion.stop();
		this.save();
		this.publish();
	}
	setZoom(change: number) {
		this.zoom = Math.max(0.8, Math.min(3, this.zoom + change));
	}
	setDirection(key: string, down: boolean) {
		if (down) this.keys.add(key);
		else this.keys.delete(key);
	}
	interact() {
		if (this.paused) return;
		const { x, y } = this.target();
		this.message = act(this.world, this.tool, x, y);
		this.rebuild();
		this.save();
		this.publish();
	}
	private save = () => {
		if (this.disposed) return;
		try {
			localStorage.setItem(SAVE_KEY, serialize(this.world));
		} catch {
			this.message = "saveError";
			this.publish();
		}
	};
	private keydown = (e: KeyboardEvent) => {
		if ((e.target as HTMLElement).closest("button,input,select")) return;
		const key = e.key.toLowerCase();
		if (
			[
				"w",
				"a",
				"s",
				"d",
				"arrowup",
				"arrowdown",
				"arrowleft",
				"arrowright",
				"e",
				"g",
				"escape",
				"1",
				"2",
				"3",
				"4",
				"5",
				"6",
				"7",
				"8"
			].includes(key)
		)
			e.preventDefault();
		this.keys.add(key);
		if (e.repeat) return;
		if (key === "e") this.interact();
		if (key === "g") this.toggleGrid();
		if (key === "escape") this.togglePause();
		if (/^[1-8]$/.test(key)) this.select(TOOLS[+key - 1]);
	};
	private keyup = (e: KeyboardEvent) => {
		this.keys.delete(e.key.toLowerCase());
	};
	private blur = () => {
		this.keys.clear();
		this.motion.stop();
	};
	private visibility = () => {
		this.keys.clear();
		this.motion.stop();
		if (document.hidden) this.save();
	};
	private pointermove = (e: PointerEvent) => {
		const bounds = this.app.canvas.getBoundingClientRect();
		this.hover = {
			x: Math.floor((e.clientX - bounds.left - this.root.x) / this.root.scale.x / TILE_SIZE),
			y: Math.floor((e.clientY - bounds.top - this.root.y) / this.root.scale.y / TILE_SIZE)
		};
	};
	private pointerdown = (e: PointerEvent) => {
		if (e.target !== this.app.canvas) return;
		this.host.focus({ preventScroll: true });
		this.pointermove(e);
		if (!this.paused && this.hover) {
			this.message = act(this.world, this.tool, this.hover.x, this.hover.y);
			this.rebuild();
			this.save();
			this.publish();
		}
	};
	private wheel = (e: WheelEvent) => {
		if (e.target !== this.app.canvas) return;
		e.preventDefault();
		this.setZoom(e.deltaY > 0 ? -0.1 : 0.1);
	};
	private updateCamera(dt: number) {
		const width = this.app.screen.width,
			height = this.app.screen.height,
			scale =
				(width < 600
					? Math.max(width / (WIDTH * TILE_SIZE), height / (HEIGHT * TILE_SIZE))
					: Math.min(width / (WIDTH * TILE_SIZE), height / (HEIGHT * TILE_SIZE))) *
				this.zoom;
		this.root.scale.set(scale);
		const halfW = width / scale / 2,
			halfH = height / scale / 2;
		const clamp = (p: number, half: number, max: number) =>
			half * 2 >= max ? max / 2 : Math.max(half, Math.min(max - half, p));
		const ease = Math.min(1, dt * 6);
		this.camera.x +=
			(clamp(this.world.player.x, halfW, WIDTH * TILE_SIZE) - this.camera.x) * ease;
		this.camera.y +=
			(clamp(this.world.player.y, halfH, HEIGHT * TILE_SIZE) - this.camera.y) * ease;
		this.root.position.set(
			Math.round(width / 2 - this.camera.x * scale),
			Math.round(height / 2 - this.camera.y * scale)
		);
	}
	private tick = () => {
		const dt = Math.min(0.05, this.app.ticker.deltaMS / 1000);
		if (!this.paused && !document.hidden) {
			this.clock += dt;
			const dx =
					+(this.keys.has("d") || this.keys.has("arrowright")) -
					+(this.keys.has("a") || this.keys.has("arrowleft")),
				dy =
					+(this.keys.has("s") || this.keys.has("arrowdown")) -
					+(this.keys.has("w") || this.keys.has("arrowup"));
			const running = this.keys.has("shift");
			const travel = this.motion.update(this.world, dx, dy, running, dt);
			const pose = this.animation.update(dt, travel.dx, travel.dy, running, dx, dy);
			this.player.update(pose, this.world.player.x, this.world.player.y);
			grow(this.world, dt);
			const revision = Object.values(this.world.crops)
				.map((c) => Math.floor(c.growth * 3))
				.join("");
			if (revision !== this.visualRevision) {
				this.visualRevision = revision;
				this.rebuild();
			}
			if (this.world.elapsed - this.saved > 5) {
				this.saved = this.world.elapsed;
				this.save();
			}
		}
		this.player.position.set(this.world.player.x, this.world.player.y);
		this.player.zIndex = this.world.player.y;
		this.contactShadow.position.copyFrom(this.player.position);
		this.updateCamera(dt);
		this.drawEffects();
		this.drawOverlay();
		const second = Math.floor(this.clock * 4);
		if (second !== this.published) {
			this.published = second;
			this.publish();
		}
	};
	private drawEffects() {
		const g = this.effects;
		g.clear();
		const t = this.clock;
		for (const floating of this.floatingScenery)
			floating.sprite.y = floating.y + Math.sin(t * 0.7 + floating.phase) * 0.6;
		for (const building of this.world.objects)
			if (building.kind === "cottage" || building.kind === "shed") {
				const def = DEFINITIONS[building.kind],
					x = (building.x + def.w / 2) * TILE_SIZE,
					y = (building.y + def.h) * TILE_SIZE;
				g.ellipse(x, y + 2, 22, 7).fill({ color: 0xffcb72, alpha: 0.055 });
			}
		// Unevenly spaced short wavelets, with open stretches between them.
		for (let i = 0; i < 110; i++) {
			const x = hash(i, 37) * WIDTH * TILE_SIZE,
				y = hash(i, 91) * HEIGHT * TILE_SIZE;
			if (cell(this.world, Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE)) !== "water")
				continue;
			const phase = t * 0.45 + i * 1.7,
				pulse = Math.max(0, Math.sin(phase));
			const drift = Math.sin(t * 0.2 + i) * 2;
			g.moveTo(x + drift, y)
				.lineTo(x + 3 + drift, y - 0.5)
				.lineTo(x + 5 + drift, y)
				.stroke({ color: 0x9bd2cf, width: 0.5, alpha: 0.04 + pulse * 0.14 });
			if (i % 17 === 0) {
				const fx = x + Math.sin(t * 0.16 + i) * 9;
				g.ellipse(fx, y + 5, 4, 1.1).fill({ color: 0x082e43, alpha: 0.44 });
				g.moveTo(fx - 3, y + 5)
					.lineTo(fx - 6, y + 3.5)
					.lineTo(fx - 6, y + 6.5)
					.fill({ color: 0x082e43, alpha: 0.44 });
			}
			if (i % 23 === 0)
				g.ellipse(x + drift, y + 2, 1.2, 0.65).fill({ color: 0x819952, alpha: 0.55 });
		}
		// Ripples and broken reflections close to the dock/shore objects.
		for (const o of this.world.objects) {
			if (!((o.kind === "dock" && o.y % 3 === 0) || (o.kind === "rock" && o.id % 7 === 0)))
				continue;
			const x = (o.x + 1.5) * TILE_SIZE,
				y = (o.y + 1) * TILE_SIZE;
			if (cell(this.world, Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE)) !== "water")
				continue;
			const radius = 3 + ((t * 1.8 + o.id) % 9);
			g.ellipse(x, y, radius, radius * 0.24).stroke({
				color: 0x99cfc7,
				width: 0.5,
				alpha: 0.18 * (1 - radius / 14)
			});
			if (o.kind === "dock")
				g.rect(x - 3, y - 2, 7, 1).fill({ color: 0x9d7849, alpha: 0.15 });
		}

		// Animated foam follows the continuous shoreline field.
		for (let i = 0; i < this.landscape.shore.length; i += 4) {
			const p = this.landscape.shore[i],
				alpha = 0.07 + (Math.sin(t * 0.65 + i) + 1) * 0.08;
			g.moveTo(p.x, p.y)
				.lineTo(p.x + Math.cos(p.angle) * 3, p.y + Math.sin(p.angle) * 3)
				.stroke({ color: 0xc4eee1, width: 0.6, alpha });
		}
		// Highlights drift down the waterfall sprite; its stone/water artwork stays independent.
		for (let i = 0; i < 9; i++) {
			const x = 44 * TILE_SIZE - 9 + (i % 5) * 3,
				y = 12 * TILE_SIZE + ((t * 25 + i * 11) % 38);
			g.rect(x, y, 0.7, 3 + (i % 3)).fill({ color: 0xe9ffff, alpha: 0.32 });
		}
		for (let i = 0; i < 3; i++)
			g.ellipse(
				44 * TILE_SIZE,
				15 * TILE_SIZE - 7,
				8 + ((t * 4 + i * 7) % 20),
				2 + ((t + i) % 3)
			).stroke({ color: 0xc9f3e3, width: 0.6, alpha: 0.25 });

		for (const obj of this.world.objects)
			if (obj.kind === "lamp") {
				const x = obj.x * TILE_SIZE + 14,
					y = obj.y * TILE_SIZE - 8;
				g.circle(x, y, TILE_SIZE).fill({ color: 0xffc66b, alpha: 0.045 });
				g.circle(x, y, 9).fill({ color: 0xffc66b, alpha: 0.08 });
				for (let i = 0; i < 9; i++)
					if (cell(this.world, obj.x, Math.floor(obj.y + 1 + i * 0.3)) === "water")
						g.rect(
							x - 4 + Math.sin(t + i) * 2,
							(obj.y + 1 + i * 0.3) * TILE_SIZE,
							4 + (i % 3) * 2,
							0.7
						).fill({
							color: 0xffd27c,
							alpha: 0.28 - i * 0.024
						});
			}
		for (let i = 0; i < 10; i++) {
			const x = 170 + i * 39 + Math.sin(t * 0.3 + i) * 12,
				y = 120 + ((i * 57) % 270) + Math.cos(t * 0.5 + i) * 8;
			g.rect(x, y, 1, 1).fill({ color: 0xffe4a2, alpha: (Math.sin(t + i) + 1) * 0.35 });
		}
		for (const cottage of this.world.objects) {
			if (cottage.kind !== "cottage") continue;
			const def = DEFINITIONS.cottage,
				chimneyX = (cottage.x + def.w / 2) * TILE_SIZE + COTTAGE_CHIMNEY.x,
				chimneyY = (cottage.y + def.h) * TILE_SIZE + COTTAGE_CHIMNEY.y;
			// Staggered pixel wisps grow and fade as they rise from the actual chimney.
			for (let i = 0; i < 7; i++) {
				const age = (t * 0.095 + i / 7) % 1,
					x = Math.round(chimneyX + age * 10 + Math.sin(age * 5 + t * 0.3) * 2),
					y = Math.round(chimneyY - age * 30),
					size = 2 + Math.floor(age * 4),
					alpha = Math.sin(age * Math.PI) * 0.19;
				g.rect(x - size, y - 1, size * 2, size)
					.rect(x - size + 1, y - 2, size * 2 - 2, size + 2)
					.fill({ color: 0xcac6ae, alpha });
			}
		}
	}
	private drawOverlay() {
		const g = this.overlay;
		g.clear();
		if (this.grid) {
			for (let x = 0; x <= WIDTH; x++)
				g.moveTo(x * TILE_SIZE, 0).lineTo(x * TILE_SIZE, HEIGHT * TILE_SIZE);
			for (let y = 0; y <= HEIGHT; y++)
				g.moveTo(0, y * TILE_SIZE).lineTo(WIDTH * TILE_SIZE, y * TILE_SIZE);
			g.stroke({ color: 0xf7df9e, width: 0.5, alpha: 0.2 });
		}
		if (this.hover) {
			const { x, y } = this.hover;
			let w = 1,
				h = 1;
			if (this.tool === "tree") {
				w = 2;
				h = 2;
			}
			const valid = validTarget(this.world, this.tool, x, y);
			g.rect(x * TILE_SIZE, y * TILE_SIZE, w * TILE_SIZE, h * TILE_SIZE)
				.fill({ color: valid ? 0xb8dd96 : 0xe48b7e, alpha: 0.15 })
				.stroke({ color: valid ? 0xc8e9a1 : 0xee9c8f, width: 1, alpha: 0.8 });
		}
	}
	destroy() {
		if (this.disposed) return;
		this.save();
		this.disposed = true;
		this.observer?.disconnect();
		this.host.removeEventListener("keydown", this.keydown);
		this.host.removeEventListener("keyup", this.keyup);
		this.host.removeEventListener("pointermove", this.pointermove);
		this.host.removeEventListener("pointerdown", this.pointerdown);
		this.host.removeEventListener("wheel", this.wheel);
		this.host.removeEventListener("focusout", this.blur);
		window.removeEventListener("blur", this.blur);
		document.removeEventListener("visibilitychange", this.visibility);
		window.removeEventListener("pagehide", this.save);
		if (this.initialized) {
			this.app.ticker.remove(this.tick);
			this.app.destroy(true, { children: true });
			this.art.destroy();
		}
		this.landscape.destroy();
	}
}
