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

async function isDocumentDark(page: Page) {
	return page.evaluate(() => document.documentElement.classList.contains("dark"));
}
