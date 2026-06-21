import { readStorageItem, writeStorageItem } from "@/services/storageService";

export const ASSISTANT_SPEECH_VISIBLE_STORAGE_KEY = "wfchat.assistantSpeechVisible";
export const ASSISTANT_SPEECH_AUTO_PLAY_STORAGE_KEY = "wfchat.assistantSpeechAutoPlay";

export function readAssistantSpeechVisible(): boolean {
	return readStorageItem(ASSISTANT_SPEECH_VISIBLE_STORAGE_KEY) !== "false";
}

export function persistAssistantSpeechVisible(isVisible: boolean): void {
	writeStorageItem(ASSISTANT_SPEECH_VISIBLE_STORAGE_KEY, isVisible ? "true" : "false");
}

export function readAssistantSpeechAutoPlay(): boolean {
	return readStorageItem(ASSISTANT_SPEECH_AUTO_PLAY_STORAGE_KEY) === "true";
}

export function persistAssistantSpeechAutoPlay(isEnabled: boolean): void {
	writeStorageItem(ASSISTANT_SPEECH_AUTO_PLAY_STORAGE_KEY, isEnabled ? "true" : "false");
}
