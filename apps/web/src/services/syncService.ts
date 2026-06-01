import { apiClient } from "@/services/apiClient";
import { readStorageItem, writeStorageItem } from "@/services/storageService";
import { readSyncUpdatedAt } from "@/stores/syncStateStore";
import { applyThemeToDocument, persistTheme } from "@/stores/themeStore";
import { applyFontToDocument, persistFont } from "@/stores/fontStore";
import type { MemoryFact, MemorySummary } from "@/types/chat";
import type { AppFont } from "@/types/font";
import type { Theme } from "@/types/theme";

const sessionStorageKey = "wfchat.sessionId";
const syncQueueStorageKey = "wfchat-sync-queue";
const syncCursorStorageKey = "wfchat-sync-cursor";
const localeStorageKey = "wfchat.locale";
const themeStorageKey = "wfchat-theme";
const fontStorageKey = "wfchat-font";
const memoryFactsCacheKey = "wfchat-memory-facts-cache";
const memorySummariesCacheKey = "wfchat-memory-summaries-cache";
const memoryDeletesCacheKey = "wfchat-memory-deletes-cache";
const maxRetryDelaySeconds = 300;

type ApiSessionResponse = {
	session_id: string;
};

type SyncPreviewResponse = {
	to_create: number;
	to_update: number;
	conflicts: number;
};

type SyncChangesResponse = {
	items: SyncItem[];
	next_cursor: number;
};

type SyncCommitResponse = {
	operation_id: string;
	merged_count: number;
	conflict_count: number;
	committed_at: number;
};

type SyncItem = {
	item_id: string;
	item_type: string;
	updated_at: number;
	deleted_at?: number | null;
	payload: Record<string, string>;
};

type SyncQueueOperation = {
	operation_id: string;
	items: SyncItem[];
	attempt: number;
	next_retry_at: number;
};

type CachedMemoryFact = {
	id: string;
	characterId: string;
	content: string;
	confidence: string;
	sourceChatId: string;
	updatedAt: string;
};

type CachedMemorySummary = {
	id: string;
	characterId: string;
	summary: string;
	sourceChatId: string;
	createdAt: string;
};

type CachedMemoryDelete = {
	item_id: string;
	item_type: "memory_fact" | "memory_summary";
	deleted_at: number;
};

export async function enqueueGuestSync(): Promise<void> {
	const items = buildSyncItems();
	if (items.length === 0) {
		return;
	}
	const queue = readSyncQueue();
	queue.push({
		operation_id: `sync-${Date.now()}-${Math.random().toString(16).slice(2)}`,
		items,
		attempt: 0,
		next_retry_at: 0
	});
	writeSyncQueue(queue);
}

export async function enqueueGuestSyncWithMemory(
	memoryFacts: MemoryFact[],
	memorySummaries: MemorySummary[]
): Promise<void> {
	const items = buildSyncItems().concat(buildMemorySyncItems(memoryFacts, memorySummaries, readMemoryDeletesCache()));
	if (items.length === 0) {
		return;
	}
	const queue = readSyncQueue();
	queue.push({
		operation_id: `sync-${Date.now()}-${Math.random().toString(16).slice(2)}`,
		items,
		attempt: 0,
		next_retry_at: 0
	});
	writeSyncQueue(queue);
}

export function markMemoryFactDeleted(id: string): void {
	upsertMemoryDelete({
		item_id: `memory.fact.${id}`,
		item_type: "memory_fact",
		deleted_at: Math.floor(Date.now() / 1000)
	});
}

export function markMemorySummaryDeleted(id: string): void {
	upsertMemoryDelete({
		item_id: `memory.summary.${id}`,
		item_type: "memory_summary",
		deleted_at: Math.floor(Date.now() / 1000)
	});
}

export async function flushGuestSyncQueue(): Promise<SyncCommitResponse | null> {
	const queue = readSyncQueue();
	if (queue.length === 0) {
		return null;
	}

	const sessionId = await ensureGuestSession();
	const now = Math.floor(Date.now() / 1000);
	const operation = queue[0];
	if (operation.next_retry_at > now) {
		return null;
	}

	await apiClient.post<SyncPreviewResponse>(
		"/api/sync/preview",
		{ items: operation.items },
		{ headers: sessionHeaders(sessionId) }
	);

	const commit = await apiClient.post<SyncCommitResponse>(
		"/api/sync/commit",
		{ operation_id: operation.operation_id, items: operation.items },
		{ headers: sessionHeaders(sessionId) }
	);
	queue.shift();
	writeSyncQueue(queue);

	return commit.data;
}

