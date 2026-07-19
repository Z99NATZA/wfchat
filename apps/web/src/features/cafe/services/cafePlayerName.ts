export const CAFE_PLAYER_NAME_MAX_LENGTH = 24;
export const CAFE_PLAYER_NAME_STORAGE_KEY = "wfchat_cafe_player_name_v1";

export function readCafePlayerName(): string {
	if (typeof window === "undefined") {
		return "";
	}
	try {
		return window.sessionStorage.getItem(CAFE_PLAYER_NAME_STORAGE_KEY)?.trim() ?? "";
	} catch {
		return "";
	}
}

export function saveCafePlayerName(value: string) {
	if (typeof window === "undefined") {
		return;
	}
	try {
		const name = value.trim();
		if (name) {
			window.sessionStorage.setItem(CAFE_PLAYER_NAME_STORAGE_KEY, name);
		} else {
			window.sessionStorage.removeItem(CAFE_PLAYER_NAME_STORAGE_KEY);
		}
	} catch {
		// The server still supplies a default name when session storage is unavailable.
	}
}
