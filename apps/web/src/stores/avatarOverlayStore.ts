import { readStorageItem, writeStorageItem } from "@/services/storageService";

export const AVATAR_OVERLAY_VISIBLE_STORAGE_KEY = "wfchat.avatarOverlayVisible";
export const AVATAR_OVERLAY_POSITION_STORAGE_KEY = "wfchat.avatarOverlayPosition";
export const AVATAR_OVERLAY_SIZE_STORAGE_KEY = "wfchat.avatarOverlaySize";

export type AvatarOverlayPosition = "bottom-right" | "bottom-left";
export type AvatarOverlaySize = "small" | "medium";

export function readAvatarOverlayVisible(): boolean {
	return readStorageItem(AVATAR_OVERLAY_VISIBLE_STORAGE_KEY) !== "false";
}

export function persistAvatarOverlayVisible(isVisible: boolean): void {
	writeStorageItem(AVATAR_OVERLAY_VISIBLE_STORAGE_KEY, isVisible ? "true" : "false");
}

export function readAvatarOverlayPosition(): AvatarOverlayPosition {
	const storedPosition = readStorageItem(AVATAR_OVERLAY_POSITION_STORAGE_KEY);
	return storedPosition === "bottom-left" || storedPosition === "bottom-right"
		? storedPosition
		: "bottom-right";
}

export function persistAvatarOverlayPosition(position: AvatarOverlayPosition): void {
	writeStorageItem(AVATAR_OVERLAY_POSITION_STORAGE_KEY, position);
}

export function readAvatarOverlaySize(): AvatarOverlaySize {
	const storedSize = readStorageItem(AVATAR_OVERLAY_SIZE_STORAGE_KEY);
	return storedSize === "small" || storedSize === "medium" ? storedSize : "small";
}

export function persistAvatarOverlaySize(size: AvatarOverlaySize): void {
	writeStorageItem(AVATAR_OVERLAY_SIZE_STORAGE_KEY, size);
}
