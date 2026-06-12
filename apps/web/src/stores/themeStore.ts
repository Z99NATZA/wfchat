import { readStorageItem, writeStorageItem } from "@/services/storageService";
import { touchSyncKey } from "@/stores/syncStateStore";
import type { Theme } from "@/types/theme";

const THEME_STORAGE_KEY = "wfchat-theme";

function isTheme(value: string | null): value is Theme {
	return value === "light" || value === "dark";
}

function getSystemTheme(): Theme {
	if (typeof window === "undefined") {
		return "light";
	}

	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveInitialTheme(): Theme {
	const storedTheme = readStorageItem(THEME_STORAGE_KEY);

	if (isTheme(storedTheme)) {
		return storedTheme;
	}

	return getSystemTheme();
}

export function persistTheme(theme: Theme): void {
	writeStorageItem(THEME_STORAGE_KEY, theme);
	touchSyncKey("settings.theme");
}

export function writeTheme(theme: Theme): void {
	writeStorageItem(THEME_STORAGE_KEY, theme);
}

export function applyThemeToDocument(theme: Theme): void {
	if (typeof document === "undefined") {
		return;
	}

	document.documentElement.classList.toggle("dark", theme === "dark");
	document.documentElement.style.colorScheme = theme;
}
