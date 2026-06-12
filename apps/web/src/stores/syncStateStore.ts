import { readStorageItem, writeStorageItem } from "@/services/storageService";

const SYNC_META_STORAGE_KEY = "wfchat-sync-meta";

type SyncMeta = Record<string, number>;

function readMeta(): SyncMeta {
	const raw = readStorageItem(SYNC_META_STORAGE_KEY);
	if (!raw) {
		return {};
	}
	try {
		return JSON.parse(raw) as SyncMeta;
	} catch {
		return {};
	}
}

function writeMeta(meta: SyncMeta) {
	writeStorageItem(SYNC_META_STORAGE_KEY, JSON.stringify(meta));
}

export function touchSyncKey(key: string): number {
	const timestamp = Math.floor(Date.now() / 1000);
	const meta = readMeta();
	meta[key] = timestamp;
	writeMeta(meta);
	return timestamp;
}

export function recordSyncUpdatedAt(key: string, timestamp: number): void {
	const normalizedTimestamp = Math.floor(timestamp);
	if (!Number.isFinite(normalizedTimestamp) || normalizedTimestamp <= 0) {
		return;
	}

	const meta = readMeta();
	meta[key] = normalizedTimestamp;
	writeMeta(meta);
}

export function readSyncUpdatedAt(key: string): number | null {
	const meta = readMeta();
	const value = meta[key];
	return typeof value === "number" && value > 0 ? value : null;
}
