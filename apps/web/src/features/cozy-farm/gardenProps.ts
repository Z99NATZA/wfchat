// Measured alpha bounds from garden-props-v1.png and authored world dimensions.
// These sprites are decorative; they introduce no objects, collision or save state.
export const GARDEN_PROPS = {
	bench: { frame: [33, 90, 448, 321], width: 28, height: 20 },
	mailbox: { frame: [569, 67, 234, 354], width: 12, height: 18 },
	planter: { frame: [895, 99, 329, 326], width: 14, height: 14 },
	crate: { frame: [41, 546, 388, 303], width: 16, height: 12.5 },
	wateringCan: { frame: [500, 533, 357, 295], width: 15, height: 12.5 },
	basket: { frame: [886, 517, 341, 327], width: 16, height: 15.5 },
	mushrooms: { frame: [100, 933, 278, 270], width: 10, height: 10 }
} as const;
