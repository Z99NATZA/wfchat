import type { CafeAvatarId, CafeDirection } from "@/features/cafe/types";

type SakuraPinLayout = {
	x: number;
	y: number;
	petalRadius: number;
	centerRadius: number;
};

const SAKURA_PIN_LAYOUTS: Record<CafeAvatarId, Record<CafeDirection, SakuraPinLayout>> = {
	boy: {
		up: { x: 20, y: -83, petalRadius: 4, centerRadius: 2.7 },
		down: { x: 24, y: -88, petalRadius: 4, centerRadius: 2.7 },
		left: { x: 8, y: -89, petalRadius: 4, centerRadius: 2.7 },
		right: { x: -8, y: -89, petalRadius: 4, centerRadius: 2.7 }
	},
	girl: {
		up: { x: 21, y: -82, petalRadius: 4, centerRadius: 2.7 },
		down: { x: 23, y: -87, petalRadius: 4, centerRadius: 2.7 },
		left: { x: 9, y: -90, petalRadius: 4, centerRadius: 2.7 },
		right: { x: -9, y: -90, petalRadius: 4, centerRadius: 2.7 }
	}
};

export function cafeSakuraPinLayout(
	avatarId: CafeAvatarId,
	direction: CafeDirection
): SakuraPinLayout {
	return SAKURA_PIN_LAYOUTS[avatarId][direction];
}