export function markSyncRetry(): void {
	const queue = readSyncQueue();
	if (queue.length === 0) {
		return;
	}
	const operation = queue[0];
	operation.attempt += 1;
	const baseDelay = Math.min(2 ** operation.attempt, maxRetryDelaySeconds);
	const jitter = Math.floor(Math.random() * 3);
	operation.next_retry_at = Math.floor(Date.now() / 1000) + baseDelay + jitter;
	queue[0] = operation;
	writeSyncQueue(queue);
}

export function hasPendingSyncQueue(): boolean {
	return readSyncQueue().length > 0;
}

export async function pullSyncChanges(
	onLocaleChange?: (locale: "en" | "th") => void
): Promise<number> {
	const sessionId = await ensureGuestSession();
	const cursor = Number(readStorageItem(syncCursorStorageKey) ?? "0");
	const response = await apiClient.get<SyncChangesResponse>("/api/sync/changes", {
		params: { cursor, limit: 100 },
		headers: sessionHeaders(sessionId)
	});

	for (const item of response.data.items) {
		applySyncItem(item, onLocaleChange);
	}

	writeStorageItem(syncCursorStorageKey, String(response.data.next_cursor));
	return response.data.items.length;
}

export function readMemoryFactsCache(): MemoryFact[] {
	return readJsonArray(memoryFactsCacheKey)
		.map((item) => item as unknown as CachedMemoryFact)
		.filter((item) => Boolean(item.id && item.characterId && item.content))
		.map((item) => ({
			id: item.id,
			characterId: item.characterId,
			content: item.content,
			confidence: Number(item.confidence) || 0.7,
			sourceChatId: item.sourceChatId || null,
			createdAt: Number(item.updatedAt) || 0,
			updatedAt: Number(item.updatedAt) || 0
		}));
}

export function readMemorySummariesCache(): MemorySummary[] {
	return readJsonArray(memorySummariesCacheKey)
		.map((item) => item as unknown as CachedMemorySummary)
		.filter((item) => Boolean(item.id && item.characterId && item.summary))
		.map((item) => ({
			id: item.id,
			characterId: item.characterId,
			summary: item.summary,
			sourceChatId: item.sourceChatId || null,
			createdAt: Number(item.createdAt) || 0
		}));
}

async function ensureGuestSession(): Promise<string> {
	const existingSessionId = readStorageItem(sessionStorageKey);

	if (existingSessionId) {
		return existingSessionId;
	}

	const response = await apiClient.post<ApiSessionResponse>("/api/auth/guest");
	writeStorageItem(sessionStorageKey, response.data.session_id);

	return response.data.session_id;
}

function sessionHeaders(sessionId: string) {
	return {
		"X-WFChat-Session": sessionId
	};
}

function buildSyncItems(): SyncItem[] {
	const now = Math.floor(Date.now() / 1000);
	const locale = readStorageItem(localeStorageKey);
	const theme = readStorageItem(themeStorageKey);
	const font = readStorageItem(fontStorageKey);
	const items: SyncItem[] = [];

	if (theme) {
		items.push({
			item_id: "settings.theme",
			item_type: "setting",
			updated_at: readSyncUpdatedAt("settings.theme") ?? now,
			deleted_at: null,
			payload: { key: "theme", value: theme }
		});
	}
	if (font) {
		items.push({
			item_id: "settings.font",
			item_type: "setting",
			updated_at: readSyncUpdatedAt("settings.font") ?? now,
			deleted_at: null,
			payload: { key: "font", value: font }
		});
	}
	if (locale) {
		items.push({
			item_id: "settings.locale",
			item_type: "setting",
			updated_at: readSyncUpdatedAt("settings.locale") ?? now,
			deleted_at: null,
			payload: { key: "locale", value: locale }
		});
	}

	return items;
}

function applySyncItem(item: SyncItem, onLocaleChange?: (locale: "en" | "th") => void) {
	if (item.deleted_at && item.deleted_at > 0) {
		if (item.item_type === "memory_fact") {
			removeMemoryFactFromCache(item.item_id);
			return;
		}
		if (item.item_type === "memory_summary") {
			removeMemorySummaryFromCache(item.item_id);
			return;
		}
	}

	if (item.item_type === "memory_fact") {
		upsertMemoryFactCache(item);
		return;
	}

	if (item.item_type === "memory_summary") {
		upsertMemorySummaryCache(item);
		return;
	}

	const key = item.payload?.key;
	const value = item.payload?.value;
	if (item.item_type !== "setting" || !key || !value) {
		return;
	}

	if (key === "theme" && (value === "light" || value === "dark")) {
		persistTheme(value as Theme);
		applyThemeToDocument(value as Theme);
		return;
	}

	if (key === "font" && (value === "inter" || value === "itim" || value === "jetbrains-mono")) {
		persistFont(value as AppFont);
		applyFontToDocument(value as AppFont);
		return;
	}

	if (key === "locale" && (value === "en" || value === "th")) {
		writeStorageItem(localeStorageKey, value);
		onLocaleChange?.(value);
	}
}

