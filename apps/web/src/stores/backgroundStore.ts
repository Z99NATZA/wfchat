import { readStorageItem, removeStorageItem, writeStorageItem } from "@/services/storageService";

const BACKGROUND_IMAGE_URL_STORAGE_KEY = "wfchat.backgroundImageUrl";

export function readBackgroundImageUrl(): string {
	return readStorageItem(BACKGROUND_IMAGE_URL_STORAGE_KEY)?.trim() ?? "";
}

export function persistBackgroundImageUrl(url: string): void {
	const nextUrl = url.trim();

	if (!nextUrl) {
		removeStorageItem(BACKGROUND_IMAGE_URL_STORAGE_KEY);
		return;
	}

	writeStorageItem(BACKGROUND_IMAGE_URL_STORAGE_KEY, nextUrl);
}
