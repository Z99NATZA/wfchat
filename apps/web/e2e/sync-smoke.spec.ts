import { expect, test, type Page } from "@playwright/test";
import {
	FakeRemoteSyncState,
	expectLocalStorageItem,
	expectSyncCursor,
	mockBaseAppApis,
	readLocalStorageJson,
	registeredAuthState,
	seedBrowserState,
	storageKeys
} from "./helpers/syncE2eHelpers";

test("authenticated app boot pulls remote sync settings into local state", async ({ page }) => {
	const remoteUpdatedAt = 1_780_325_400;
	const syncServer = new FakeRemoteSyncState([
		{
			item_id: "settings.theme",
			item_type: "setting",
			updated_at: remoteUpdatedAt,
			deleted_at: null,
			payload: {
				key: "theme",
				value: "dark"
			}
		}
	]);

	await seedBrowserState(page, {
		authState: registeredAuthState(),
		sessionCookieReady: true,
		localStorage: {
			[storageKeys.theme]: "light",
			[storageKeys.syncCursor]: "0",
			[storageKeys.syncQueue]: "[]"
		}
	});
	await mockBaseAppApis(page, { syncServer });

	await page.goto("/chat");

	await expect(page.getByText("Aiko").first()).toBeVisible();
	await expectLocalStorageItem(page, storageKeys.theme, "dark");
	await expectSyncCursor(page, remoteUpdatedAt);
	await expect
		.poll(() => syncServer.changesRequests.length)
		.toBeGreaterThanOrEqual(1);
});

test("authenticated app boot does not apply stale pulled theme setting", async ({ page }) => {
	const remoteUpdatedAt = 1_780_325_450;
	const localUpdatedAt = remoteUpdatedAt + 100;
	const syncServer = new FakeRemoteSyncState([
		{
			item_id: "settings.theme",
			item_type: "setting",
			updated_at: remoteUpdatedAt,
			deleted_at: null,
			payload: {
				key: "theme",
				value: "light"
			}
		}
	]);

	await seedBrowserState(page, {
		authState: registeredAuthState(),
		sessionCookieReady: true,
		localStorage: {
			[storageKeys.theme]: "dark",
			[storageKeys.syncMeta]: JSON.stringify({
				"settings.theme": localUpdatedAt
			}),
			[storageKeys.syncCursor]: "0",
			[storageKeys.syncQueue]: "[]"
		}
	});
	await mockBaseAppApis(page, { syncServer });

	await page.goto("/chat");

	await expect(page.getByText("Aiko").first()).toBeVisible();
	await expectLocalStorageItem(page, storageKeys.theme, "dark");
	await expectSyncCursor(page, remoteUpdatedAt);
	await expect
		.poll(() => readLocalStorageJson<Record<string, number>>(page, storageKeys.syncMeta))
		.toMatchObject({
			"settings.theme": localUpdatedAt
		});
	await expect.poll(() => isDocumentDark(page)).toBe(true);
});

test("authenticated app boot applies pulled chat tombstones to local cache", async ({ page }) => {
	const deletedChatId = "11111111-1111-4111-8111-111111111111";
	const deletedChatLastMessage = "Tombstoned cached chat should not return";
	const remoteUpdatedAt = 1_780_325_700;
	const seededChatSession = {
		id: deletedChatId,
		characterId: "aiko",
		createdAt: String(remoteUpdatedAt - 200),
		updatedAt: String(remoteUpdatedAt - 100),
		lastMessage: deletedChatLastMessage
	};
	const syncServer = new FakeRemoteSyncState([
		{
			item_id: `chat.session.${deletedChatId}`,
			item_type: "chat_session",
			updated_at: remoteUpdatedAt,
			deleted_at: remoteUpdatedAt,
			payload: {}
		}
	]);

	await seedBrowserState(page, {
		authState: registeredAuthState(),
		sessionCookieReady: true,
		localStorage: {
			[storageKeys.syncCursor]: "0",
			[storageKeys.syncQueue]: "[]",
			[storageKeys.chatSessionsCache]: JSON.stringify([seededChatSession])
		}
	});
	await page.route(`**/api/chats/${deletedChatId}`, async (route) => {
		await route.fulfill({
			status: 404,
			contentType: "application/json",
			body: JSON.stringify({ error: "not_found" })
		});
	});
	await mockBaseAppApis(page, { syncServer });

	await page.goto("/chat");
	await expect(page.getByText("Aiko").first()).toBeVisible();

	await expect
		.poll(async () => {
			const sessions = await readLocalStorageJson<Array<{ id?: string }>>(
				page,
				storageKeys.chatSessionsCache
			);
			return sessions?.some((session) => session.id === deletedChatId) ?? false;
		})
		.toBe(false);
	await expectSyncCursor(page, remoteUpdatedAt);
	await expect(page.getByText(deletedChatLastMessage)).toHaveCount(0);

	await page.reload();
	await expect(page.getByText("Aiko").first()).toBeVisible();
	await expect(page.getByText(deletedChatLastMessage)).toHaveCount(0);
});

