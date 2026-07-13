import { expect, test, type Page, type Route } from "@playwright/test";
import {
	FakeFollowUpState,
	mockBaseAppApis,
	registeredAuthState,
	seedBrowserState
} from "./helpers/syncE2eHelpers";

const followUpId = "44444444-4444-4444-8444-444444444444";
const chatId = "55555555-5555-4555-8555-555555555555";
const followUpContent = "You mentioned your job interview earlier. How is that going?";

test("meaningful New Chat follow-up is shown without creating a chat", async ({ page }) => {
	const followUpServer = new FakeFollowUpState(candidate());
	let createRequests = 0;
	page.on("request", (request) => {
		if (request.method() === "POST" && request.url().endsWith("/api/personas/aiko/chats")) {
			createRequests += 1;
		}
	});
	await openFollowUpPage(page, followUpServer);

	await expect(page.getByText(followUpContent, { exact: true })).toBeVisible();
	expect(createRequests).toBe(0);
	await expect(page).toHaveURL(/\/chat\/?$/);
});

test("reply persists the follow-up opening and remains coherent after reload", async ({ page }) => {
	const followUpServer = new FakeFollowUpState(candidate());
	await seedRegisteredPage(page);
	await mockBaseAppApis(page, { followUpServer });
	await mockChatReplyFlow(page, followUpServer);

	await page.goto("/chat");
	await expect(page.getByText(followUpContent, { exact: true })).toBeVisible();
	await page.getByPlaceholder("Message Aiko", { exact: true }).fill("It went well");
	await page.getByRole("button", { name: "Send message", exact: true }).click();

	await expect(page).toHaveURL(`/chat/${chatId}`);
	await expect(page.getByText("It went well", { exact: true })).toBeVisible();
	await expect(assistantReply(page)).toBeVisible();

	await page.reload();
	await expect(page.getByText(followUpContent, { exact: true })).toBeVisible();
	await expect(page.getByText("It went well", { exact: true })).toBeVisible();
	await expect(assistantReply(page)).toBeVisible();
});

test("ineligible memory produces no follow-up or generic fallback", async ({ page }) => {
	const followUpServer = new FakeFollowUpState(null);
	await openFollowUpPage(page, followUpServer);

	await expect.poll(() => followUpServer.claimRequests.length).toBeGreaterThanOrEqual(1);
	await expect(page.getByText(followUpContent, { exact: true })).toHaveCount(0);
	await expect(page.getByPlaceholder("Message Aiko", { exact: true })).toBeVisible();
});

test("same owner cannot receive a second follow-up in another browser", async ({ browser }) => {
	const followUpServer = new FakeFollowUpState(candidate());
	const firstContext = await browser.newContext();
	const firstPage = await firstContext.newPage();
	await openFollowUpPage(firstPage, followUpServer);
	await expect(firstPage.getByText(followUpContent, { exact: true })).toBeVisible();

	const secondContext = await browser.newContext();
	const secondPage = await secondContext.newPage();
	await openFollowUpPage(secondPage, followUpServer);
	await expect
		.poll(() => new Set(followUpServer.claimRequests.map((request) => request.claimKey)).size)
		.toBe(2);
	await expect(secondPage.getByText(followUpContent, { exact: true })).toHaveCount(0);

	await firstContext.close();
	await secondContext.close();
});

test("a no-candidate visit does not consume the follow-up window", async ({ page }) => {
	const followUpServer = new FakeFollowUpState(null);
	await openFollowUpPage(page, followUpServer);
	await expect.poll(() => followUpServer.claimRequests.length).toBeGreaterThanOrEqual(1);
	await expect(page.getByText(followUpContent, { exact: true })).toHaveCount(0);

	followUpServer.setCandidate(candidate());
	await page.reload();

	await expect(page.getByText(followUpContent, { exact: true })).toBeVisible();
});

test("follow-up memory from another owner or character is never shown", async ({ page }) => {
	const followUpServer = new FakeFollowUpState({
		...candidate(),
		characterId: "other",
		ownerId: "another-user"
	});
	await openFollowUpPage(page, followUpServer);

	await expect.poll(() => followUpServer.claimRequests.length).toBeGreaterThanOrEqual(1);
	await expect(page.getByText(followUpContent, { exact: true })).toHaveCount(0);
});

