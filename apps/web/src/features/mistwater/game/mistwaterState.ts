export type MistwaterSnapshot = {
	blooms: number;
	streak: number;
	bestStreak: number;
};

export const MISTWATER_STREAK_WINDOW_MS = 5_500;

export function initialMistwaterSnapshot(): MistwaterSnapshot {
	return {
		blooms: 0,
		streak: 0,
		bestStreak: 0
	};
}

export function recordMistwaterBloom(
	current: MistwaterSnapshot,
	elapsedSinceLastBloomMs: number | null
): MistwaterSnapshot {
	const continuesStreak =
		elapsedSinceLastBloomMs !== null &&
		elapsedSinceLastBloomMs >= 0 &&
		elapsedSinceLastBloomMs <= MISTWATER_STREAK_WINDOW_MS;
	const streak = continuesStreak ? current.streak + 1 : 1;

	return {
		blooms: current.blooms + 1,
		streak,
		bestStreak: Math.max(current.bestStreak, streak)
	};
}
