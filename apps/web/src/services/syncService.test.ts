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
	compactItems,
	compactQueue,
	computeNextRetryAt,
	enqueueGuestSyncWithMemory,
	flushGuestSyncQueue,
	markSyncRetry,
	markChatMessagesDeleted,
	markMemoryFactDeleted,
	pullSyncChanges,
	readChatMessagesCache,
	readChatSessionsCache,
	readMemoryFactsCache,
	readMemorySummariesCache,
	syncLocalDeletesNow,
	trimQueue,
	type SyncItem,
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
const memorySummariesCacheKey = "wfchat-memory-summaries-cache";
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

function writeQueue(queue: SyncQueueOperation[]) {
	window.localStorage.setItem(syncQueueStorageKey, JSON.stringify(queue));
}

function readQueue(): SyncQueueOperation[] {
	return JSON.parse(
		window.localStorage.getItem(syncQueueStorageKey) ?? "[]"
	) as SyncQueueOperation[];
}

function readQueuedItems(): SyncItem[] {
	return readQueue()[0]?.items ?? [];
}

function findQueuedItem(itemId: string): SyncItem | undefined {
	return readQueuedItems().find((item) => item.item_id === itemId);
}

beforeEach(() => {
	installLocalStorageMock();
	window.localStorage.clear();
	window.sessionStorage.clear();
	apiClientMock.get.mockReset();
	apiClientMock.post.mockReset();
	vi.restoreAllMocks();
});

afterEach(() => {
	vi.restoreAllMocks();
	window.localStorage.clear();
	window.sessionStorage.clear();
});