test("follow-up API failure leaves normal New Chat sending usable", async ({ page }) => {
	const followUpServer = new FakeFollowUpState(candidate());
	followUpServer.fail();
	await seedRegisteredPage(page);
	await mockBaseAppApis(page, { followUpServer });
	await mockChatReplyFlow(page, followUpServer, false);

	await page.goto("/chat");
	await expect(page.getByPlaceholder("Message Aiko", { exact: true })).toBeVisible();
	await page.getByPlaceholder("Message Aiko", { exact: true }).fill("Hello normally");
	await page.getByRole("button", { name: "Send message", exact: true }).click();

	await expect(page).toHaveURL(`/chat/${chatId}`);
	await expect(page.getByText("Hello normally", { exact: true })).toBeVisible();
	await expect(assistantReply(page)).toBeVisible();
});

function assistantReply(page: Page) {
	return page.locator("p").filter({ hasText: /^I'm glad it went well\.$/ });
}

function candidate() {
	return {
		id: followUpId,
		characterId: "aiko",
		content: followUpContent,
		createdAt: 1_784_000_000,
		ownerId: "user-e2e"
	};
}

async function seedRegisteredPage(page: Page) {
	await seedBrowserState(page, {
		authState: registeredAuthState(),
		sessionCookieReady: true,
		localStorage: {
			"wfchat-sync-cursor": "0",
			"wfchat-sync-queue": "[]"
		}
	});
}

async function openFollowUpPage(page: Page, followUpServer: FakeFollowUpState) {
	await seedRegisteredPage(page);
	await mockBaseAppApis(page, { followUpServer });
	await page.goto("/chat");
	await expect(page.getByText("Aiko").first()).toBeVisible();
}

async function mockChatReplyFlow(
	page: Page,
	followUpServer: FakeFollowUpState,
	includeOpening = true
) {
	let persistedMessages: ApiMessage[] = [];
	await page.route("**/api/personas/aiko/chats", async (route) => {
		if (route.request().method() === "GET") {
			await fulfillJson(route, persistedMessages.length > 0 ? [chat(persistedMessages)] : []);
			return;
		}

		const body = route.request().postDataJSON() as { follow_up_id?: string } | null;
		const claimed = body?.follow_up_id ? followUpServer.claimed(body.follow_up_id) : null;
		persistedMessages = includeOpening && claimed ? [openingMessage(claimed.content)] : [];
		await fulfillJson(route, chat(persistedMessages));
	});
	await page.route(`**/api/chats/${chatId}`, async (route) => {
		await fulfillJson(route, chat(persistedMessages));
	});
	await page.route(`**/api/chats/${chatId}/messages/stream`, async (route) => {
		const body = route.request().postDataJSON() as { content?: string };
		const userMessage = message(
			"66666666-6666-4666-8666-666666666666",
			"user",
			body.content ?? ""
		);
		const assistantMessage = message(
			"77777777-7777-4777-8777-777777777777",
			"assistant",
			"I'm glad it went well."
		);
		persistedMessages = [...persistedMessages, userMessage, assistantMessage];
		const done = {
			chat_id: chatId,
			user_message: userMessage,
			assistant_message: assistantMessage,
			messages: persistedMessages
		};
		await route.fulfill({
			status: 200,
			contentType: "text/event-stream",
			body:
				`event: message_start\ndata: ${JSON.stringify({ chat_id: chatId, persona_id: "aiko" })}\n\n` +
				`event: message_done\ndata: ${JSON.stringify(done)}\n\n`
		});
	});
}

type ApiMessage = {
	id: string;
	role: "user" | "assistant";
	content: string;
	attachments: never[];
	created_at: number;
};

function openingMessage(content: string): ApiMessage {
	return message("88888888-8888-4888-8888-888888888888", "assistant", content);
}

function message(id: string, role: ApiMessage["role"], content: string): ApiMessage {
	return { id, role, content, attachments: [], created_at: 1_784_000_001 };
}

function chat(messages: ApiMessage[]) {
	return {
		id: chatId,
		character_id: "aiko",
		ai_profile_id: "aiko_default",
		messages,
		created_at: 1_784_000_000,
		updated_at: 1_784_000_001
	};
}

async function fulfillJson(route: Route, body: unknown) {
	await route.fulfill({
		status: 200,
		contentType: "application/json",
		body: JSON.stringify(body)
	});
}
