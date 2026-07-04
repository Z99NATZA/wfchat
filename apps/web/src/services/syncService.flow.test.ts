/**
 * @vitest-environment happy-dom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiClientMock = vi.hoisted(() => ({
	get: vi.fn(),
	post: vi.fn()
}));

vi.mock("@/services/apiClient", () => ({
	apiClient: apiClientMock
}));

import {
	enqueueGuestSyncWithMemory,
	flushGuestSyncQueue,
	markChatMessagesDeleted,
	markMemoryFactDeleted,
	markSyncRetry,
	pullSyncChanges,
	readChatMessagesCache,
	readChatSessionsCache,
	readMemoryFactsCache,
	type SyncQueueOperation
} from "@/services/syncService";
import type { ChatMessage, ChatSessionSummary, MemoryFact, MemorySummary } from "@/types/chat";

const sessionCookieReadyKey = "wfchat.sessionCookieReady";
const syncQueueStorageKey = "wfchat-sync-queue";
const syncCursorStorageKey = "wfchat-sync-cursor";
const syncMetaStorageKey = "wfchat-sync-meta";
const themeStorageKey = "wfchat-theme";
const fontStorageKey = "wfchat-font";
const localeStorageKey = "wfchat.locale";
const backgroundImageUrlStorageKey = "wfchat.backgroundImageUrl";
const memoryFactsCacheKey = "wfchat-memory-facts-cache";
const chatSessionsCacheKey = "wfchat-chat-sessions-cache";
const chatMessagesCacheKey = "wfchat-chat-messages-cache";

function installLocalStorageMock() {
	const storage = new Map<string, string>();
	const localStorageMock = {
		clear: vi.fn(() => storage.clear()),
		getItem: vi.fn((key: string) => storage.get(key) ?? null),
		removeItem: vi.fn((key: string) => {
			storage.delete(key);
		}),
		setItem: vi.fn((key: string, value: string) => {
			storage.set(key, value);
		})
	};
	Object.defineProperty(window, "localStorage", {
		configurable: true,
		value: localStorageMock
	});
}

function readQueue(): SyncQueueOperation[] {
	return JSON.parse(window.localStorage.getItem(syncQueueStorageKey) ?? "[]") as SyncQueueOperation[];
}

beforeEach(() => {
	installLocalStorageMock();
	window.localStorage.clear();
	window.sessionStorage.clear();
	apiClientMock.get.mockReset();
	apiClientMock.post.mockReset();
	vi.restoreAllMocks();
	vi.spyOn(Date, "now").mockReturnValue(1_000_000);
});

afterEach(() => {
	vi.restoreAllMocks();
	window.localStorage.clear();
	window.sessionStorage.clear();
});

describe("syncService account sync flows", () => {
	it("enqueues mounted state, flushes it, then pulls account changes", async () => {
		window.sessionStorage.setItem(sessionCookieReadyKey, "true");
		window.localStorage.setItem(themeStorageKey, "dark");
		window.localStorage.setItem(fontStorageKey, "inter");
		window.localStorage.setItem(localeStorageKey, "th");
		window.localStorage.setItem(backgroundImageUrlStorageKey, "https://example.com/local.png");
		const memoryFacts: MemoryFact[] = [
			{
				id: "fact-1",
				characterId: "aiko",
				content: "Likes tea",
				confidence: 0.8,
				sourceChatId: "chat-1",
				createdAt: 900,
				updatedAt: 901
			}
		];
		const memorySummaries: MemorySummary[] = [
			{
				id: "summary-1",
				characterId: "aiko",
				summary: "Met the user",
				sourceChatId: "chat-1",
				createdAt: 902
			}
		];
		const sessions: ChatSessionSummary[] = [
			{
				id: "chat-1",
				characterId: "aiko",
				createdAt: 900,
				updatedAt: 903,
				lastMessage: "hello"
			}
		];
		const messages: ChatMessage[] = [
			{
				id: "message-1",
				author: "user",
				text: "hello",
				createdAt: 904,
				time: "12:00"
			}
		];
		apiClientMock.post
			.mockResolvedValueOnce({ data: { to_create: 8, to_update: 0, conflicts: 0 } })
			.mockResolvedValueOnce({
				data: {
					operation_id: "op-1",
					merged_count: 8,
					conflict_count: 0,
					committed_at: 1_001
				}
			});
		apiClientMock.get.mockResolvedValueOnce({
			data: {
				next_cursor: 2_050,
				items: [
					{
						item_id: "settings.theme",
						item_type: "setting",
						updated_at: 2_000,
						deleted_at: null,
						payload: { key: "theme", value: "light" }
					},
					{
						item_id: "settings.font",
						item_type: "setting",
						updated_at: 2_001,
						deleted_at: null,
						payload: { key: "font", value: "jetbrains-mono" }
					},
					{
						item_id: "settings.locale",
						item_type: "setting",
						updated_at: 2_002,
						deleted_at: null,
						payload: { key: "locale", value: "en" }
					},
					{
						item_id: "settings.backgroundImageUrl",
						item_type: "setting",
						updated_at: 2_003,
						deleted_at: null,
						payload: { key: "backgroundImageUrl", value: "https://example.com/cloud.png" }
					},
					{
						item_id: "memory.fact.fact-2",
						item_type: "memory_fact",
						updated_at: 2_010,
						deleted_at: null,
						payload: {
							id: "fact-2",
							characterId: "aiko",
							content: "Likes coffee",
							confidence: "0.7",
							sourceChatId: "chat-1",
							updatedAt: "2010"
						}
					},
					{
						item_id: "chat.session.chat-2",
						item_type: "chat_session",
						updated_at: 2_020,
						deleted_at: null,
						payload: {
							id: "chat-2",
							characterId: "aiko",
							createdAt: "2018",
							updatedAt: "2020",
							lastMessage: "remote hello"
						}
					},
					{
						item_id: "chat.message.chat-2.message-2",
						item_type: "chat_message",
						updated_at: 2_021,
						deleted_at: null,
						payload: {
							id: "message-2",
							chatId: "chat-2",
							author: "companion",
							text: "remote hello",
							createdAt: "2021",
							time: "12:01"
						}
					}
				]
			}
		});
		const onLocaleChange = vi.fn();
		const onBackgroundImageUrlChange = vi.fn();
		const onThemeChange = vi.fn();
		const onFontChange = vi.fn();

		await enqueueGuestSyncWithMemory(memoryFacts, memorySummaries, sessions, messages, "chat-1");
		const commit = await flushGuestSyncQueue({ force: true });
		const appliedCount = await pullSyncChanges(
			onLocaleChange,
			onBackgroundImageUrlChange,
			onThemeChange,
			onFontChange
		);

		expect(commit?.merged_count).toBe(8);
		expect(readQueue()).toEqual([]);
		expect(apiClientMock.post).toHaveBeenNthCalledWith(
			1,
			"/api/sync/preview",
			expect.objectContaining({
				items: expect.arrayContaining([
					expect.objectContaining({ item_id: "settings.theme" }),
					expect.objectContaining({ item_id: "memory.fact.fact-1" }),
					expect.objectContaining({ item_id: "chat.message.chat-1.message-1" })
				])
			})
		);
		expect(appliedCount).toBe(7);
		expect(window.localStorage.getItem(themeStorageKey)).toBe("light");
		expect(window.localStorage.getItem(fontStorageKey)).toBe("jetbrains-mono");
		expect(window.localStorage.getItem(localeStorageKey)).toBe("en");
		expect(window.localStorage.getItem(backgroundImageUrlStorageKey)).toBe(
			"https://example.com/cloud.png"
		);
		expect(JSON.parse(window.localStorage.getItem(syncMetaStorageKey) ?? "{}")).toMatchObject({
			"settings.theme": 2_000,
			"settings.font": 2_001,
			"settings.locale": 2_002,
			"settings.backgroundImageUrl": 2_003
		});
		expect(onThemeChange).toHaveBeenCalledWith("light");
		expect(onFontChange).toHaveBeenCalledWith("jetbrains-mono");
		expect(onLocaleChange).toHaveBeenCalledWith("en");
		expect(onBackgroundImageUrlChange).toHaveBeenCalledWith("https://example.com/cloud.png");
		expect(readMemoryFactsCache()).toEqual([
			expect.objectContaining({ id: "fact-2", content: "Likes coffee" })
		]);
		expect(readChatSessionsCache()).toEqual([
			expect.objectContaining({ id: "chat-2", lastMessage: "remote hello" })
		]);
		expect(readChatMessagesCache("chat-2")).toEqual([
			expect.objectContaining({ id: "message-2", text: "remote hello" })
		]);
		expect(window.localStorage.getItem(syncCursorStorageKey)).toBe("2050");
	});

	it("keeps a failed flush queued and marks retry state", async () => {
		window.sessionStorage.setItem(sessionCookieReadyKey, "true");
		window.localStorage.setItem(themeStorageKey, "dark");
		apiClientMock.post.mockRejectedValueOnce(new Error("network down"));
		vi.spyOn(Math, "random").mockReturnValue(0);

		await enqueueGuestSyncWithMemory([], [], [], [], null);
		await expect(flushGuestSyncQueue({ force: true })).rejects.toThrow("network down");
		markSyncRetry();

		expect(readQueue()).toHaveLength(1);
		expect(readQueue()[0]).toMatchObject({
			attempt: 1,
			next_retry_at: 1_002
		});
	});

	it("keeps newer local settings when an older cloud pull arrives", async () => {
		window.sessionStorage.setItem(sessionCookieReadyKey, "true");
		window.localStorage.setItem(themeStorageKey, "dark");
		window.localStorage.setItem(fontStorageKey, "inter");
		window.localStorage.setItem(localeStorageKey, "th");
		window.localStorage.setItem(backgroundImageUrlStorageKey, "https://example.com/local.png");
		window.localStorage.setItem(
			syncMetaStorageKey,
			JSON.stringify({
				"settings.theme": 3_000,
				"settings.font": 3_000,
				"settings.locale": 3_000,
				"settings.backgroundImageUrl": 3_000
			})
		);
		apiClientMock.get.mockResolvedValueOnce({
			data: {
				next_cursor: 2_500,
				items: [
					{
						item_id: "settings.theme",
						item_type: "setting",
						updated_at: 2_000,
						deleted_at: null,
						payload: { key: "theme", value: "light" }
					},
					{
						item_id: "settings.font",
						item_type: "setting",
						updated_at: 2_001,
						deleted_at: null,
						payload: { key: "font", value: "itim" }
					},
					{
						item_id: "settings.locale",
						item_type: "setting",
						updated_at: 2_002,
						deleted_at: null,
						payload: { key: "locale", value: "en" }
					},
					{
						item_id: "settings.backgroundImageUrl",
						item_type: "setting",
						updated_at: 2_003,
						deleted_at: null,
						payload: { key: "backgroundImageUrl", value: "https://example.com/cloud.png" }
					}
				]
			}
		});
		const onLocaleChange = vi.fn();
		const onBackgroundImageUrlChange = vi.fn();
		const onThemeChange = vi.fn();
		const onFontChange = vi.fn();

		await pullSyncChanges(onLocaleChange, onBackgroundImageUrlChange, onThemeChange, onFontChange);

		expect(window.localStorage.getItem(themeStorageKey)).toBe("dark");
		expect(window.localStorage.getItem(fontStorageKey)).toBe("inter");
		expect(window.localStorage.getItem(localeStorageKey)).toBe("th");
		expect(window.localStorage.getItem(backgroundImageUrlStorageKey)).toBe(
			"https://example.com/local.png"
		);
		expect(onThemeChange).not.toHaveBeenCalled();
		expect(onFontChange).not.toHaveBeenCalled();
		expect(onLocaleChange).not.toHaveBeenCalled();
		expect(onBackgroundImageUrlChange).not.toHaveBeenCalled();
	});

	it("pulls tombstones and removes cached chat and memory items", async () => {
		window.sessionStorage.setItem(sessionCookieReadyKey, "true");
		window.localStorage.setItem(
			memoryFactsCacheKey,
			JSON.stringify([
				{
					id: "fact-1",
					characterId: "aiko",
					content: "Likes tea",
					confidence: "0.8",
					sourceChatId: "chat-1",
					updatedAt: "20"
				}
			])
		);
		window.localStorage.setItem(
			chatSessionsCacheKey,
			JSON.stringify([
				{
					id: "chat-1",
					characterId: "aiko",
					createdAt: "10",
					updatedAt: "20",
					lastMessage: "hello"
				}
			])
		);
		window.localStorage.setItem(
			chatMessagesCacheKey,
			JSON.stringify([
				{
					id: "message-1",
					chatId: "chat-1",
					author: "user",
					text: "hello",
					createdAt: "21",
					time: "12:00",
					updatedAt: "21"
				}
			])
		);
		markMemoryFactDeleted("fact-local-delete");
		markChatMessagesDeleted("chat-local-delete", ["message-local-delete"]);
		apiClientMock.get.mockResolvedValueOnce({
			data: {
				next_cursor: 4_000,
				items: [
					{
						item_id: "memory.fact.fact-1",
						item_type: "memory_fact",
						updated_at: 3_001,
						deleted_at: 3_001,
						payload: {}
					},
					{
						item_id: "chat.session.chat-1",
						item_type: "chat_session",
						updated_at: 3_002,
						deleted_at: 3_002,
						payload: {}
					},
					{
						item_id: "chat.message.chat-1.message-1",
						item_type: "chat_message",
						updated_at: 3_003,
						deleted_at: 3_003,
						payload: {}
					}
				]
			}
		});

		await pullSyncChanges();

		expect(readMemoryFactsCache()).toEqual([]);
		expect(readChatSessionsCache()).toEqual([]);
		expect(readChatMessagesCache("chat-1")).toEqual([]);
		expect(window.localStorage.getItem(syncCursorStorageKey)).toBe("4000");
	});
});
