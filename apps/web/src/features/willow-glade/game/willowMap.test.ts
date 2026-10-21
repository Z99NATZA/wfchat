import { describe, expect, it } from "vitest";
import {
	canWalkSegment,
	findPath,
	isWalkable,
	MAP_WIDTH,
	POND,
	PROPS,
	START,
	type Point
} from "./willowMap";

function expectSafeRoute(from: Point, route: Point[]) {
	expect(route.length).toBeGreaterThan(0);
	let previous = from;
	for (const point of route) {
		expect(isWalkable(point)).toBe(true);
		expect(canWalkSegment(previous, point)).toBe(true);
		previous = point;
	}
}

describe("Willow Glade navigation", () => {
	it("walks around the pond instead of cutting through the water", () => {
		const from = { x: 900, y: POND.y };
		const to = { x: 1480, y: POND.y };
		expect(canWalkSegment(from, to)).toBe(false);
		const route = findPath(from, to);
		expectSafeRoute(from, route);
		expect(route.at(-1)).toEqual(to);
	});

	it("keeps the entire character clear of trunks, rocks and the bench", () => {
		for (const prop of PROPS) {
			expect(isWalkable(prop)).toBe(false);
			const route = findPath(START, prop);
			expectSafeRoute(START, route);
			expect(Math.hypot(route.at(-1)!.x - prop.x, route.at(-1)!.y - prop.y)).toBeGreaterThan(
				prop.radius
			);
		}
	});

	it("resolves clicks in water and outside the map to safe ground", () => {
		for (const destination of [POND, { x: -1000, y: -1000 }, { x: MAP_WIDTH + 500, y: 1800 }]) {
			expectSafeRoute(START, findPath(START, destination));
		}
	});

	it("rejects blocked starting positions and prevents a long movement step tunnelling through a trunk", () => {
		const tree = PROPS[5];
		expect(findPath(tree, START)).toEqual([]);
		expect(canWalkSegment({ x: tree.x - 100, y: tree.y }, { x: tree.x + 100, y: tree.y })).toBe(
			false
		);
	});
});
