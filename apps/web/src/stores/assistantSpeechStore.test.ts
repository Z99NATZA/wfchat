/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	ASSISTANT_SPEECH_VISIBLE_STORAGE_KEY,
	persistAssistantSpeechVisible,
	readAssistantSpeechVisible
} from "@/stores/assistantSpeechStore";

describe("assistantSpeechStore", () => {
	const storage = new Map<string, string>();

	beforeEach(() => {
		storage.clear();
		Object.defineProperty(window, "localStorage", {
			configurable: true,
			value: {
				clear: vi.fn(() => storage.clear()),
				getItem: vi.fn((key: string) => storage.get(key) ?? null),
				removeItem: vi.fn((key: string) => {
					storage.delete(key);
				}),
				setItem: vi.fn((key: string, value: string) => {
					storage.set(key, value);
				})
			}
		});
	});

	it("defaults assistant speech actions to visible", () => {
		expect(readAssistantSpeechVisible()).toBe(true);
	});

	it("persists hidden and visible assistant speech preferences", () => {
		persistAssistantSpeechVisible(false);

		expect(window.localStorage.getItem(ASSISTANT_SPEECH_VISIBLE_STORAGE_KEY)).toBe("false");
		expect(readAssistantSpeechVisible()).toBe(false);

		persistAssistantSpeechVisible(true);

		expect(window.localStorage.getItem(ASSISTANT_SPEECH_VISIBLE_STORAGE_KEY)).toBe("true");
		expect(readAssistantSpeechVisible()).toBe(true);
	});
});