function buildMemorySyncItems(
	memoryFacts: MemoryFact[],
	memorySummaries: MemorySummary[],
	deletes: CachedMemoryDelete[]
): SyncItem[] {
	const factItems = memoryFacts.map((fact) => ({
		item_id: `memory.fact.${fact.id}`,
		item_type: "memory_fact",
		updated_at: fact.updatedAt,
		deleted_at: null,
		payload: {
			id: fact.id,
			characterId: fact.characterId,
			content: fact.content,
			confidence: String(fact.confidence),
			sourceChatId: fact.sourceChatId ?? "",
			updatedAt: String(fact.updatedAt)
		}
	}));

	const summaryItems = memorySummaries.map((summary) => ({
		item_id: `memory.summary.${summary.id}`,
		item_type: "memory_summary",
		updated_at: summary.createdAt,
		deleted_at: null,
		payload: {
			id: summary.id,
			characterId: summary.characterId,
			summary: summary.summary,
			sourceChatId: summary.sourceChatId ?? "",
			createdAt: String(summary.createdAt)
		}
	}));

	const deleteItems = deletes.map((item) => ({
		item_id: item.item_id,
		item_type: item.item_type,
		updated_at: item.deleted_at,
		deleted_at: item.deleted_at,
		payload: {}
	}));

	return [...factItems, ...summaryItems, ...deleteItems];
}

function upsertMemoryFactCache(item: SyncItem) {
	const facts = readJsonArray(memoryFactsCacheKey);
	const id = item.payload?.id;
	if (!id) {
		return;
	}
	const next = facts.filter((entry) => entry?.id !== id);
	next.push(item.payload);
	writeStorageItem(memoryFactsCacheKey, JSON.stringify(next));
	removeMemoryDelete(item.item_id);
}

function upsertMemorySummaryCache(item: SyncItem) {
	const summaries = readJsonArray(memorySummariesCacheKey);
	const id = item.payload?.id;
	if (!id) {
		return;
	}
	const next = summaries.filter((entry) => entry?.id !== id);
	next.push(item.payload);
	writeStorageItem(memorySummariesCacheKey, JSON.stringify(next));
	removeMemoryDelete(item.item_id);
}

function removeMemoryFactFromCache(itemId: string) {
	const id = itemId.replace("memory.fact.", "");
	const facts = readJsonArray(memoryFactsCacheKey);
	writeStorageItem(
		memoryFactsCacheKey,
		JSON.stringify(facts.filter((entry) => entry?.id !== id))
	);
}

function removeMemorySummaryFromCache(itemId: string) {
	const id = itemId.replace("memory.summary.", "");
	const summaries = readJsonArray(memorySummariesCacheKey);
	writeStorageItem(
		memorySummariesCacheKey,
		JSON.stringify(summaries.filter((entry) => entry?.id !== id))
	);
}

function readMemoryDeletesCache(): CachedMemoryDelete[] {
	const raw = readStorageItem(memoryDeletesCacheKey);
	if (!raw) {
		return [];
	}
	try {
		const parsed = JSON.parse(raw) as CachedMemoryDelete[];
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function upsertMemoryDelete(entry: CachedMemoryDelete) {
	const deletes = readMemoryDeletesCache().filter((item) => item.item_id !== entry.item_id);
	deletes.push(entry);
	writeStorageItem(memoryDeletesCacheKey, JSON.stringify(deletes));
}

function removeMemoryDelete(itemId: string) {
	const deletes = readMemoryDeletesCache().filter((item) => item.item_id !== itemId);
	writeStorageItem(memoryDeletesCacheKey, JSON.stringify(deletes));
}

function readJsonArray(key: string): Array<Record<string, string>> {
	const raw = readStorageItem(key);
	if (!raw) {
		return [];
	}
	try {
		const parsed = JSON.parse(raw) as Array<Record<string, string>>;
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function readSyncQueue(): SyncQueueOperation[] {
	const raw = readStorageItem(syncQueueStorageKey);
	if (!raw) {
		return [];
	}
	try {
		const parsed = JSON.parse(raw) as SyncQueueOperation[];
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function writeSyncQueue(queue: SyncQueueOperation[]) {
	writeStorageItem(syncQueueStorageKey, JSON.stringify(queue));
}
