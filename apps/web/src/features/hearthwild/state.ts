import {
	initialObjects,
	isFixture,
	isSolid,
	MAPS,
	terrain,
	type MapId,
	type Tool,
	type WorldObject
} from "./world";
export const AWAKE_SECONDS = 600;
export const SLEEP_SECONDS = 10;
export const SAVE_KEY = "wfchat.hearthwild.v1";
export type Enemy = { id: number; x: number; y: number; hp: number };
export type GameState = {
	version: 1;
	map: MapId;
	x: number;
	y: number;
	direction: number;
	minutes: number;
	awake: number;
	sleep: number;
	hp: number;
	coins: number;
	wood: number;
	seeds: number;
	food: number;
	gems: number;
	harvested: number;
	objects: Record<MapId, WorldObject[]>;
	tiles: Partial<Record<string, "path" | "soil">>;
	enemies: Enemy[];
	hurt: number;
	attack: number;
	message: string;
	messageId: number;
	steps: number;
};
export function newGame(): GameState {
	return {
		version: 1,
		map: "garden",
		x: 14.5,
		y: 12.5,
		direction: 0,
		minutes: 360,
		awake: 600,
		sleep: 0,
		hp: 100,
		coins: 25,
		wood: 24,
		seeds: 12,
		food: 3,
		gems: 0,
		harvested: 0,
		objects: initialObjects(),
		tiles: {},
		enemies: spawnEnemies(),
		hurt: 0,
		attack: 0,
		message: "welcome",
		messageId: 1,
		steps: 0
	};
}
function spawnEnemies(): Enemy[] {
	return [
		[7, 15],
		[14, 8],
		[20, 17],
		[26, 7]
	].map(([x, y], id) => ({ id, x: x + 0.5, y: y + 0.5, hp: 3 }));
}
export function notice(s: GameState, key: string) {
	s.message = key;
	s.messageId++;
}
export function blocked(s: GameState, map: MapId, x: number, y: number): boolean {
	const tx = Math.floor(x),
		ty = Math.floor(y),
		t = terrain(map, tx, ty);
	return (
		t === "wall" ||
		t === "water" ||
		isFixture(map, tx, ty) ||
		s.objects[map].some((o) => o.x === tx && o.y === ty && isSolid(o.kind))
	);
}
export function move(s: GameState, dx: number, dy: number, dt: number) {
	const length = Math.hypot(dx, dy);
	if (!length || s.sleep > 0) return;
	const speed = (3.5 * dt) / length;
	const nx = s.x + dx * speed,
		ny = s.y + dy * speed;
	if (!blocked(s, s.map, nx + 0.18 * Math.sign(dx), s.y)) s.x = nx;
	if (!blocked(s, s.map, s.x, ny + 0.18 * Math.sign(dy))) s.y = ny;
	s.direction = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 2 : 3) : dy < 0 ? 1 : 0;
	s.steps += dt * 9;
}
export function startSleep(s: GameState, forced = false, random = Math.random) {
	if (s.sleep > 0) return;
	s.sleep = SLEEP_SECONDS;
	if (forced) {
		if (random() < (s.map === "dungeon" ? 0.85 : 0.45)) {
			s.hp -= 35;
			s.coins = Math.floor(s.coins * 0.75);
			notice(s, "unsafeSleep");
		} else notice(s, "luckySleep");
	} else notice(s, "sleeping");
	if (s.hp <= 0) recover(s);
}
function recover(s: GameState) {
	s.hp = 60;
	s.coins = Math.floor(s.coins * 0.5);
	s.sleep = 10;
	s.map = "home";
	s.x = 6.5;
	s.y = 6.5;
	notice(s, "rescued");
}
export function tick(s: GameState, dt: number, random = Math.random) {
	if (s.sleep > 0) {
		s.sleep = Math.max(0, s.sleep - dt);
		if (s.sleep === 0) {
			s.minutes += 360;
			s.awake = 600;
			s.hp = Math.min(100, s.hp + 45);
			s.enemies = spawnEnemies();
			notice(s, "rested");
		}
		return;
	}
	s.awake = Math.max(0, s.awake - dt);
	s.minutes += dt * 1.2;
	s.hurt = Math.max(0, s.hurt - dt);
	s.attack = Math.max(0, s.attack - dt);
	if (s.awake === 0) {
		startSleep(s, true, random);
		return;
	}
	if (s.awake <= 60 && s.awake + dt > 60) notice(s, "sleepWarning");
	if (s.map === "dungeon")
		for (const e of s.enemies) {
			if (e.hp <= 0) continue;
			const dx = s.x - e.x,
				dy = s.y - e.y,
				d = Math.hypot(dx, dy);
			if (d < 6 && d > 0.65) {
				const nx = e.x + (dx / d) * dt * 0.85,
					ny = e.y + (dy / d) * dt * 0.85;
				if (!blocked(s, "dungeon", nx, e.y)) e.x = nx;
				if (!blocked(s, "dungeon", e.x, ny)) e.y = ny;
			}
			if (d < 0.85 && s.hurt === 0) {
				s.hp -= 12;
				s.hurt = 1.4;
				notice(s, "hurt");
				if (s.hp <= 0) {
					recover(s);
					break;
				}
			}
		}
}
export function interact(s: GameState) {
	if (s.sleep > 0) return;
	const portal = MAPS[s.map].portals.find(
		(p) => Math.hypot(s.x - p.x - 0.5, s.y - p.y - 0.5) < 1.8
	);
	if (portal) {
		s.map = portal.to;
		[s.x, s.y] = portal.spawn.map((n) => n + 0.5) as [number, number];
		notice(s, `enter.${s.map}`);
		return;
	}
	const near = s.objects[s.map]
		.filter((o) => Math.hypot(s.x - o.x - 0.5, s.y - o.y - 0.5) < 2.1)
		.sort((a, b) => Math.hypot(s.x - a.x, s.y - a.y) - Math.hypot(s.x - b.x, s.y - b.y));
	const o = near[0];
	if (!o) {
		notice(s, "nothing");
		return;
	}
	if (o.kind === "bed") {
		startSleep(s);
		return;
	}
	if (o.kind === "chest") {
		if (o.opened) {
			notice(s, "emptyChest");
			return;
		}
		o.opened = true;
		s.coins += s.map === "dungeon" ? 75 : 20;
		s.wood += 8;
		s.seeds += 4;
		notice(s, "treasure");
		return;
	}
	if (o.kind === "crop") {
		if (s.minutes - (o.planted ?? 0) < 90) {
			notice(s, "growing");
			return;
		}
		s.food += 2;
		s.coins += 8;
		s.seeds += 2;
		s.harvested++;
		s.objects[s.map] = s.objects[s.map].filter((a) => a !== o);
		notice(s, "harvest");
		return;
	}
	if (["tree", "rock", "crystal", "mushroom"].includes(o.kind)) {
		s.objects[s.map] = s.objects[s.map].filter((a) => a !== o);
		if (o.kind === "tree") s.wood += 5;
		if (o.kind === "rock") s.coins += 4;
		if (o.kind === "crystal") {
			s.gems++;
			s.coins += 15;
		}
		if (o.kind === "mushroom") s.food++;
		notice(s, o.kind === "crystal" ? "gem" : "gather");
		return;
	}
	notice(s, "nothing");
}
export function attack(s: GameState) {
	if (s.sleep > 0 || s.attack > 0) return;
	s.attack = 0.35;
	for (const e of s.enemies)
		if (s.map === "dungeon" && e.hp > 0 && Math.hypot(e.x - s.x, e.y - s.y) < 2) {
			e.hp--;
			if (e.hp === 0) {
				s.coins += 12;
				notice(s, "slimeDefeated");
			}
		}
}
export function eat(s: GameState) {
	if (s.sleep > 0) return;
	if (s.food === 0) {
		notice(s, "noFood");
		return;
	}
	s.food--;
	s.hp = Math.min(100, s.hp + 25);
	notice(s, "ate");
}
const COST: Partial<Record<Tool, number>> = { path: 1, lantern: 3, fence: 2, tree: 4 };
export function edit(s: GameState, tool: Tool, x: number, y: number): boolean {
	if (s.sleep > 0 || tool === "hand") return false;
	x = Math.floor(x);
	y = Math.floor(y);
	if (Math.hypot(s.x - x - 0.5, s.y - y - 0.5) > 4.5) {
		notice(s, "tooFar");
		return false;
	}
	if (
		blockedTerrain(s.map, x, y) ||
		isFixture(s.map, x, y) ||
		MAPS[s.map].portals.some((p) => Math.hypot(p.x - x, p.y - y) < 2) ||
		(Math.floor(s.x) === x && Math.floor(s.y) === y)
	) {
		notice(s, "cantBuild");
		return false;
	}
	const objects = s.objects[s.map],
		existing = objects.find((o) => o.x === x && o.y === y),
		key = `${s.map}:${x}:${y}`;
	if (tool === "remove") {
		if (existing && ["bed", "chest", "crystal", "rock"].includes(existing.kind)) {
			notice(s, "protected");
			return false;
		}
		if (existing) {
			s.objects[s.map] = objects.filter((o) => o !== existing);
			s.wood += COST[existing.kind as Tool] ?? 0;
			if (existing.kind === "crop") s.seeds++;
		} else if (s.tiles[key]) {
			if (s.tiles[key] === "path") s.wood++;
			delete s.tiles[key];
		} else return false;
		notice(s, "removed");
		return true;
	}
	if (existing) {
		notice(s, "occupied");
		return false;
	}
	if (tool === "crop" && (s.map !== "garden" || s.tiles[key] !== "soil")) {
		notice(s, "needsSoil");
		return false;
	}
	if ((tool === "soil" || tool === "tree") && s.map !== "garden") {
		notice(s, "gardenOnly");
		return false;
	}
	if (
		(tool === "path" && s.tiles[key] === "path") ||
		(tool === "soil" && s.tiles[key] === "soil")
	)
		return false;
	const cost = COST[tool] ?? 0;
	if (s.wood < cost || (tool === "crop" && s.seeds < 1)) {
		notice(s, "noMaterials");
		return false;
	}
	if (tool === "path" || tool === "soil") {
		s.tiles[key] = tool;
	} else {
		const o: WorldObject = {
			id: `placed-${s.steps}-${s.minutes}-${x}-${y}`,
			kind: tool,
			x,
			y,
			...(tool === "crop" ? { planted: s.minutes } : {})
		};
		objects.push(o);
		if (isSolid(o.kind) && !portalsReachable(s)) {
			objects.pop();
			notice(s, "blockedRoute");
			return false;
		}
	}
	s.wood -= cost;
	if (tool === "crop") s.seeds--;
	notice(s, "placed");
	return true;
}
function blockedTerrain(map: MapId, x: number, y: number) {
	return ["wall", "water"].includes(terrain(map, x, y));
}
function portalsReachable(s: GameState) {
	const queue: [[number, number]] = [[Math.floor(s.x), Math.floor(s.y)]],
		seen = new Set<string>();
	for (let i = 0; i < queue.length; i++) {
		const [x, y] = queue[i],
			key = `${x},${y}`;
		if (seen.has(key) || blocked(s, s.map, x + 0.5, y + 0.5)) continue;
		seen.add(key);
		for (const [dx, dy] of [
			[0, 1],
			[0, -1],
			[1, 0],
			[-1, 0]
		])
			queue.push([x + dx, y + dy]);
	}
	return MAPS[s.map].portals.every((p) => seen.has(`${p.x},${p.y}`));
}
export function serialize(s: GameState) {
	return JSON.stringify(s);
}
export function deserialize(raw: string | null): GameState {
	if (!raw) return newGame();
	try {
		const s = JSON.parse(raw) as GameState;
		if (s.version !== 1 || !["garden", "home", "dungeon"].includes(s.map)) return newGame();
		const fresh = newGame();
		for (const key of [
			"x",
			"y",
			"direction",
			"minutes",
			"awake",
			"sleep",
			"hp",
			"coins",
			"wood",
			"seeds",
			"food",
			"gems",
			"harvested",
			"steps"
		] as const)
			if (typeof s[key] !== "number" || !Number.isFinite(s[key]) || s[key] < 0) return fresh;
		if (
			s.hp > 100 ||
			s.awake > 600 ||
			s.sleep > 10 ||
			s.direction > 3 ||
			s.x >= MAPS[s.map].width ||
			s.y >= MAPS[s.map].height ||
			!s.tiles ||
			typeof s.tiles !== "object"
		)
			return fresh;
		const kinds = [
			"tree",
			"rock",
			"chest",
			"bed",
			"lantern",
			"fence",
			"crop",
			"crystal",
			"mushroom",
			"bush"
		];
		for (const map of ["garden", "home", "dungeon"] as const) {
			if (!Array.isArray(s.objects?.[map]) || s.objects[map].length > 2000) return fresh;
			for (const o of s.objects[map])
				if (
					!o ||
					!kinds.includes(o.kind) ||
					typeof o.id !== "string" ||
					!Number.isInteger(o.x) ||
					!Number.isInteger(o.y) ||
					o.x < 1 ||
					o.y < 1 ||
					o.x >= MAPS[map].width - 1 ||
					o.y >= MAPS[map].height - 1 ||
					(o.planted !== undefined && !Number.isFinite(o.planted))
				)
					return fresh;
		}
		if (
			!Array.isArray(s.enemies) ||
			s.enemies.length > 30 ||
			s.enemies.some(
				(e) =>
					!e ||
					![e.x, e.y, e.hp, e.id].every(Number.isFinite) ||
					e.hp < 0 ||
					e.hp > 3 ||
					e.x < 1 ||
					e.y < 1 ||
					e.x >= 31 ||
					e.y >= 22
			)
		)
			return fresh;
		if (
			Object.entries(s.tiles).some(
				([k, v]) =>
					!/^(garden|home|dungeon):\d+:\d+$/.test(k) || (v !== "path" && v !== "soil")
			)
		)
			return fresh;
		s.attack = 0;
		s.hurt = 0;
		s.message = "welcomeBack";
		s.messageId = 1;
		return blocked(s, s.map, s.x, s.y) ? fresh : s;
	} catch {
		return newGame();
	}
}
