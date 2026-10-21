export type Point = { x: number; y: number };
export type Prop = Point & { frame: string; width: number; radius: number; seed: number };

export const MAP_WIDTH = 1600;
export const MAP_HEIGHT = 1240;
export const PLAYER_RADIUS = 17;
export const START: Point = { x: 770, y: 800 };
export const POND = { x: 1190, y: 430, rx: 205, ry: 175 };

export const PROPS: Prop[] = [
	{ x: 165, y: 230, frame: "oak", width: 360, radius: 35, seed: 1 },
	{ x: 450, y: 170, frame: "golden", width: 330, radius: 30, seed: 2 },
	{ x: 810, y: 150, frame: "oak", width: 335, radius: 32, seed: 3 },
	{ x: 1420, y: 220, frame: "willow", width: 335, radius: 32, seed: 4 },
	{ x: 260, y: 670, frame: "willow", width: 360, radius: 34, seed: 5 },
	{ x: 540, y: 470, frame: "oak", width: 300, radius: 32, seed: 6 },
	{ x: 1400, y: 830, frame: "golden", width: 355, radius: 36, seed: 7 },
	{ x: 360, y: 1150, frame: "oak", width: 395, radius: 40, seed: 8 },
	{ x: 1120, y: 1190, frame: "fern", width: 140, radius: 27, seed: 9 },
	{ x: 1500, y: 1150, frame: "golden", width: 300, radius: 30, seed: 10 },
	{ x: 1005, y: 670, frame: "bench", width: 165, radius: 70, seed: 11 },
	{ x: 1110, y: 690, frame: "fern", width: 110, radius: 24, seed: 12 },
	{ x: 985, y: 290, frame: "rock", width: 130, radius: 43, seed: 13 },
	{ x: 1330, y: 630, frame: "rock", width: 120, radius: 40, seed: 14 },
	{ x: 400, y: 700, frame: "rock", width: 120, radius: 40, seed: 15 },
	{ x: 440, y: 740, frame: "fern", width: 95, radius: 22, seed: 16 },
	{ x: 340, y: 320, frame: "fern", width: 130, radius: 26, seed: 17 },
	{ x: 690, y: 330, frame: "fern", width: 115, radius: 24, seed: 18 },
	{ x: 1270, y: 255, frame: "fern", width: 110, radius: 24, seed: 19 },
	{ x: 230, y: 965, frame: "fern", width: 140, radius: 27, seed: 20 },
	{ x: 1460, y: 1050, frame: "fern", width: 140, radius: 27, seed: 21 },
	{ x: 950, y: 1080, frame: "rock", width: 100, radius: 30, seed: 22 }
];

export function isWalkable(point: Point): boolean {
	if (point.x < 65 || point.x > MAP_WIDTH - 65 || point.y < 95 || point.y > MAP_HEIGHT - 65) {
		return false;
	}
	if (
		((point.x - POND.x) / (POND.rx + PLAYER_RADIUS)) ** 2 +
			((point.y - POND.y) / (POND.ry + PLAYER_RADIUS)) ** 2 <
		1
	) {
		return false;
	}
	return PROPS.every(
		(prop) => Math.hypot(point.x - prop.x, point.y - prop.y) >= prop.radius + PLAYER_RADIUS
	);
}

export function canWalkSegment(from: Point, to: Point): boolean {
	const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 6));
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		if (!isWalkable({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t })) {
			return false;
		}
	}
	return true;
}

const CELL = 28;
const COLS = Math.ceil(MAP_WIDTH / CELL);
const ROWS = Math.ceil(MAP_HEIGHT / CELL);
const nodePoint = (index: number): Point => ({
	x: (index % COLS) * CELL + CELL / 2,
	y: Math.floor(index / COLS) * CELL + CELL / 2
});

/** Bounded A*; blocked clicks resolve to a nearby reachable point, never through a prop. */
export function findPath(from: Point, requested: Point): Point[] {
	if (!isWalkable(from)) return [];
	const target = {
		x: Math.max(65, Math.min(MAP_WIDTH - 65, requested.x)),
		y: Math.max(95, Math.min(MAP_HEIGHT - 65, requested.y))
	};
	if (canWalkSegment(from, target)) return [target];
	const walkable = Array.from({ length: COLS * ROWS }, (_, i) => isWalkable(nodePoint(i)));
	const nearestNode = (point: Point, connect?: Point) => {
		let best = -1;
		let distance = Infinity;
		for (let i = 0; i < walkable.length; i++) {
			if (!walkable[i]) continue;
			const candidate = nodePoint(i);
			const d = Math.hypot(candidate.x - point.x, candidate.y - point.y);
			if (d < distance && (!connect || canWalkSegment(connect, candidate))) {
				best = i;
				distance = d;
			}
		}
		return best;
	};
	const start = nearestNode(from, from);
	const goal = nearestNode(target);
	if (start < 0 || goal < 0) return [];
	const open = new Set([start]);
	const closed = new Set<number>();
	const costs = new Map([[start, 0]]);
	const parents = new Map<number, number>();
	const heuristic = (index: number) => {
		const p = nodePoint(index);
		const g = nodePoint(goal);
		return Math.hypot(p.x - g.x, p.y - g.y);
	};
	while (open.size) {
		let current = -1;
		let score = Infinity;
		for (const index of open) {
			const next = (costs.get(index) ?? Infinity) + heuristic(index);
			if (next < score) {
				current = index;
				score = next;
			}
		}
		if (current === goal) {
			const path = [nodePoint(goal)];
			let cursor = goal;
			while (parents.has(cursor)) {
				cursor = parents.get(cursor)!;
				path.unshift(nodePoint(cursor));
			}
			if (canWalkSegment(path[path.length - 1], target)) path.push(target);
			const smooth: Point[] = [];
			let anchor = from;
			for (let i = 0; i < path.length;) {
				let furthest = i;
				for (let j = i + 1; j < path.length; j++) {
					if (canWalkSegment(anchor, path[j])) furthest = j;
				}
				smooth.push(path[furthest]);
				anchor = path[furthest];
				i = furthest + 1;
			}
			return smooth;
		}
		open.delete(current);
		closed.add(current);
		const col = current % COLS;
		const row = Math.floor(current / COLS);
		for (let dy = -1; dy <= 1; dy++) {
			for (let dx = -1; dx <= 1; dx++) {
				if (
					(!dx && !dy) ||
					col + dx < 0 ||
					col + dx >= COLS ||
					row + dy < 0 ||
					row + dy >= ROWS
				)
					continue;
				const next = (row + dy) * COLS + col + dx;
				if (
					closed.has(next) ||
					!walkable[next] ||
					!canWalkSegment(nodePoint(current), nodePoint(next))
				)
					continue;
				const cost = (costs.get(current) ?? Infinity) + CELL * Math.hypot(dx, dy);
				if (cost >= (costs.get(next) ?? Infinity)) continue;
				parents.set(next, current);
				costs.set(next, cost);
				open.add(next);
			}
		}
	}
	return [];
}
