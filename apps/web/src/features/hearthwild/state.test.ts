import { describe, expect, it } from "vitest";
import {
	attack,
	blocked,
	deserialize,
	edit,
	interact,
	move,
	newGame,
	serialize,
	startSleep,
	tick
} from "./state";
import { findPath } from "./engine";

describe("Hearthwild survival and world", () => {
	it("allows ten real minutes awake, then a ten-second dark sleep advancing six hours exactly once", () => {
		const s = newGame();
		tick(s, 599);
		expect(s.sleep).toBe(0);
		expect(s.awake).toBe(1);
		tick(s, 1, () => 0.99);
		expect(s.sleep).toBe(10);
		expect(s.hp).toBe(100);
		const bedtime = s.minutes;
		tick(s, 9.9);
		expect(s.awake).toBe(0);
		expect(s.sleep).toBeCloseTo(0.1);
		tick(s, 0.1);
		expect(s.sleep).toBe(0);
		expect(s.minutes).toBe(bedtime + 360);
		expect(s.awake).toBe(600);
		tick(s, 1);
		expect(s.minutes).toBeCloseTo(bedtime + 361.2);
	});
	it("supports safe bed sleep and dangerous or lucky outdoor collapse", () => {
		const safe = newGame();
		safe.map = "home";
		safe.x = 6.5;
		safe.y = 6.5;
		safe.hp = 40;
		interact(safe);
		expect(safe.sleep).toBe(10);
		expect(safe.hp).toBe(40);
		tick(safe, 10);
		expect(safe.hp).toBe(85);
		const danger = newGame();
		danger.map = "dungeon";
		startSleep(danger, true, () => 0.5);
		expect(danger.hp).toBe(65);
		expect(danger.coins).toBe(18);
		const lucky = newGame();
		startSleep(lucky, true, () => 0.99);
		expect(lucky.hp).toBe(100);
		expect(lucky.message).toBe("luckySleep");
	});
	it("rescues a defeated player home and blocks all interaction while asleep", () => {
		const s = newGame();
		s.map = "dungeon";
		s.hp = 10;
		startSleep(s, true, () => 0);
		expect(s.map).toBe("home");
		expect(s.hp).toBe(60);
		expect(s.coins).toBe(9);
		const snapshot = serialize(s);
		move(s, 1, 0, 1);
		interact(s);
		attack(s);
		edit(s, "lantern", 8, 8);
		expect(serialize(s)).toBe(snapshot);
	});
	it("transitions through separate garden, home, and dungeon portals", () => {
		const s = newGame();
		s.x = 14.5;
		s.y = 10;
		interact(s);
		expect(s.map).toBe("home");
		expect(blocked(s, s.map, s.x, s.y)).toBe(false);
		s.x = 10.5;
		s.y = 13.5;
		interact(s);
		expect(s.map).toBe("garden");
		s.x = 32.5;
		s.y = 6;
		interact(s);
		expect(s.map).toBe("dungeon");
		expect(blocked(s, s.map, s.x, s.y)).toBe(false);
		s.x = 3.5;
		s.y = 18.5;
		interact(s);
		expect(s.map).toBe("garden");
	});
	it("conserves materials across placement, duplicate placement, and removal", () => {
		const s = newGame(),
			wood = s.wood;
		s.x = 15.5;
		s.y = 14.5;
		expect(edit(s, "lantern", 17, 14)).toBe(true);
		expect(s.wood).toBe(wood - 3);
		expect(edit(s, "lantern", 17, 14)).toBe(false);
		expect(s.wood).toBe(wood - 3);
		expect(edit(s, "remove", 17, 14)).toBe(true);
		expect(s.wood).toBe(wood);
		expect(edit(s, "remove", 17, 14)).toBe(false);
		expect(s.wood).toBe(wood);
	});
	it("protects portals and player tiles, validates soil, resources and interaction distance", () => {
		const s = newGame();
		s.x = 14.5;
		s.y = 10.5;
		expect(edit(s, "tree", 14, 10)).toBe(false);
		expect(edit(s, "fence", 14, 9)).toBe(false);
		expect(edit(s, "crop", 17, 12)).toBe(false);
		expect(edit(s, "soil", 17, 12)).toBe(true);
		const seeds = s.seeds;
		expect(edit(s, "crop", 17, 12)).toBe(true);
		expect(s.seeds).toBe(seeds - 1);
		expect(edit(s, "tree", 25, 15)).toBe(false);
		s.wood = 0;
		expect(edit(s, "lantern", 16, 13)).toBe(false);
	});
	it("rejects a solid object that seals off the player from map exits", () => {
		const s = newGame();
		s.x = 20.5;
		s.y = 13.5;
		for (const [x, y] of [
			[20, 12],
			[19, 13],
			[20, 14]
		])
			s.objects.garden.push({ id: `wall-${x}-${y}`, kind: "fence", x, y });
		const wood = s.wood;
		expect(edit(s, "fence", 21, 13)).toBe(false);
		expect(s.message).toBe("blockedRoute");
		expect(s.wood).toBe(wood);
	});
	it("grows a newly planted crop in 75 seconds, then grants harvest rewards once", () => {
		const s = newGame();
		s.x = 16.5;
		s.y = 14.5;
		edit(s, "soil", 17, 14);
		edit(s, "crop", 17, 14);
		interact(s);
		expect(s.message).toBe("growing");
		tick(s, 75);
		const before = s.food;
		interact(s);
		expect(s.food).toBe(before + 2);
		expect(s.harvested).toBe(1);
		interact(s);
		expect(s.food).toBe(before + 2);
	});
	it("limits sword reach and cooldown and awards a defeated slime once", () => {
		const s = newGame();
		s.map = "dungeon";
		s.x = 5.5;
		s.y = 5.5;
		s.enemies = [
			{ id: 0, x: 6, y: 5.5, hp: 1 },
			{ id: 1, x: 20, y: 15, hp: 3 }
		];
		const coins = s.coins;
		attack(s);
		attack(s);
		expect(s.enemies[0].hp).toBe(1);
		tick(s, 0.22);
		expect(s.enemies[0].hp).toBe(0);
		expect(s.enemies[1].hp).toBe(3);
		expect(s.coins).toBe(coins + 12);
	});
	it("saves world edits, depleted rewards and sleep progress and recovers corrupt saves", () => {
		const s = newGame();
		s.x = 15.5;
		s.y = 14.5;
		edit(s, "lantern", 17, 14);
		s.sleep = 4.3;
		s.objects.garden.find((o) => o.kind === "chest")!.opened = true;
		const restored = deserialize(serialize(s));
		expect(restored.sleep).toBe(4.3);
		expect(restored.wood).toBe(s.wood);
		expect(restored.objects.garden).toEqual(s.objects.garden);
		for (const raw of [
			"broken",
			"{}",
			JSON.stringify({ ...s, hp: "100" }),
			JSON.stringify({ ...s, enemies: [{ x: NaN }] })
		])
			expect(deserialize(raw)).toEqual(newGame());
	});
	it("removes obsolete dense-border trees from old saves without touching placed trees", () => {
		const s = newGame();
		s.objects.garden.push(
			{ id: "initial-legacy-dense-tree", kind: "tree", x: 2, y: 2 },
			{ id: "placed-player-tree", kind: "tree", x: 25, y: 15 }
		);
		const restored = deserialize(serialize(s));
		expect(restored.objects.garden.some((o) => o.id === "initial-legacy-dense-tree")).toBe(false);
		expect(restored.objects.garden.some((o) => o.id === "placed-player-tree")).toBe(true);
	});
	it("blocks solid indoor furniture for both walking and placement", () => {
		const s = newGame();
		s.map = "home";
		s.x = 11.5;
		s.y = 8.5;
		expect(blocked(s, "home", 12.5, 7.5)).toBe(true);
		expect(blocked(s, "home", 10.5, 2.5)).toBe(true);
		expect(edit(s, "lantern", 12, 7)).toBe(false);
	});
	it("finds traversable click-to-walk paths and refuses water or occupied targets", () => {
		const s = newGame();
		const path = findPath(s, 20.5, 12.5);
		expect(path.length).toBeGreaterThan(0);
		for (const [x, y] of path) expect(blocked(s, s.map, x, y)).toBe(false);
		expect(findPath(s, 27, 19)).toEqual([]);
		expect(findPath(s, 14, 7)).toEqual([]);
	});
});
