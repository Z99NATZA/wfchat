import { expect, test } from "@playwright/test";
import {
	FakeRemoteSyncState,
	guestAuthState,
	mockGoogleIdentityScript,
	mockGuestToRegisteredAppApis,
	readLocalStorageJson,
	seedBrowserState,
	storageKeys
} from "./helpers/syncE2eHelpers";

test("guest login can commit local setting through Sync now", async ({ page }) => {
	const localThemeUpdatedAt = 1_780_325_500;
	const syncServer = new FakeRemoteSyncState();

	await seedBrowserState(page, {
		authState: guestAuthState(),
		sessionCookieReady: true,
		localStorage: {
			[storageKeys.theme]: "dark",
			[storageKeys.syncMeta]: JSON.stringify({
				"settings.theme": localThemeUpdatedAt
			}),
			[storageKeys.syncQueue]: "[]"
		}
	});
	await mockGoogleIdentityScript(page);
	const authMock = await mockGuestToRegisteredAppApis(page, { syncServer });

	await page.goto("/chat");
	await expect(page.getByText("Aiko").first()).toBeVisible();

	await page.locator("button:has(svg.lucide-user)").click();
	await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
	await page.getByTestId("fake-google-login").click();

	await expect.poll(() => authMock.isRegistered()).toBe(true);
	await expect(page.getByRole("heading", { name: "Profile", exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Sync now" }).click();

	await expect.poll(() => syncServer.previewRequests.length).toBeGreaterThanOrEqual(1);
	await expect.poll(() => syncServer.commitRequests.length).toBeGreaterThanOrEqual(1);

	const committedItems = syncServer.commitRequests.at(-1)?.items ?? [];
	const themeItem = committedItems.find((item) => item.item_id === "settings.theme");
	expect(themeItem).toMatchObject({
		item_type: "setting",
		updated_at: localThemeUpdatedAt,
		deleted_at: null,
		payload: {
			key: "theme",
			value: "dark"
		}
	});
	await expect.poll(() => readLocalStorageJson<unknown[]>(page, storageKeys.syncQueue)).toEqual([]);
	await expect
		.poll(() => readLocalStorageJson<{ user: { id: string } | null; hasPendingGuestSync: boolean }>(
			page,
			storageKeys.authState
		))
		.toMatchObject({
			user: { id: "user-e2e" },
			hasPendingGuestSync: false
		});
	await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), storageKeys.theme)).toBe("dark");
});
