const MIN_READABLE_ZOOM = 0.9;
const DEAD_ZONE_RATIO = 0.14;
const MAX_DEAD_ZONE_WIDTH = 160;
const MAX_DEAD_ZONE_HEIGHT = 100;

export type CafeCameraFraming = {
	zoom: number;
	deadZoneWidth: number;
	deadZoneHeight: number;
};

export function calculateCafeCameraFraming(
	viewportWidth: number,
	viewportHeight: number,
	mapWidth: number,
	mapHeight: number
): CafeCameraFraming {
	const coverZoom = Math.max(viewportWidth / mapWidth, viewportHeight / mapHeight);
	const zoom = Math.max(MIN_READABLE_ZOOM, coverZoom);
	const visibleWorldWidth = viewportWidth / zoom;
	const visibleWorldHeight = viewportHeight / zoom;

	return {
		zoom,
		deadZoneWidth: Math.min(MAX_DEAD_ZONE_WIDTH, visibleWorldWidth * DEAD_ZONE_RATIO),
		deadZoneHeight: Math.min(MAX_DEAD_ZONE_HEIGHT, visibleWorldHeight * DEAD_ZONE_RATIO)
	};
}
