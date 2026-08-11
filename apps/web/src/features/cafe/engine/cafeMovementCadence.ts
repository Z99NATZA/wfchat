import type { CafeDirection } from "@/features/cafe/types";

export const CAFE_MOVEMENT_INTERVAL_MS = 100;

export class CafeMovementCadence {
	private lastSentAt: number | null = null;
	private lastMoving = false;
	private lastDirection: CafeDirection | null = null;

	shouldSend(time: number, direction: CafeDirection, moving: boolean) {
		const transitioned =
			moving !== this.lastMoving ||
			(moving && this.lastDirection !== null && direction !== this.lastDirection);

		if (!moving && !transitioned) {
			return false;
		}

		if (
			!transitioned &&
			this.lastSentAt !== null &&
			time - this.lastSentAt < CAFE_MOVEMENT_INTERVAL_MS
		) {
			return false;
		}

		this.lastSentAt = time;
		this.lastMoving = moving;
		this.lastDirection = direction;
		return true;
	}

	markInputDisabled() {
		const shouldSendStop = this.lastMoving;
		this.lastSentAt = null;
		this.lastMoving = false;
		this.lastDirection = null;
		return shouldSendStop;
	}
}
