import { apiClient } from "@/services/apiClient";
import { readStorageItem, writeStorageItem } from "@/services/storageService";

const sessionStorageKey = "wfchat.sessionId";

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
	item_type: string;
	updated_at: number;
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
	return [
		{
			item_type: "appearance_settings",
			updated_at: Math.floor(Date.now() / 1000)
		}
	];
}
