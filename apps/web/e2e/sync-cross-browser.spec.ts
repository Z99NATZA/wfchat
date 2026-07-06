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

test("second browser pulls background, chat, and memory cache fixtures", async ({ browser }) => {
	const remoteBaseUpdatedAt = 1_780_325_900;
	const backgroundImageUrl =
		"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Crect%20width%3D%2216%22%20height%3D%2216%22%20fill%3D%22%230072ce%22%2F%3E%3C%2Fsvg%3E";
	const chatId = "22222222-2222-4222-8222-222222222222";
	const chatMessageId = "message-cross-browser-cache";
	const chatLastMessage = "Remote cached chat from browser one";
	const memoryFactContent = "Aiko remembers the remote cache fact.";
	const memorySummaryText = "A remote memory summary was pulled into this browser.";
	const syncServer = new FakeRemoteSyncState([
		{
			item_id: "settings.backgroundImageUrl",
			item_type: "setting",
			updated_at: remoteBaseUpdatedAt,
			deleted_at: null,
			payload: {
				key: "backgroundImageUrl",
				value: backgroundImageUrl
			}
		},
		{
			item_id: `chat.session.${chatId}`,
			item_type: "chat_session",
			updated_at: remoteBaseUpdatedAt + 1,
			deleted_at: null,
			payload: {
				id: chatId,
				characterId: "aiko",
				createdAt: String(remoteBaseUpdatedAt - 200),
				updatedAt: String(remoteBaseUpdatedAt + 1),
				lastMessage: chatLastMessage
			}
		},
		{
			item_id: `chat.message.${chatId}.${chatMessageId}`,
			item_type: "chat_message",
			updated_at: remoteBaseUpdatedAt + 2,
			deleted_at: null,
			payload: {
				id: chatMessageId,
				chatId,
				author: "companion",
				text: chatLastMessage,
				createdAt: String(remoteBaseUpdatedAt + 2),
				time: "10:00"
			}
		},
		{
			item_id: "memory.fact.remote-fact",
			item_type: "memory_fact",
			updated_at: remoteBaseUpdatedAt + 3,
			deleted_at: null,
			payload: {
				id: "remote-fact",
				characterId: "aiko",
				content: memoryFactContent,
				confidence: "0.9",
				sourceChatId: chatId,
				updatedAt: String(remoteBaseUpdatedAt + 3)
			}
		},
		{
			item_id: "memory.summary.remote-summary",
			item_type: "memory_summary",
			updated_at: remoteBaseUpdatedAt + 4,
			deleted_at: null,
			payload: {
				id: "remote-summary",
				characterId: "aiko",
				summary: memorySummaryText,
				sourceChatId: chatId,
				createdAt: String(remoteBaseUpdatedAt + 4)
			}
		}
	]);

	const secondPage = await newRegisteredSyncPage(browser, syncServer, {
		[storageKeys.backgroundImageUrl]: "",
		[storageKeys.syncCursor]: "0",
		[storageKeys.syncQueue]: "[]",
		[storageKeys.chatSessionsCache]: "[]",
		[storageKeys.chatMessagesCache]: "[]",
		[storageKeys.memoryFactsCache]: "[]",
		[storageKeys.memorySummariesCache]: "[]"
	});
	await secondPage.setViewportSize({ width: 1440, height: 900 });

	await secondPage.goto("/chat");
	await expect(secondPage.getByText("Aiko").first()).toBeVisible();

	await expectLocalStorageItem(secondPage, storageKeys.backgroundImageUrl, backgroundImageUrl);
	await expectSyncCursor(secondPage, remoteBaseUpdatedAt + 4);
	await expect.poll(() => readLocalStorageJson<Record<string, number>>(
		secondPage,
		storageKeys.syncMeta
	)).toMatchObject({
		"settings.backgroundImageUrl": remoteBaseUpdatedAt
	});
	await expect.poll(() => hasStorageEntry(secondPage, storageKeys.chatSessionsCache, chatId)).toBe(true);
	await expect.poll(() => hasStorageEntry(secondPage, storageKeys.chatMessagesCache, chatMessageId)).toBe(true);
	await expect.poll(() => hasStorageEntry(secondPage, storageKeys.memoryFactsCache, "remote-fact")).toBe(true);
	await expect
		.poll(() => hasStorageEntry(secondPage, storageKeys.memorySummariesCache, "remote-summary"))
		.toBe(true);
	await expect(secondPage.getByText(chatLastMessage)).toBeVisible();
	await expect(secondPage.getByText(memoryFactContent)).toBeVisible();
	await expect(secondPage.getByText(memorySummaryText)).toBeVisible();

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

async function hasStorageEntry(page: Page, key: string, id: string) {
	const entries = await readLocalStorageJson<Array<{ id?: string }>>(page, key);
	return entries?.some((entry) => entry.id === id) ?? false;
}
