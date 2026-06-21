import { readStorageItem, writeStorageItem } from "@/services/storageService";

export const ASSISTANT_SPEECH_VISIBLE_STORAGE_KEY = "wfchat.assistantSpeechVisible";

export function readAssistantSpeechVisible(): boolean {
	return readStorageItem(ASSISTANT_SPEECH_VISIBLE_STORAGE_KEY) !== "false";
}

export function persistAssistantSpeechVisible(isVisible: boolean): void {
	writeStorageItem(ASSISTANT_SPEECH_VISIBLE_STORAGE_KEY, isVisible ? "true" : "false");
}
