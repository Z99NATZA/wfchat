import { readStorageItem, writeStorageItem } from "@/services/storageService";

export const AVATAR_OVERLAY_VISIBLE_STORAGE_KEY = "wfchat.avatarOverlayVisible";

export function readAvatarOverlayVisible(): boolean {
	return readStorageItem(AVATAR_OVERLAY_VISIBLE_STORAGE_KEY) !== "false";
}

export function persistAvatarOverlayVisible(isVisible: boolean): void {
	writeStorageItem(AVATAR_OVERLAY_VISIBLE_STORAGE_KEY, isVisible ? "true" : "false");
}
