import {
	prepareIdle,
	prepareWalk,
	prepareRun,
	WALK_SOURCES,
	RUN_SOURCES,
	type PlayerSheets
} from "./playerSprites";
import { ANIMATIONS, RUN_SPEED, WALK_SPEED, type AnimationName, type Weapon } from "./animation";
import { woodlandMaterial } from "./appearance";
import {
	attack,
	blocked,
	deserialize,
	edit,
	eat,
	interact,
	notice,
	SAVE_KEY,
	serialize,
	tick,
	move,
	equip,
	setMotion,
	type GameState
} from "./state";
import { INTERIOR_URL, ART_URL, makeGround, renderWorld, viewFor, type View } from "./render";
import { MAPS, TILE, type Tool } from "./world";
export type GameOptions = { tool: Tool; grid: boolean; paused: boolean; zoom: number };
export function findPath(s: GameState, x: number, y: number): [number, number][] {
	const start: [number, number] = [Math.floor(s.x), Math.floor(s.y)],
		goal = [Math.floor(x), Math.floor(y)];
	if (blocked(s, s.map, goal[0] + 0.5, goal[1] + 0.5)) return [];
	const q = [start],
		parents = new Map<string, [number, number] | null>([[start.join(), null]]);
	for (let i = 0; i < q.length; i++) {
		const p = q[i];
		if (p[0] === goal[0] && p[1] === goal[1]) {
			const path: [number, number][] = [];
			let current: [number, number] | null = p;
			while (current) {
				path.unshift([current[0] + 0.5, current[1] + 0.5]);
				current = parents.get(current.join()) ?? null;
			}
			return path.slice(1);
		}
		for (const [dx, dy] of [
			[0, 1],
			[1, 0],
			[0, -1],
			[-1, 0]
		]) {
			const n: [number, number] = [p[0] + dx, p[1] + dy];
			if (!parents.has(n.join()) && !blocked(s, s.map, n[0] + 0.5, n[1] + 0.5)) {
				parents.set(n.join(), p);
				q.push(n);
			}
		}
	}
	return [];
}
// Consume reached waypoints in the same frame so route corners do not restart gait.
export function followPath(s: GameState, path: [number, number][], dt: number, running = false) {
	while (path.length && Math.hypot(path[0][0] - s.x, path[0][1] - s.y) < 0.01)
		[s.x, s.y] = path.shift()!;
	if (!path.length) return false;
	const [x, y] = path[0],
		dist = Math.hypot(x - s.x, y - s.y);
	return move(
		s,
		(x - s.x) / dist,
		(y - s.y) / dist,
		Math.min(dt, dist / (running ? RUN_SPEED : WALK_SPEED)),
		running
	);
}
export class HearthwildEngine {
	state: GameState;
	options: GameOptions = { tool: "hand", grid: false, paused: false, zoom: 1.2 };
	private keys = new Set<string>();
	private path: [number, number][] = [];
	private hover: [number, number] | null = null;
	private ground: HTMLCanvasElement | null = null;
	private groundMap = "";
	private groundDirty = true;
	private view: View | null = null;
	private art = new Image();
	private interior = new Image();
	private playerImages = Object.fromEntries(
		Object.keys(ANIMATIONS).map((key) => [key, new Image()])
	) as Record<AnimationName, HTMLImageElement>;
	private players: PlayerSheets | null = null;
	private walkExtras = { back: new Image(), side: new Image() };
	private runExtras = { back: new Image(), side: new Image() };
	private woodland: HTMLCanvasElement | null = null;
	private frame = 0;
	private last = 0;
	private lastUi = 0;
	private lastSave = 0;
	private disposed = false;
	private ready = false;
	private resize: ResizeObserver;
	private width = 0;
	private height = 0;
	constructor(
		private canvas: HTMLCanvasElement,
		private root: HTMLElement,
		private update: (s: GameState, saved: boolean) => void,
		private loaded: (error: boolean) => void
	) {
		let raw: string | null = null;
		try {
			raw = localStorage.getItem(SAVE_KEY);
		} catch {
			/* Playable without browser storage. */
		}
		this.state = deserialize(raw);
		this.resize = new ResizeObserver(() => this.measure());
		this.resize.observe(canvas);
		this.measure();
		root.addEventListener("keydown", this.keyDown);
		root.addEventListener("keyup", this.keyUp);
		window.addEventListener("blur", this.clearKeys);
		document.addEventListener("visibilitychange", this.visibility);
		canvas.addEventListener("pointerdown", this.pointerDown);
		canvas.addEventListener("pointermove", this.pointerMove);
		canvas.addEventListener("pointerleave", this.pointerLeave);
		window.addEventListener("pagehide", this.saveOnExit);
		const images = [
			this.art,
			this.interior,
			...Object.values(this.playerImages),
			...Object.values(this.walkExtras),
			...Object.values(this.runExtras)
		];
		const start = () => {
			if (
				this.disposed ||
				this.ready ||
				images.some((img) => !img.complete || !img.naturalWidth)
			)
				return;
			try {
				this.woodland = woodlandMaterial(this.art);
				this.players = {
					...this.playerImages,
					idle: prepareIdle(this.playerImages.idle),
					walk: prepareWalk({ front: this.playerImages.walk, ...this.walkExtras }),
					run: prepareRun({ front: this.playerImages.run, ...this.runExtras })
				};
			} catch {
				this.loaded(true);
				return;
			}
			this.ready = true;
			this.loaded(false);
			if (document.activeElement === document.body) this.root.focus({ preventScroll: true });
			this.frame = requestAnimationFrame(this.loop);
		};
		for (const image of images) {
			image.onload = start;
			image.onerror = () => {
				if (!this.disposed) this.loaded(true);
			};
		}
		this.art.src = ART_URL;
		this.interior.src = INTERIOR_URL;
		for (const [key, image] of Object.entries(this.playerImages))
			image.src = ANIMATIONS[key as AnimationName].url;
		this.walkExtras.back.src = WALK_SOURCES.back;
		this.walkExtras.side.src = WALK_SOURCES.side;
		this.runExtras.back.src = RUN_SOURCES.back;
		this.runExtras.side.src = RUN_SOURCES.side;

		this.update({ ...this.state }, true);
	}
	private measure = () => {
		const r = this.canvas.getBoundingClientRect();
		this.width = Math.max(1, r.width);
		this.height = Math.max(1, r.height);
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		this.canvas.width = Math.round(this.width * dpr);
		this.canvas.height = Math.round(this.height * dpr);
	};
	private loop = (now: number) => {
		if (this.disposed) return;
		const dt = this.last ? Math.max(0, Math.min(0.05, (now - this.last) / 1000)) : 0;
		this.last = now;
		if (!this.options.paused && !document.hidden) {
			const s = this.state,
				oldMap = s.map;
			const dx =
				Number(this.keys.has("d") || this.keys.has("arrowright")) -
				Number(this.keys.has("a") || this.keys.has("arrowleft"));
			const dy =
				Number(this.keys.has("s") || this.keys.has("arrowdown")) -
				Number(this.keys.has("w") || this.keys.has("arrowup"));
			let moved = false;
			const running = this.keys.has("shift");
			if (dx || dy) {
				this.path = [];
				moved = move(s, dx, dy, dt, running);
			} else if (this.path.length) {
				moved = followPath(s, this.path, dt, running);
			}
			if (!moved) setMotion(s, "idle");
			tick(s, dt);
			if (s.map !== oldMap || s.sleep > 0) this.path = [];
		}
		if (this.ready) {
			if (this.groundDirty || this.groundMap !== this.state.map) {
				this.ground = makeGround(this.state.map, this.state);
				this.groundMap = this.state.map;
				this.groundDirty = false;
			}
			this.view = viewFor(this.state, this.width, this.height, this.options.zoom);
			const ctx = this.canvas.getContext("2d")!;
			ctx.setTransform(
				this.canvas.width / this.width,
				0,
				0,
				this.canvas.height / this.height,
				0,
				0
			);
			renderWorld(
				ctx,
				this.state.map === "home" ? this.art : this.woodland!,
				this.interior,
				this.players!,
				this.ground!,
				this.state,
				this.view,
				now,
				this.options.tool,
				this.hover,
				this.options.grid
			);
		}
		if (now - this.lastUi > 160) {
			this.update({ ...this.state }, this.storageOk);
			this.lastUi = now;
		}
		if (now - this.lastSave > 5000) {
			this.save();
			this.lastSave = now;
		}
		this.frame = requestAnimationFrame(this.loop);
	};
	private storageOk = true;
	save = () => {
		try {
			localStorage.setItem(SAVE_KEY, serialize(this.state));
			this.storageOk = true;
		} catch {
			this.storageOk = false;
		}
	};
	private saveOnExit = () => this.save();
	private clearKeys = () => {
		setMotion(this.state, "idle");
		this.keys.clear();
		this.path = [];
	};
	private visibility = () => {
		this.clearKeys();
		this.last = 0;
		this.save();
	};
	private keyDown = (e: KeyboardEvent) => {
		if (
			e.target instanceof HTMLElement &&
			(e.target.matches("input,textarea,select") || e.target.closest('[role="dialog"]'))
		)
			return;
		const key = e.key.toLowerCase();
		if (
			![
				"w",
				"a",
				"s",
				"d",
				"arrowup",
				"arrowdown",
				"arrowleft",
				"arrowright",
				"e",
				"f",
				"shift",
				"q",
				" "
			].includes(key)
		)
			return;
		e.preventDefault();
		if (this.options.paused) return;
		this.keys.add(key);
		if (e.shiftKey) this.keys.add("shift");
		if (!e.repeat) {
			if (key === "q") this.selectWeapon(this.state.weapon === "sword" ? "bow" : "sword");
			if (key === "e") this.action("interact");
			if (key === "f") this.action("eat");
			if (key === " ") this.action("attack");
		}
	};
	private keyUp = (e: KeyboardEvent) => {
		this.keys.delete(e.key.toLowerCase());
	};
	private pointerTile = (e: PointerEvent): [number, number] => {
		const r = this.canvas.getBoundingClientRect(),
			v = this.view!;
		return [
			Math.floor(((e.clientX - r.left) / v.zoom + v.cameraX) / TILE),
			Math.floor(((e.clientY - r.top) / v.zoom + v.cameraY) / TILE)
		];
	};
	private pointerMove = (e: PointerEvent) => {
		if (this.view) this.hover = this.pointerTile(e);
	};
	private pointerLeave = () => {
		this.hover = null;
	};
	private pointerDown = (e: PointerEvent) => {
		this.root.focus({ preventScroll: true });
		if (e.shiftKey) this.keys.add("shift");
		if (!this.view || this.options.paused || this.state.sleep > 0) return;
		const [x, y] = this.pointerTile(e);
		if (this.options.tool !== "hand") {
			if (edit(this.state, this.options.tool, x, y)) this.groundDirty = true;
			this.save();
		} else {
			this.path = findPath(this.state, x, y);
			if (!this.path.length) notice(this.state, "noPath");
		}
	};
	action = (kind: "interact" | "attack" | "eat") => {
		if (this.options.paused) return;
		this.path = [];
		if (kind === "interact") interact(this.state);
		else if (kind === "attack") attack(this.state);
		else eat(this.state);
		this.groundDirty = true;
		this.save();
		this.update({ ...this.state }, this.storageOk);
	};
	selectWeapon = (weapon: Weapon) => {
		if (this.options.paused) return;
		equip(this.state, weapon);
		this.save();
		this.update({ ...this.state }, this.storageOk);
	};
	direction = (key: string, down: boolean) => {
		if (down) this.keys.add(key);
		else this.keys.delete(key);
	};
	configure = (options: GameOptions) => {
		if (options.paused || options.tool !== this.options.tool) this.clearKeys();
		this.options = options;
	};
	destroy = () => {
		this.disposed = true;
		this.save();
		cancelAnimationFrame(this.frame);
		this.resize.disconnect();
		this.art.onload = null;
		this.art.onerror = null;
		this.interior.onload = null;
		this.interior.onerror = null;
		for (const image of [
			...Object.values(this.playerImages),
			...Object.values(this.walkExtras),
			...Object.values(this.runExtras)
		]) {
			image.onload = null;
			image.onerror = null;
		}
		this.root.removeEventListener("keydown", this.keyDown);
		this.root.removeEventListener("keyup", this.keyUp);
		window.removeEventListener("blur", this.clearKeys);
		document.removeEventListener("visibilitychange", this.visibility);
		window.removeEventListener("pagehide", this.saveOnExit);
		this.canvas.removeEventListener("pointerdown", this.pointerDown);
		this.canvas.removeEventListener("pointermove", this.pointerMove);
		this.canvas.removeEventListener("pointerleave", this.pointerLeave);
	};
}
export function nearestHint(s: GameState) {
	if (MAPS[s.map].portals.some((p) => Math.hypot(s.x - p.x - 0.5, s.y - p.y - 0.5) < 1.8))
		return s.map === "home" ? "exit" : s.map === "dungeon" ? "exit" : "enter";
	const o = s.objects[s.map]
		.filter((o) => Math.hypot(s.x - o.x - 0.5, s.y - o.y - 0.5) < 2.1)
		.sort((a, b) => Math.hypot(s.x - a.x, s.y - a.y) - Math.hypot(s.x - b.x, s.y - b.y))[0];
	return o?.kind ?? "interact";
}
