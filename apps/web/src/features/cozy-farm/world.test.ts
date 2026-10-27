import { describe, expect, it } from "vitest";
import {
	act,
	blocked,
	canStand,
	createWorld,
	deserialize,
	grow,
	index,
	move,
	serialize,
	validTarget,
	waterMask,
	WIDTH,
	HEIGHT
} from "./world";
function emptyWorld() {
	const w = createWorld();
	w.terrain.fill("grass");
	w.objects = [];
	w.crops = {};
	w.player = { x: 168, y: 168, dx: 0, dy: 1 };
	return w;
}
describe("Cozy Farm simulation", () => {
	it("creates a playable map and round trips saves", () => {
		const w = createWorld();
		expect(w.terrain).toHaveLength(WIDTH * HEIGHT);
		expect(canStand(w, w.player.x, w.player.y)).toBe(true);
		expect(deserialize(serialize(w))).toEqual(w);
	});
	it("normalizes diagonals and prevents tunneling", () => {
		const a = emptyWorld(),
			b = emptyWorld();
		move(a, 1, 0, 0.1);
		move(b, 1, 1, 0.1);
		expect(Math.hypot(b.player.x - 168, b.player.y - 168)).toBeCloseTo(a.player.x - 168);
		a.terrain[index(11, 10)] = "water";
		move(a, 1, 0, 1);
		expect(a.player.x).toBeLessThan(176);
		a.objects.push({ id: 1, kind: "cottage", x: 10, y: 11 });
		move(a, 0, 1, 1);
		expect(a.player.y).toBeLessThan(176);
	});
	it("allows docks over water", () => {
		const w = emptyWorld();
		w.terrain[index(11, 10)] = "water";
		expect(blocked(w, 184, 168)).toBe(true);
		w.objects.push({ id: 1, kind: "dock", x: 11, y: 10 });
		expect(blocked(w, 184, 168)).toBe(false);
	});
	it("handles isolated water and missing inner corners", () => {
		const w = emptyWorld();
		w.terrain[index(10, 10)] = "water";
		expect(waterMask(w, 10, 10)).toBe(0);
		w.terrain[index(10, 9)] = "water";
		w.terrain[index(11, 10)] = "water";
		expect(waterMask(w, 10, 10)).toBe(3);
		w.terrain[index(11, 9)] = "water";
		expect(waterMask(w, 10, 10)).toBe(19);
	});
	it("requires tilling and water, grows crops and returns seeds", () => {
		const w = emptyWorld();
		expect(act(w, "turnip", 11, 10)).toBe("invalid");
		act(w, "hoe", 11, 10);
		expect(act(w, "turnip", 11, 10)).toBe("planted");
		expect(w.seeds).toBe(23);
		grow(w, 60);
		expect(w.crops[index(11, 10)].growth).toBe(0);
		act(w, "water", 11, 10);
		grow(w, 45);
		expect(act(w, "hand", 11, 10)).toBe("harvested");
		expect(w.harvest).toBe(1);
		expect(w.seeds).toBe(25);
		expect(w.crops[index(11, 10)]).toBeUndefined();
	});
	it("checks whole footprints, range, player overlap and removal collision", () => {
		const w = emptyWorld();
		expect(validTarget(w, "tree", 11, 10)).toBe(true);
		w.terrain[index(12, 11)] = "water";
		expect(validTarget(w, "tree", 11, 10)).toBe(false);
		expect(validTarget(w, "lamp", 10, 10)).toBe(false);
		expect(validTarget(w, "lamp", 20, 20)).toBe(false);
		w.terrain[index(12, 11)] = "grass";
		act(w, "tree", 11, 10);
		expect(blocked(w, 184, 168)).toBe(true);
		expect(act(w, "remove", 12, 11)).toBe("removed");
		expect(blocked(w, 184, 168)).toBe(false);
	});
	it("protects crops and fixed objects", () => {
		const w = emptyWorld();
		act(w, "hoe", 11, 10);
		act(w, "berry", 11, 10);
		expect(act(w, "path", 11, 10)).toBe("invalid");
		w.objects.push({ id: 1, kind: "cottage", x: 12, y: 10 });
		expect(act(w, "remove", 12, 10)).toBe("invalid");
	});
	it("rejects corrupt and unsafe saves", () => {
		expect(deserialize("{")).toBeNull();
		const w = emptyWorld();
		w.player.x = -1;
		expect(deserialize(serialize(w))).toBeNull();
		w.player.x = 168;
		w.objects.push({ id: 1, kind: "tree", x: WIDTH - 1, y: 10 });
		expect(deserialize(serialize(w))).toBeNull();
		w.objects = [];
		w.seeds = -1;
		expect(deserialize(serialize(w))).toBeNull();
	});
});
