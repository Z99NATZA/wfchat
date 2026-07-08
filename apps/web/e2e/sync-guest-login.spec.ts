import { expect, type Page, test } from "@playwright/test";
import {
	FakeRemoteSyncState,
	guestAuthState,
	mockBaseAppApis,
	mockGoogleIdentityScript,
	mockGuestToRegisteredAppApis,
	readLocalStorageJson,
	registeredAuthState,
	seedBrowserState,
	storageKeys
} from "./helpers/syncE2eHelpers";

type E2eQueuedOperation = {
	attempt: number;
	next_retry_at: number;
	items: Array<{
		item_id: string;
		item_type: string;
		updated_at: number;
		deleted_at: number | null;
		payload: Record<string, string>;
	}>;
};

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
	await expect
		.poll(() => readLocalStorageJson<unknown[]>(page, storageKeys.syncQueue))
		.toEqual([]);
	await expect
		.poll(() =>
			readLocalStorageJson<{ user: { id: string } | null; hasPendingGuestSync: boolean }>(
				page,
				storageKeys.authState
			)
		)
		.toMatchObject({
			user: { id: "user-e2e" },
			hasPendingGuestSync: false
		});
	await expect
		.poll(() => page.evaluate((key) => window.localStorage.getItem(key), storageKeys.theme))
		.toBe("dark");
});

test("failed Sync now preview keeps queued setting and records retry metadata", async ({
	page
}) => {
	const localThemeUpdatedAt = 1_780_325_800;
	const syncServer = new FakeRemoteSyncState();
	syncServer.failNextPreview();

	await seedBrowserState(page, {
		authState: registeredAuthState(),
		sessionCookieReady: true,
		localStorage: {
			[storageKeys.theme]: "dark",
			[storageKeys.syncMeta]: JSON.stringify({
				"settings.theme": localThemeUpdatedAt
			}),
			[storageKeys.syncQueue]: "[]"
		}
	});
	await mockBaseAppApis(page, { syncServer });

	await page.goto("/chat");
	await expect(page.getByText("Aiko").first()).toBeVisible();
	await page.locator("button:has(svg.lucide-user)").click();
	await expect(page.getByRole("heading", { name: "Profile", exact: true })).toBeVisible();

	const beforeSyncNowSeconds = Math.floor(Date.now() / 1000);
	await page.getByRole("button", { name: "Sync now" }).click();

	await expect.poll(() => syncServer.previewRequests.length).toBeGreaterThanOrEqual(1);
	await expect.poll(() => syncServer.commitRequests.length).toBe(0);
	await expectQueuedThemeRetry(page, beforeSyncNowSeconds, localThemeUpdatedAt);
});

test("failed Sync now commit keeps queued setting and records retry metadata", async ({ page }) => {
	const localThemeUpdatedAt = 1_780_325_850;
	const syncServer = new FakeRemoteSyncState();
	syncServer.failNextCommit();

	await seedBrowserState(page, {
		authState: registeredAuthState(),
		sessionCookieReady: true,
		localStorage: {
			[storageKeys.theme]: "dark",
			[storageKeys.syncMeta]: JSON.stringify({
				"settings.theme": localThemeUpdatedAt
			}),
			[storageKeys.syncQueue]: "[]"
		}
	});
	await mockBaseAppApis(page, { syncServer });

	await page.goto("/chat");
	await expect(page.getByText("Aiko").first()).toBeVisible();
	await page.locator("button:has(svg.lucide-user)").click();
	await expect(page.getByRole("heading", { name: "Profile", exact: true })).toBeVisible();

	const beforeSyncNowSeconds = Math.floor(Date.now() / 1000);
	await page.getByRole("button", { name: "Sync now" }).click();

	await expect.poll(() => syncServer.previewRequests.length).toBeGreaterThanOrEqual(1);
	await expect.poll(() => syncServer.commitRequests.length).toBeGreaterThanOrEqual(1);
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
	await expectQueuedThemeRetry(page, beforeSyncNowSeconds, localThemeUpdatedAt);
});

async function expectQueuedThemeRetry(
	page: Page,
	beforeSyncNowSeconds: number,
	localThemeUpdatedAt: number
) {
	await expect
		.poll(async () => {
			const queue = await readLocalStorageJson<E2eQueuedOperation[]>(
				page,
				storageKeys.syncQueue
			);
			return queue?.length ?? 0;
		})
		.toBe(1);
	const queuedOperations = await readLocalStorageJson<E2eQueuedOperation[]>(
		page,
		storageKeys.syncQueue
	);
	expect(queuedOperations).not.toBeNull();
	const [operation] = queuedOperations ?? [];
	if (!operation) {
		throw new Error("expected failed sync operation to remain queued");
	}
	expect(operation.attempt).toBe(1);
	expect(operation.next_retry_at).toBeGreaterThan(beforeSyncNowSeconds);
	expect(operation.items).toContainEqual(
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
}