describe("syncService queue helpers", () => {
	it("keeps newest item per item_id", () => {
		const items: SyncItem[] = [
			{
				item_id: "settings.theme",
				item_type: "setting",
				updated_at: 10,
				payload: { value: "light" }
			},
			{
				item_id: "settings.theme",
				item_type: "setting",
				updated_at: 20,
				payload: { value: "dark" }
			},
			{
				item_id: "settings.font",
				item_type: "setting",
				updated_at: 12,
				payload: { value: "inter" }
			}
		];

		const result = compactItems(items);
		expect(result).toHaveLength(2);
		expect(result.find((item) => item.item_id === "settings.theme")?.payload.value).toBe(
			"dark"
		);
	});

	it("compacts every operation in queue", () => {
		const queue: SyncQueueOperation[] = [
			{
				operation_id: "a",
				attempt: 0,
				next_retry_at: 0,
				items: [
					{ item_id: "x", item_type: "setting", updated_at: 1, payload: { value: "1" } },
					{ item_id: "x", item_type: "setting", updated_at: 3, payload: { value: "3" } }
				]
			}
		];

		const result = compactQueue(queue);
		expect(result[0].items).toHaveLength(1);
		expect(result[0].items[0].updated_at).toBe(3);
	});

	it("normalizes sync timestamps to integers", () => {
		const items: SyncItem[] = [
			{
				item_id: "chat.session.a",
				item_type: "chat_session",
				updated_at: 1780339701.549,
				deleted_at: 1780339702.75,
				payload: { id: "a" }
			}
		];

		const result = compactItems(items);
		expect(result[0].updated_at).toBe(1780339701);
		expect(result[0].deleted_at).toBe(1780339702);
	});

	it("caps queue length to 20", () => {
		const queue: SyncQueueOperation[] = Array.from({ length: 30 }, (_, index) => ({
			operation_id: `op-${index}`,
			attempt: 0,
			next_retry_at: 0,
			items: []
		}));

		const result = trimQueue(queue);
		expect(result).toHaveLength(20);
		expect(result[0].operation_id).toBe("op-10");
	});

	it("computes retry timestamp with bounded jitter", () => {
		vi.spyOn(Math, "random").mockReturnValue(0.9);
		const result = computeNextRetryAt(3, 100);
		expect(result).toBeGreaterThanOrEqual(108);
		expect(result).toBeLessThanOrEqual(110);
		vi.restoreAllMocks();
	});

	it("flushes the first queued operation and removes it after commit succeeds", async () => {
		window.sessionStorage.setItem(sessionCookieReadyKey, "true");
		writeQueue([
			{
				operation_id: "op-1",
				attempt: 0,
				next_retry_at: 0,
				items: [
					{
						item_id: "settings.theme",
						item_type: "setting",
						updated_at: 10,
						deleted_at: null,
						payload: { key: "theme", value: "dark" }
					}
				]
			}
		]);
		apiClientMock.post
			.mockResolvedValueOnce({ data: { to_create: 1, to_update: 0, conflicts: 0 } })
			.mockResolvedValueOnce({
				data: {
					operation_id: "op-1",
					merged_count: 1,
					conflict_count: 0,
					committed_at: 11
				}
			});

		const result = await flushGuestSyncQueue({ force: true });

		expect(apiClientMock.post).toHaveBeenNthCalledWith(1, "/api/sync/preview", {
			items: [
				{
					item_id: "settings.theme",
					item_type: "setting",
					updated_at: 10,
					deleted_at: null,
					payload: { key: "theme", value: "dark" }
				}
			]
		});
		expect(apiClientMock.post).toHaveBeenNthCalledWith(2, "/api/sync/commit", {
			operation_id: "op-1",
			items: [
				{
					item_id: "settings.theme",
					item_type: "setting",
					updated_at: 10,
					deleted_at: null,
					payload: { key: "theme", value: "dark" }
				}
			]
		});
		expect(result?.merged_count).toBe(1);
		expect(readQueue()).toEqual([]);
	});

	it("keeps a failed operation queued and marks retry metadata", async () => {
		window.sessionStorage.setItem(sessionCookieReadyKey, "true");
		writeQueue([
			{
				operation_id: "op-1",
				attempt: 0,
				next_retry_at: 0,
				items: [
					{
						item_id: "settings.font",
						item_type: "setting",
						updated_at: 20,
						deleted_at: null,
						payload: { key: "font", value: "inter" }
					}
				]
			}
		]);
		apiClientMock.post.mockRejectedValueOnce(new Error("network down"));
		vi.spyOn(Date, "now").mockReturnValue(100_000);
		vi.spyOn(Math, "random").mockReturnValue(0);

		await expect(flushGuestSyncQueue({ force: true })).rejects.toThrow("network down");
		expect(readQueue()[0]).toMatchObject({
			operation_id: "op-1",
			attempt: 0,
			next_retry_at: 0
		});

		markSyncRetry();

		expect(readQueue()[0]).toMatchObject({
			operation_id: "op-1",
			attempt: 1,
			next_retry_at: 102
		});
	});

	it("enqueues settings, memory, chat sessions, and active chat messages", async () => {
		vi.spyOn(Date, "now").mockReturnValue(100_000);
		vi.spyOn(Math, "random").mockReturnValue(0.5);
		window.localStorage.setItem(themeStorageKey, "dark");
		window.localStorage.setItem(fontStorageKey, "inter");
		window.localStorage.setItem(localeStorageKey, "th");
		window.localStorage.setItem(backgroundImageUrlStorageKey, "https://example.com/bg.png");
		const memoryFacts: MemoryFact[] = [
			{
				id: "fact-1",
				characterId: "aiko",
				content: "Likes tea",
				confidence: 0.8,
				sourceChatId: "chat-1",
				createdAt: 10,
				updatedAt: 20
			}
		];
		const memorySummaries: MemorySummary[] = [
			{
				id: "summary-1",
				characterId: "aiko",
				summary: "Met the user",
				sourceChatId: "chat-1",
				createdAt: 21
			}
		];
		const sessions: ChatSessionSummary[] = [
			{
				id: "chat-1",
				characterId: "aiko",
				createdAt: 29,
				updatedAt: 30,
				lastMessage: "hello"
			},
			{
				id: "empty-chat",
				characterId: "aiko",
				createdAt: 31,
				updatedAt: 32,
				lastMessage: " "
			}
		];
		const messages: ChatMessage[] = [
			{
				id: "message-1",
				author: "user",
				text: "hello",
				createdAt: 31,
				time: "12:00"
			}
		];

		await enqueueGuestSyncWithMemory(
			memoryFacts,
			memorySummaries,
			sessions,
			messages,
			"chat-1"
		);

		expect(readQueue()).toHaveLength(1);
		expect(readQueue()[0]).toMatchObject({
			operation_id: "sync-100000-8",
			attempt: 0,
			next_retry_at: 0
		});
		expect(findQueuedItem("settings.theme")).toMatchObject({
			item_type: "setting",
			updated_at: 100,
			payload: { key: "theme", value: "dark" }
		});
		expect(findQueuedItem("settings.font")).toMatchObject({
			item_type: "setting",
			updated_at: 100,
			payload: { key: "font", value: "inter" }
		});
		expect(findQueuedItem("settings.locale")).toMatchObject({
			item_type: "setting",
			updated_at: 100,
			payload: { key: "locale", value: "th" }
		});
		expect(findQueuedItem("settings.backgroundImageUrl")).toMatchObject({
			item_type: "setting",
			updated_at: 100,
			payload: { key: "backgroundImageUrl", value: "https://example.com/bg.png" }
		});
		expect(findQueuedItem("memory.fact.fact-1")).toMatchObject({
			item_type: "memory_fact",
			updated_at: 20,
			payload: {
				id: "fact-1",
				characterId: "aiko",
				content: "Likes tea",
				confidence: "0.8",
				sourceChatId: "chat-1",
				updatedAt: "20"
			}
		});
		expect(findQueuedItem("memory.summary.summary-1")).toMatchObject({
			item_type: "memory_summary",
			updated_at: 21,
			payload: {
				id: "summary-1",
				characterId: "aiko",
				summary: "Met the user",
				sourceChatId: "chat-1",
				createdAt: "21"
			}
		});
		expect(findQueuedItem("chat.session.chat-1")).toMatchObject({
			item_type: "chat_session",
			updated_at: 30,
			payload: {
				id: "chat-1",
				characterId: "aiko",
				createdAt: "29",
				updatedAt: "30",
				lastMessage: "hello"
			}
		});
		expect(findQueuedItem("chat.session.empty-chat")).toBeUndefined();
		expect(findQueuedItem("chat.message.chat-1.message-1")).toMatchObject({
			item_type: "chat_message",
			updated_at: 100,
			payload: {
				id: "message-1",
				chatId: "chat-1",
				author: "user",
				text: "hello",
				createdAt: "31",
				time: "12:00"
			}
		});
	});

	it("does not enqueue chat messages when there is no active chat", async () => {
		vi.spyOn(Date, "now").mockReturnValue(200_000);
		vi.spyOn(Math, "random").mockReturnValue(0.25);
		const sessions: ChatSessionSummary[] = [
			{
				id: "chat-1",
				characterId: "aiko",
				createdAt: 29,
				updatedAt: 30,
				lastMessage: "hello"
			}
		];
		const messages: ChatMessage[] = [
			{
				id: "message-1",
				author: "user",
				text: "hello",
				createdAt: 31,
				time: "12:00"
			}
		];

		await enqueueGuestSyncWithMemory([], [], sessions, messages, null);

		expect(findQueuedItem("chat.session.chat-1")).toBeDefined();
		expect(readQueuedItems().some((item) => item.item_type === "chat_message")).toBe(false);
	});

	it("enqueues recorded memory and chat tombstones with empty payloads", async () => {
		vi.spyOn(Date, "now").mockReturnValue(300_000);
		vi.spyOn(Math, "random").mockReturnValue(0);

		markMemoryFactDeleted("fact-1");
		markChatMessagesDeleted("chat-1", ["message-1"]);
		await enqueueGuestSyncWithMemory([], [], [], [], null);

		expect(findQueuedItem("memory.fact.fact-1")).toMatchObject({
			item_type: "memory_fact",
			updated_at: 300,
			deleted_at: 300,
			payload: {}
		});
		expect(findQueuedItem("chat.message.chat-1.message-1")).toMatchObject({
			item_type: "chat_message",
			updated_at: 300,
			deleted_at: 300,
			payload: {}
		});
	});

	it("flushes local delete tombstones immediately when possible", async () => {
		vi.spyOn(Date, "now").mockReturnValue(350_000);
		vi.spyOn(Math, "random").mockReturnValue(0);
		window.sessionStorage.setItem(sessionCookieReadyKey, "true");
		markMemoryFactDeleted("fact-1");
		markChatMessagesDeleted("chat-1", ["message-1"]);
		apiClientMock.post
			.mockResolvedValueOnce({ data: { to_create: 0, to_update: 2, conflicts: 0 } })
			.mockResolvedValueOnce({
				data: {
					operation_id: "sync-350000-0",
					merged_count: 2,
					conflict_count: 0,
					committed_at: 351
				}
			});

		await syncLocalDeletesNow();

		expect(apiClientMock.post).toHaveBeenNthCalledWith(1, "/api/sync/preview", {
			items: expect.arrayContaining([
				expect.objectContaining({
					item_id: "memory.fact.fact-1",
					item_type: "memory_fact",
					deleted_at: 350
				}),
				expect.objectContaining({
					item_id: "chat.message.chat-1.message-1",
					item_type: "chat_message",
					deleted_at: 350
				})
			])
		});
		expect(readQueue()).toEqual([]);
	});

	it("pulls cloud changes into settings and memory/chat caches", async () => {
		window.sessionStorage.setItem(sessionCookieReadyKey, "true");
		window.localStorage.setItem(syncCursorStorageKey, "5");
		const onLocaleChange = vi.fn();
		const onBackgroundImageUrlChange = vi.fn();
		const onThemeChange = vi.fn();
		const onFontChange = vi.fn();
		apiClientMock.get.mockResolvedValueOnce({
			data: {
				next_cursor: 50,
				items: [
					{
						item_id: "settings.theme",
						item_type: "setting",
						updated_at: 10,
						deleted_at: null,
						payload: { key: "theme", value: "dark" }
					},
					{
						item_id: "settings.font",
						item_type: "setting",
						updated_at: 11,
						deleted_at: null,
						payload: { key: "font", value: "jetbrains-mono" }
					},
					{
						item_id: "settings.locale",
						item_type: "setting",
						updated_at: 12,
						deleted_at: null,
						payload: { key: "locale", value: "th" }
					},
					{
						item_id: "settings.backgroundImageUrl",
						item_type: "setting",
						updated_at: 13,
						deleted_at: null,
						payload: { key: "backgroundImageUrl", value: "https://example.com/bg.png" }
					},
					{
						item_id: "memory.fact.fact-1",
						item_type: "memory_fact",
						updated_at: 20,
						deleted_at: null,
						payload: {
							id: "fact-1",
							characterId: "aiko",
							content: "Likes tea",
							confidence: "0.8",
							sourceChatId: "chat-1",
							updatedAt: "20"
						}
					},
					{
						item_id: "memory.summary.summary-1",
						item_type: "memory_summary",
						updated_at: 21,
						deleted_at: null,
						payload: {
							id: "summary-1",
							characterId: "aiko",
							summary: "Met the user",
							sourceChatId: "chat-1",
							createdAt: "21"
						}
					},
					{
						item_id: "chat.session.chat-1",
						item_type: "chat_session",
						updated_at: 30,
						deleted_at: null,
						payload: {
							id: "chat-1",
							characterId: "aiko",
							createdAt: "29",
							updatedAt: "30",
							lastMessage: "hello"
						}
					},
					{
						item_id: "chat.message.chat-1.message-1",
						item_type: "chat_message",
						updated_at: 31,
						deleted_at: null,
						payload: {
							id: "message-1",
							chatId: "chat-1",
							author: "user",
							text: "hello",
							createdAt: "31",
							time: "12:00"
						}
					}
				]
			}
		});

		const appliedCount = await pullSyncChanges(
			onLocaleChange,
			onBackgroundImageUrlChange,
			onThemeChange,
			onFontChange
		);

		expect(apiClientMock.get).toHaveBeenCalledWith("/api/sync/changes", {
			params: { cursor: 5, limit: 100 }
		});
		expect(appliedCount).toBe(8);
		expect(window.localStorage.getItem(themeStorageKey)).toBe("dark");
		expect(JSON.parse(window.localStorage.getItem(syncMetaStorageKey) ?? "{}")).toMatchObject({
			"settings.theme": 10,
			"settings.font": 11,
			"settings.locale": 12,
			"settings.backgroundImageUrl": 13
		});
		expect(window.localStorage.getItem(fontStorageKey)).toBe("jetbrains-mono");
		expect(window.localStorage.getItem(localeStorageKey)).toBe("th");
		expect(window.localStorage.getItem(backgroundImageUrlStorageKey)).toBe(
			"https://example.com/bg.png"
		);
		expect(onLocaleChange).toHaveBeenCalledWith("th");
		expect(onBackgroundImageUrlChange).toHaveBeenCalledWith("https://example.com/bg.png");
		expect(onThemeChange).toHaveBeenCalledWith("dark");
		expect(onFontChange).toHaveBeenCalledWith("jetbrains-mono");
		expect(readMemoryFactsCache()).toEqual([
			expect.objectContaining({ id: "fact-1", characterId: "aiko", content: "Likes tea" })
		]);
		expect(readMemorySummariesCache()).toEqual([
			expect.objectContaining({
				id: "summary-1",
				characterId: "aiko",
				summary: "Met the user"
			})
		]);
		expect(readChatSessionsCache()).toEqual([
			expect.objectContaining({ id: "chat-1", characterId: "aiko", lastMessage: "hello" })
		]);
		expect(readChatMessagesCache("chat-1")).toEqual([
			expect.objectContaining({ id: "message-1", author: "user", text: "hello" })
		]);
		expect(window.localStorage.getItem(syncCursorStorageKey)).toBe("50");
	});

	it("does not let stale cloud theme overwrite a newer local theme", async () => {
		window.sessionStorage.setItem(sessionCookieReadyKey, "true");
		window.localStorage.setItem(themeStorageKey, "dark");
		window.localStorage.setItem(syncMetaStorageKey, JSON.stringify({ "settings.theme": 20 }));
		const onThemeChange = vi.fn();
		apiClientMock.get.mockResolvedValueOnce({
			data: {
				next_cursor: 50,
				items: [
					{
						item_id: "settings.theme",
						item_type: "setting",
						updated_at: 10,
						deleted_at: null,
						payload: { key: "theme", value: "light" }
					}
				]
			}
		});

		const appliedCount = await pullSyncChanges(undefined, undefined, onThemeChange);

		expect(appliedCount).toBe(1);
		expect(window.localStorage.getItem(themeStorageKey)).toBe("dark");
		expect(onThemeChange).not.toHaveBeenCalled();
		expect(window.localStorage.getItem(syncCursorStorageKey)).toBe("50");
	});

	it("does not let stale cloud settings overwrite newer local settings", async () => {
		window.sessionStorage.setItem(sessionCookieReadyKey, "true");
		window.localStorage.setItem(fontStorageKey, "inter");
		window.localStorage.setItem(localeStorageKey, "en");
		window.localStorage.setItem(backgroundImageUrlStorageKey, "https://example.com/local.png");
		window.localStorage.setItem(
			syncMetaStorageKey,
			JSON.stringify({
				"settings.font": 20,
				"settings.locale": 20,
				"settings.backgroundImageUrl": 20
			})
		);
		const onLocaleChange = vi.fn();
		const onBackgroundImageUrlChange = vi.fn();
		const onFontChange = vi.fn();
		apiClientMock.get.mockResolvedValueOnce({
			data: {
				next_cursor: 50,
				items: [
					{
						item_id: "settings.font",
						item_type: "setting",
						updated_at: 10,
						deleted_at: null,
						payload: { key: "font", value: "itim" }
					},
					{
						item_id: "settings.locale",
						item_type: "setting",
						updated_at: 11,
						deleted_at: null,
						payload: { key: "locale", value: "th" }
					},
					{
						item_id: "settings.backgroundImageUrl",
						item_type: "setting",
						updated_at: 12,
						deleted_at: null,
						payload: {
							key: "backgroundImageUrl",
							value: "https://example.com/cloud.png"
						}
					}
				]
			}
		});

		const appliedCount = await pullSyncChanges(
			onLocaleChange,
			onBackgroundImageUrlChange,
			undefined,
			onFontChange
		);

		expect(appliedCount).toBe(3);
		expect(window.localStorage.getItem(fontStorageKey)).toBe("inter");
		expect(window.localStorage.getItem(localeStorageKey)).toBe("en");
		expect(window.localStorage.getItem(backgroundImageUrlStorageKey)).toBe(
			"https://example.com/local.png"
		);
		expect(onFontChange).not.toHaveBeenCalled();
		expect(onLocaleChange).not.toHaveBeenCalled();
		expect(onBackgroundImageUrlChange).not.toHaveBeenCalled();
		expect(window.localStorage.getItem(syncCursorStorageKey)).toBe("50");
	});

	it("applies tombstones by removing memory and chat cache entries", async () => {
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
			memorySummariesCacheKey,
			JSON.stringify([
				{
					id: "summary-1",
					characterId: "aiko",
					summary: "Met the user",
					sourceChatId: "chat-1",
					createdAt: "21"
				}
			])
		);
		window.localStorage.setItem(
			chatSessionsCacheKey,
			JSON.stringify([
				{
					id: "chat-1",
					characterId: "aiko",
					createdAt: "29",
					updatedAt: "30",
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
					createdAt: "31",
					time: "12:00",
					updatedAt: "31"
				}
			])
		);
		apiClientMock.get.mockResolvedValueOnce({
			data: {
				next_cursor: 60,
				items: [
					{
						item_id: "memory.fact.fact-1",
						item_type: "memory_fact",
						updated_at: 40,
						deleted_at: 40,
						payload: {}
					},
					{
						item_id: "memory.summary.summary-1",
						item_type: "memory_summary",
						updated_at: 41,
						deleted_at: 41,
						payload: {}
					},
					{
						item_id: "chat.session.chat-1",
						item_type: "chat_session",
						updated_at: 42,
						deleted_at: 42,
						payload: {}
					},
					{
						item_id: "chat.message.chat-1.message-1",
						item_type: "chat_message",
						updated_at: 43,
						deleted_at: 43,
						payload: {}
					}
				]
			}
		});

		const appliedCount = await pullSyncChanges();

		expect(appliedCount).toBe(4);
		expect(readMemoryFactsCache()).toEqual([]);
		expect(readMemorySummariesCache()).toEqual([]);
		expect(readChatSessionsCache()).toEqual([]);
		expect(readChatMessagesCache("chat-1")).toEqual([]);
		expect(window.localStorage.getItem(syncCursorStorageKey)).toBe("60");
	});
});
