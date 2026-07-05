import { expect, test } from "@playwright/test";
import {
	FakeRemoteSyncState,
	expectLocalStorageItem,
	expectSyncCursor,
	mockBaseAppApis,
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