test("authenticated app boot applies pulled memory tombstones to local cache", async ({ page }) => {
	const deletedFactId = "memory-fact-tombstone";
	const deletedSummaryId = "memory-summary-tombstone";
	const keptFactId = "memory-fact-kept";
	const keptSummaryId = "memory-summary-kept";
	const remoteUpdatedAt = 1_780_325_750;
	const seededFacts = [
		{
			id: deletedFactId,
			characterId: "aiko",
			content: "Deleted memory fact should leave local cache.",
			confidence: "0.8",
			sourceChatId: "",
			updatedAt: String(remoteUpdatedAt - 200)
		},
		{
			id: keptFactId,
			characterId: "aiko",
			content: "Kept memory fact remains local.",
			confidence: "0.9",
			sourceChatId: "",
			updatedAt: String(remoteUpdatedAt - 100)
		}
	];
	const seededSummaries = [
		{
			id: deletedSummaryId,
			characterId: "aiko",
			summary: "Deleted memory summary should leave local cache.",
			sourceChatId: "",
			createdAt: String(remoteUpdatedAt - 200)
		},
		{
			id: keptSummaryId,
			characterId: "aiko",
			summary: "Kept memory summary remains local.",
			sourceChatId: "",
			createdAt: String(remoteUpdatedAt - 100)
		}
	];
	const syncServer = new FakeRemoteSyncState([
		{
			item_id: `memory.fact.${deletedFactId}`,
			item_type: "memory_fact",
			updated_at: remoteUpdatedAt,
			deleted_at: remoteUpdatedAt,
			payload: {}
		},
		{
			item_id: `memory.summary.${deletedSummaryId}`,
			item_type: "memory_summary",
			updated_at: remoteUpdatedAt + 1,
			deleted_at: remoteUpdatedAt + 1,
			payload: {}
		}
	]);

	await seedBrowserState(page, {
		authState: registeredAuthState(),
		sessionCookieReady: true,
		localStorage: {
			[storageKeys.syncCursor]: "0",
			[storageKeys.syncQueue]: "[]",
			[storageKeys.memoryFactsCache]: JSON.stringify(seededFacts),
			[storageKeys.memorySummariesCache]: JSON.stringify(seededSummaries)
		}
	});
	await mockBaseAppApis(page, { syncServer });

	await page.goto("/chat");
	await expect(page.getByText("Aiko").first()).toBeVisible();

	await expect.poll(() => hasStorageEntry(page, storageKeys.memoryFactsCache, deletedFactId)).toBe(false);
	await expect.poll(() => hasStorageEntry(page, storageKeys.memorySummariesCache, deletedSummaryId)).toBe(false);
	await expect.poll(() => hasStorageEntry(page, storageKeys.memoryFactsCache, keptFactId)).toBe(true);
	await expect.poll(() => hasStorageEntry(page, storageKeys.memorySummariesCache, keptSummaryId)).toBe(true);
	await expectSyncCursor(page, remoteUpdatedAt + 1);

	await page.reload();
	await expect(page.getByText("Aiko").first()).toBeVisible();
	await expect.poll(() => hasStorageEntry(page, storageKeys.memoryFactsCache, deletedFactId)).toBe(false);
	await expect.poll(() => hasStorageEntry(page, storageKeys.memorySummariesCache, deletedSummaryId)).toBe(false);
});

