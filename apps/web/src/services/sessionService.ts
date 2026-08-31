import { apiClient } from "@/services/apiClient";
import { removeStorageItem } from "@/services/storageService";

const sessionCookieReadyKey = "wfchat.sessionCookieReady";
const legacySessionStorageKey = "wfchat.sessionId";
let sessionBootstrapPromise: Promise<void> | null = null;

export function ensureCookieSession(): Promise<void> {
	if (readSessionMarker(sessionCookieReadyKey) === "true") {
		return Promise.resolve();
	}

	if (!sessionBootstrapPromise) {
		sessionBootstrapPromise = apiClient
			.get("/api/auth/me")
			.then(() => markCookieSessionReady())
			.finally(() => {
				sessionBootstrapPromise = null;
			});
	}

	return sessionBootstrapPromise;
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
