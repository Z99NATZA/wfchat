import { readStorageItem, removeStorageItem, writeStorageItem } from "@/services/storageService";
import { touchSyncKey } from "@/stores/syncStateStore";

export const BACKGROUND_IMAGE_URL_STORAGE_KEY = "wfchat.backgroundImageUrl";
export const BACKGROUND_IMAGE_URL_SYNC_KEY = "settings.backgroundImageUrl";

export function readBackgroundImageUrl(): string {
	return readStorageItem(BACKGROUND_IMAGE_URL_STORAGE_KEY)?.trim() ?? "";
}

export function persistBackgroundImageUrl(url: string): void {
	const nextUrl = url.trim();

	if (!nextUrl) {
		removeStorageItem(BACKGROUND_IMAGE_URL_STORAGE_KEY);
		touchSyncKey(BACKGROUND_IMAGE_URL_SYNC_KEY);
		return;
	}

	writeStorageItem(BACKGROUND_IMAGE_URL_STORAGE_KEY, nextUrl);
	touchSyncKey(BACKGROUND_IMAGE_URL_SYNC_KEY);
}

export function writeBackgroundImageUrl(url: string): void {
	const nextUrl = url.trim();

	if (!nextUrl) {
		removeStorageItem(BACKGROUND_IMAGE_URL_STORAGE_KEY);
		return;
	}

	writeStorageItem(BACKGROUND_IMAGE_URL_STORAGE_KEY, nextUrl);
}
