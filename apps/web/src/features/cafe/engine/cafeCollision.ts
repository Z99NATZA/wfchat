import type { CafeMapLayout } from "@/features/cafe/types";

export type CafePosition = {
	x: number;
	y: number;
};

export function resolveCafeMovement(
	layout: CafeMapLayout,
	current: CafePosition,
	requested: CafePosition
): CafePosition {
	const radius = layout.playerCollisionRadius;
	const clampedX = clamp(requested.x, radius, layout.width - radius);
	const clampedY = clamp(requested.y, radius, layout.height - radius);
	const resolvedX = cafePositionCollides(layout, clampedX, current.y) ? current.x : clampedX;
	const resolvedY = cafePositionCollides(layout, resolvedX, clampedY) ? current.y : clampedY;
	return { x: resolvedX, y: resolvedY };
}

export function cafePositionCollides(layout: CafeMapLayout, x: number, y: number) {
	const radius = layout.playerCollisionRadius;
	return layout.colliders.some(
		(collider) =>
			x + radius > collider.x &&
			x - radius < collider.x + collider.width &&
			y + radius > collider.y &&
			y - radius < collider.y + collider.height
	);
}

function clamp(value: number, minimum: number, maximum: number) {
	return Math.min(Math.max(value, minimum), maximum);
}
