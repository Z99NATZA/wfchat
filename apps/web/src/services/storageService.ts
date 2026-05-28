export function readStorageItem(key: string): string | null {
	if (typeof window === "undefined") {
		return null;
	}

	try {
		return window.localStorage.getItem(key);
	} catch {
		return null;
	}
}

export function writeStorageItem(key: string, value: string): void {
	if (typeof window === "undefined") {
		return;
	}

	try {
		window.localStorage.setItem(key, value);
	} catch {
		// Local storage can be unavailable in private or locked-down contexts.
	}
}
