import { findPath, followPath } from "./engine";
import { describe, it, expect } from "vitest";
import { ANIMATIONS, ATTACK_DURATION, playerFrame } from "./animation";
import {
	newGame,
	move,
	tick,
	attack,
	equip,
	deserialize,
	serialize,
	startSleep,
	interact,
	setMotion
} from "./state";

describe("Aiko animation, sprint and weapons", () => {
	it("cycles distinct idle, walking and running frames, preserving direction", () => {
		const s = newGame();
		for (const action of ["idle", "walk", "run"] as const) {
			s.motion = action;
			s.direction = 2;
			const expected =
				ANIMATIONS[action].sequence ??
				Array.from({ length: ANIMATIONS[action].frames }, (_, i) => i);
			const frames = expected.map((_, index) => {
				s.animationTime = (index + 0.1) / ANIMATIONS[action].fps;
				return playerFrame(s).frame;
			});
			expect(frames).toEqual(expected);
			expect(playerFrame(s).action).toBe(action);
			expect(playerFrame(s).row).toBe(ANIMATIONS[action].rows[2]);
			s.animationTime = ANIMATIONS[action].frames / ANIMATIONS[action].fps;
			expect(playerFrame(s).frame).toBe(0);
		}
	});
	it("keeps idle eyes open apart from a short blink and preserves walk/run stride phase", () => {
		const s = newGame();
		s.animationTime = 4.7;
		expect(playerFrame(s).frame).toBe(2);
		s.animationTime = 4.9;
		expect(playerFrame(s).frame).not.toBe(2);
		s.motion = "walk";
		s.animationTime = 0.31;
		const phase = (s.animationTime * ANIMATIONS.walk.fps) / ANIMATIONS.walk.frames;
		setMotion(s, "run");
		expect((s.animationTime * ANIMATIONS.run.fps) / ANIMATIONS.run.frames).toBeCloseTo(phase);
	});

	it("keeps a continuous stride across click-to-walk grid waypoints", () => {
		const s = newGame(),
			path = findPath(s, 18.5, 12.5);
		let previous = 0;
		for (let i = 0; i < 60; i++) {
			const moved = followPath(s, path, 1 / 60);
			if (!moved) setMotion(s, "idle");
			tick(s, 1 / 60);
			expect(s.motion).toBe("walk");
			expect(s.animationTime).toBeGreaterThan(previous);
			previous = s.animationTime;
		}
		for (let i = 0; i < 40; i++) {
			if (!followPath(s, path, 1 / 60)) setMotion(s, "idle");
			tick(s, 1 / 60);
		}
		expect(s.x).toBeCloseTo(18.5);
		expect(s.motion).toBe("idle");
	});
	it("advances walking frames by actual distance and does not advance them twice in tick", () => {
		const s = newGame();
		s.x = 14.5;
		s.y = 9.5;
		move(s, 0, -1, 0.4);
		expect(s.animationTime).toBeCloseTo((9.5 - s.y) / 3.5);
		expect(s.animationTime).toBeLessThan(0.4);
		const phase = s.animationTime;
		tick(s, 0.4);
		expect(s.animationTime).toBe(phase);
	});
	it("runs faster than walking, normalizes diagonals, and cannot pass through walls", () => {
		const walk = newGame(),
			run = newGame(),
			diagonal = newGame();
		move(walk, 1, 0, 0.4);
		move(run, 1, 0, 0.4, true);
		move(diagonal, 1, 1, 0.4, true);
		expect(run.x - 14.5).toBeCloseTo(2.32);
		expect(walk.x - 14.5).toBeCloseTo(1.4);
		expect(Math.hypot(diagonal.x - 14.5, diagonal.y - 12.5)).toBeCloseTo(2.32);
		expect(run.motion).toBe("run");
		expect(walk.motion).toBe("walk");
		run.map = "home";
		run.x = 11.5;
		run.y = 7.5;
		move(run, 1, 0, 1, true);
		expect(run.x).toBeLessThan(11.85);
	});
	it("locks facing and movement during an attack and resumes idle after the final frame", () => {
		const s = newGame();
		s.direction = 3;
		equip(s, "bow");
		attack(s);
		move(s, 0, -1, 0.1, true);
		equip(s, "sword");
		expect(s.direction).toBe(3);
		expect(s.weapon).toBe("bow");
		expect(s.y).toBe(12.5);
		s.attack = 0.01;
		expect(playerFrame(s)).toMatchObject({ action: "bow", frame: 3, row: 3 });
		tick(s, 0.02);
		expect(playerFrame(s).action).toBe("idle");
	});
	it("releases arrows after the draw frame and hits only the first enemy in their path", () => {
		const s = newGame();
		s.map = "dungeon";
		s.x = 12.5;
		s.y = 16.5;
		s.direction = 3;
		s.enemies = [
			{ id: 0, x: 16, y: 16.5, hp: 1 },
			{ id: 1, x: 18, y: 16.5, hp: 3 }
		];
		equip(s, "bow");
		attack(s);
		tick(s, 0.2);
		expect(s.projectiles).toHaveLength(0);
		expect(s.enemies[0].hp).toBe(1);
		for (let i = 0; i < 12; i++) tick(s, 0.04);
		expect(s.enemies[0].hp).toBe(0);
		expect(s.enemies[1].hp).toBe(3);
		expect(s.coins).toBe(37);
		expect(s.projectiles).toHaveLength(0);
	});
	it("stops arrows at solid geometry and limits their range", () => {
		const s = newGame();
		s.map = "dungeon";
		s.x = 8.5;
		s.y = 6.5;
		s.direction = 3;
		s.enemies = [{ id: 0, x: 12, y: 6.5, hp: 3 }];
		equip(s, "bow");
		attack(s);
		for (let i = 0; i < 20; i++) tick(s, 0.05);
		expect(s.enemies[0].hp).toBe(3);
		expect(s.projectiles).toHaveLength(0);
		const open = newGame();
		open.x = 18.5;
		open.y = 12.5;
		open.direction = 3;
		equip(open, "bow");
		attack(open);
		for (let i = 0; i < 30; i++) tick(open, 0.05);
		expect(open.projectiles).toHaveLength(0);
	});
	it("does not hit enemies behind a sword swing and does not repeat hits during cooldown", () => {
		const s = newGame();
		s.map = "dungeon";
		s.x = 15.5;
		s.y = 15.5;
		s.direction = 3;
		s.enemies = [
			{ id: 0, x: 16.5, y: 15.5, hp: 3 },
			{ id: 1, x: 14.5, y: 15.5, hp: 3 }
		];
		attack(s);
		tick(s, 0.22);
		expect(s.enemies.map((e) => e.hp)).toEqual([2, 3]);
		attack(s);
		tick(s, 0.1);
		expect(s.enemies[0].hp).toBe(2);
		expect(playerFrame(s).frame).toBeLessThan(4);
		expect(ATTACK_DURATION.sword).toBe(0.4);
	});
	it("keeps old saves, saves weapon choice, and clears transient attacks on sleep or travel", () => {
		const legacy = JSON.parse(serialize(newGame()));
		delete legacy.weapon;
		delete legacy.motion;
		delete legacy.animationTime;
		delete legacy.projectiles;
		delete legacy.attackDirection;
		expect(deserialize(JSON.stringify(legacy)).weapon).toBe("sword");
		const s = newGame();
		equip(s, "bow");
		expect(deserialize(serialize(s)).weapon).toBe("bow");
		attack(s);
		startSleep(s);
		expect(s.attack).toBe(0);
		expect(s.motion).toBe("idle");
		expect(s.projectiles).toEqual([]);
		s.sleep = 0;
		s.x = 14.5;
		s.y = 10;
		s.projectiles = [{ x: 14, y: 12, dx: 0, dy: 1, remaining: 4 }];
		interact(s);
		expect(s.map).toBe("home");
		expect(s.projectiles).toEqual([]);
	});
});
