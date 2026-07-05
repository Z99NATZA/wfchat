import { expect, test, type Browser, type Page } from "@playwright/test";
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

test("second browser pulls a setting committed by the first browser", async ({ browser }) => {
	const syncServer = new FakeRemoteSyncState();
	const remoteThemeUpdatedAt = 1_780_325_600;

	const firstPage = await newRegisteredSyncPage(browser, syncServer, {
		[storageKeys.theme]: "dark",
		[storageKeys.syncMeta]: JSON.stringify({
			"settings.theme": remoteThemeUpdatedAt
		}),
		[storageKeys.syncQueue]: "[]"
	});

	await firstPage.goto("/chat");
	await expect(firstPage.getByText("Aiko").first()).toBeVisible();
	await firstPage.locator("button:has(svg.lucide-user)").click();
	await expect(firstPage.getByRole("heading", { name: "Profile", exact: true })).toBeVisible();
	await firstPage.getByRole("button", { name: "Sync now" }).click();

	await expect.poll(() => syncServer.commitRequests.length).toBeGreaterThanOrEqual(1);
	const committedTheme = syncServer.commitRequests
		.at(-1)
		?.items.find((item) => item.item_id === "settings.theme");
	expect(committedTheme).toMatchObject({
		updated_at: remoteThemeUpdatedAt,
		payload: {
			key: "theme",
			value: "dark"
		}
	});
	await expect.poll(() => readLocalStorageJson<unknown[]>(firstPage, storageKeys.syncQueue)).toEqual([]);

	const secondPage = await newRegisteredSyncPage(browser, syncServer, {
		[storageKeys.theme]: "light",
		[storageKeys.syncMeta]: JSON.stringify({
			"settings.theme": remoteThemeUpdatedAt - 100
		}),
		[storageKeys.syncCursor]: "0",
		[storageKeys.syncQueue]: "[]"
	});

	await secondPage.goto("/chat");
	await expect(secondPage.getByText("Aiko").first()).toBeVisible();

	await expectLocalStorageItem(secondPage, storageKeys.theme, "dark");
	await expectSyncCursor(secondPage, remoteThemeUpdatedAt);
	await expect.poll(() => isDocumentDark(secondPage)).toBe(true);

	await firstPage.context().close();
	await secondPage.context().close();
});

async function newRegisteredSyncPage(
	browser: Browser,
	syncServer: FakeRemoteSyncState,
	localStorage: Record<string, string>
): Promise<Page> {
	const context = await browser.newContext();
	const page = await context.newPage();
	await seedBrowserState(page, {
		authState: registeredAuthState(),
		sessionCookieReady: true,
		localStorage
	});
	await mockBaseAppApis(page, { syncServer });
	return page;
}

async function isDocumentDark(page: Page) {
	return page.evaluate(() => document.documentElement.classList.contains("dark"));
}
