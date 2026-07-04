import { apiClient } from "@/services/apiClient";
import { removeStorageItem } from "@/services/storageService";

const sessionCookieReadyKey = "wfchat.sessionCookieReady";
const legacySessionStorageKey = "wfchat.sessionId";

export async function ensureCookieSession(): Promise<void> {
	if (readSessionMarker(sessionCookieReadyKey) === "true") {
		return;
	}

	await apiClient.get("/api/auth/me");
	markCookieSessionReady();
}

export function markCookieSessionReady(): void {
	removeStorageItem(legacySessionStorageKey);
	writeSessionMarker(sessionCookieReadyKey, "true");
}

function readSessionMarker(key: string): string | null {
	if (typeof window === "undefined") {
		return null;
	}

	try {
		return window.sessionStorage.getItem(key);
	} catch {
		return null;
	}
}

function writeSessionMarker(key: string, value: string): void {
	if (typeof window === "undefined") {
		return;
	}

	try {
		window.sessionStorage.setItem(key, value);
	} catch {
		// Session storage can be unavailable in private or locked-down contexts.
	}
}
