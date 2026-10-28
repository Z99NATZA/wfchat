import { describe, expect, it } from "vitest";
import {
	CharacterAnimation,
	CHARACTER_SHEETS,
	FRAME_COUNTS,
	FACINGS,
	PlayerMotion,
	STRIDE,
	WALK_SPEED
} from "./character";
import { canStand, createWorld, index } from "./world";
import { readFileSync } from "node:fs";

function openWorld() {
	const world = createWorld();
	world.terrain.fill("grass");
	world.objects = [];
	world.player = { x: 168, y: 168, dx: 0, dy: 1 };
	return world;
}

describe("heroine movement and animation", () => {
	it("loads the seven original Aiko PNG source sheets", () => {
		const names = [
			CHARACTER_SHEETS.idle,
			...Object.values(CHARACTER_SHEETS.walk),
			...Object.values(CHARACTER_SHEETS.run)
		];
		expect(names).toHaveLength(7);
		for (const name of names) {
			const png = readFileSync(
				new URL(`../../../public/images/cozy-farm/${name}`, import.meta.url)
			);
			expect(png.subarray(1, 4).toString()).toBe("PNG");
			expect(png.readUInt32BE(16)).toBeGreaterThan(0);
			expect(png.readUInt32BE(20)).toBeGreaterThan(0);
		}
	});
	it("normalizes diagonals and integrates acceleration independently of frame rate", () => {
		const simulate = (hz: number, dx: number, dy: number) => {
			const world = openWorld(),
				motion = new PlayerMotion();
			for (let i = 0; i < hz; i++) motion.update(world, dx, dy, false, 1 / hz);
			return Math.hypot(world.player.x - 168, world.player.y - 168);
		};
		expect(simulate(30, 1, 0)).toBeCloseTo(simulate(120, 1, 0), 5);
		expect(simulate(60, 1, 1)).toBeCloseTo(simulate(60, 1, 0), 5);
	});
	it("runs faster, stops promptly and cannot tunnel through water or objects", () => {
		const walk = openWorld(),
			run = openWorld();
		const a = new PlayerMotion(),
			b = new PlayerMotion();
		for (let i = 0; i < 30; i++) {
			a.update(walk, 1, 0, false, 1 / 60);
			b.update(run, 1, 0, true, 1 / 60);
		}
		expect(run.player.x - 168).toBeGreaterThan((walk.player.x - 168) * 1.5);
		const stop = run.player.x;
		for (let i = 0; i < 30; i++) b.update(run, 0, 0, false, 1 / 60);
		expect(run.player.x - stop).toBeLessThan(4);
		expect(b.vx).toBe(0);
		const wall = openWorld();
		wall.terrain[index(11, 10)] = "water";
		b.update(wall, 1, 0, true, 1);
		expect(wall.player.x).toBeLessThan(176);
		expect(canStand(wall, wall.player.x, wall.player.y)).toBe(true);
		wall.objects.push({ id: 1000, kind: "cottage", x: 10, y: 11 });
		b.update(wall, 0, 1, true, 1);
		expect(wall.player.y).toBeLessThan(176);
	});
	it("advances every authored gait frame with distance, preserves phase between walk and run", () => {
		const animation = new CharacterAnimation();
		const frames = new Set<number>();
		for (let i = 0; i < FRAME_COUNTS.walk; i++)
			frames.add(animation.update(0.05, STRIDE.walk / FRAME_COUNTS.walk, 0, false).frame);
		expect(frames.size).toBe(FRAME_COUNTS.walk);
		animation.update(0.01, STRIDE.run / 4, 0, true);
		expect(animation.phase).toBeCloseTo(0.25);
		expect(animation.pose.state).toBe("run");
		expect(animation.pose.frame).toBe(Math.floor(FRAME_COUNTS.run / 4));
		const phase = animation.phase;
		animation.update(0.2, 0, 0, true, 1, 0);
		expect(animation.phase).toBe(phase);
		expect(animation.pose.state).toBe("idle");
	});
	it("faces all four directions and retains the last direction after stopping", () => {
		const animation = new CharacterAnimation();
		const directions = [
			[0, 1],
			[-1, 0],
			[1, 0],
			[0, -1]
		];
		directions.forEach(([dx, dy], i) => {
			animation.update(0.1, dx, dy, false);
			expect(animation.pose.facing).toBe(FACINGS[i]);
			animation.update(0.2, 0, 0, false);
			expect(animation.pose.facing).toBe(FACINGS[i]);
			expect(animation.pose.state).toBe("idle");
		});
	});
	it("keeps cadence consistent across directions for the same travel distance", () => {
		const directions = [
			[0, 1],
			[-1, 0],
			[1, 0],
			[0, -1]
		];
		for (const running of [false, true]) {
			const phases = directions.map(([dx, dy]) => {
				const animation = new CharacterAnimation();
				for (let i = 0; i < 20; i++) animation.update(1 / 60, dx * 0.9, dy * 0.9, running);
				return animation.phase;
			});
			for (const phase of phases) expect(phase).toBeCloseTo(phases[0], 10);
		}
	});
	it("plays Aiko's four-pose idle and brief blink, returning to open eyes on movement", () => {
		const animation = new CharacterAnimation();
		expect(animation.update(0, 0, 0, false).frame).toBe(0);
		expect(animation.update(0.5, 0, 0, false).frame).toBe(1);
		expect(animation.update(0.5, 0, 0, false).frame).toBe(0);
		expect(animation.update(0.5, 0, 0, false).frame).toBe(3);
		expect(animation.update(3.2, 0, 0, false).frame).toBe(2);
		expect(animation.update(0.1, 0, 0, false).frame).not.toBe(2);
		animation.update(0.01, WALK_SPEED * 0.01, 0, false);
		expect(animation.pose.state).toBe("walk");
		animation.update(0.01, 0, 0, false);
		expect(animation.pose.state).toBe("idle");
		expect(animation.pose.frame).toBe(0);
	});
	it("uses actual collision-resolved travel, not held input, for gait cadence", () => {
		const world = openWorld(),
			motion = new PlayerMotion(),
			animation = new CharacterAnimation();
		world.terrain[index(11, 10)] = "water";
		for (let i = 0; i < 120; i++) {
			const d = motion.update(world, 1, 0, true, 1 / 60);
			animation.update(1 / 60, d.dx, d.dy, true, 1, 0);
		}
		expect(animation.pose.state).toBe("idle");
		expect(animation.pose.facing).toBe("right");
	});
});
