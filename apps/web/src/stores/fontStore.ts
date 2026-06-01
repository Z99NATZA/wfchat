import { readStorageItem, writeStorageItem } from "@/services/storageService";
import { touchSyncKey } from "@/stores/syncStateStore";
import { FONT_OPTIONS, type AppFont } from "@/types/font";

const FONT_STORAGE_KEY = "wfchat-font";
const DEFAULT_FONT: AppFont = "inter";

function isFont(value: string | null): value is AppFont {
	return FONT_OPTIONS.some((font) => font.id === value);
}

export function resolveInitialFont(): AppFont {
	const storedFont = readStorageItem(FONT_STORAGE_KEY);
	return isFont(storedFont) ? storedFont : DEFAULT_FONT;
}

export function persistFont(font: AppFont): void {
	writeStorageItem(FONT_STORAGE_KEY, font);
	touchSyncKey("settings.font");
}

export function applyFontToDocument(font: AppFont): void {
	if (typeof document === "undefined") {
		return;
	}

	document.documentElement.dataset.font = font;
}