test("authenticated browser online event flushes pending queue and pulls remote changes", async ({ page }) => {
	const localThemeUpdatedAt = 1_780_325_900;
	const remoteBackgroundUpdatedAt = localThemeUpdatedAt + 10;
	const remoteBackgroundUrl = "https://example.test/e2e-online-background.png";
	const syncServer = new FakeRemoteSyncState();

	await seedBrowserState(page, {
		authState: registeredAuthState(),
		sessionCookieReady: true,
		localStorage: {
			[storageKeys.theme]: "light",
			[storageKeys.syncMeta]: JSON.stringify({
				"settings.theme": localThemeUpdatedAt
			}),
			[storageKeys.syncCursor]: "0",
			[storageKeys.syncQueue]: "[]"
		}
	});
	await mockBaseAppApis(page, { syncServer });

	await page.goto("/chat");
	await expect(page.getByText("Aiko").first()).toBeVisible();
	await expect.poll(() => syncServer.changesRequests.length).toBeGreaterThanOrEqual(1);

	const baselinePreviewCount = syncServer.previewRequests.length;
	const baselineCommitCount = syncServer.commitRequests.length;
	const baselineChangesCount = syncServer.changesRequests.length;
	syncServer.upsertItem({
		item_id: "settings.backgroundImageUrl",
		item_type: "setting",
		updated_at: remoteBackgroundUpdatedAt,
		deleted_at: null,
		payload: {
			key: "backgroundImageUrl",
			value: remoteBackgroundUrl
		}
	});
	await page.evaluate(
		({ queueKey, themeKey, queue }) => {
			window.localStorage.setItem(themeKey, "dark");
			window.localStorage.setItem(queueKey, JSON.stringify(queue));
		},
		{
			queueKey: storageKeys.syncQueue,
			themeKey: storageKeys.theme,
			queue: [
				{
					operation_id: "e2e-online-sync-operation",
					attempt: 0,
					next_retry_at: 0,
					items: [
						{
							item_id: "settings.theme",
							item_type: "setting",
							updated_at: localThemeUpdatedAt,
							deleted_at: null,
							payload: {
								key: "theme",
								value: "dark"
							}
						}
					]
				}
			]
		}
	);

	await page.evaluate(() => window.dispatchEvent(new Event("online")));

	await expect.poll(() => syncServer.previewRequests.length).toBeGreaterThan(baselinePreviewCount);
	await expect.poll(() => syncServer.commitRequests.length).toBeGreaterThan(baselineCommitCount);
	await expect.poll(() => syncServer.changesRequests.length).toBeGreaterThan(baselineChangesCount);
	await expect.poll(() => readLocalStorageJson<unknown[]>(page, storageKeys.syncQueue)).toEqual([]);
	const committedItems = syncServer.commitRequests.at(-1)?.items ?? [];
	expect(committedItems).toContainEqual(
		expect.objectContaining({
			item_id: "settings.theme",
			item_type: "setting",
			updated_at: localThemeUpdatedAt,
			deleted_at: null,
			payload: {
				key: "theme",
				value: "dark"
			}
		})
	);
	await expectLocalStorageItem(page, storageKeys.backgroundImageUrl, remoteBackgroundUrl);
	await expectSyncCursor(page, remoteBackgroundUpdatedAt);
});

async function isDocumentDark(page: Page) {
	return page.evaluate(() => document.documentElement.classList.contains("dark"));
}

async function hasStorageEntry(page: Page, key: string, id: string) {
	const entries = await readLocalStorageJson<Array<{ id?: string }>>(page, key);
	return entries?.some((entry) => entry.id === id) ?? false;
}
