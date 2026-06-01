import { apiClient } from "@/services/apiClient";
import { readStorageItem, writeStorageItem } from "@/services/storageService";
import { readSyncUpdatedAt } from "@/stores/syncStateStore";

const sessionStorageKey = "wfchat.sessionId";
const localeStorageKey = "wfchat.locale";
const themeStorageKey = "wfchat-theme";
const fontStorageKey = "wfchat-font";

type ApiSessionResponse = {
	session_id: string;
};

type SyncPreviewResponse = {
	to_create: number;
	to_update: number;
	conflicts: number;
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

export async function runGuestSync(): Promise<SyncCommitResponse> {
	const sessionId = await ensureGuestSession();
	const items = buildSyncItems();

	await apiClient.post<SyncPreviewResponse>(
		"/api/sync/preview",
		{ items },
		{ headers: sessionHeaders(sessionId) }
	);

	const operationId = `sync-${Date.now()}-${Math.random().toString(16).slice(2)}`;
	const commit = await apiClient.post<SyncCommitResponse>(
		"/api/sync/commit",
		{ operation_id: operationId, items },
		{ headers: sessionHeaders(sessionId) }
	);

	return commit.data;
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
