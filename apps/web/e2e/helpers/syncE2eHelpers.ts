import { expect, type Page, type Route } from "@playwright/test";

export const storageKeys = {
	authState: "wfchat-auth-state",
	sessionCookieReady: "wfchat.sessionCookieReady",
	syncQueue: "wfchat-sync-queue",
	syncCursor: "wfchat-sync-cursor",
	syncMeta: "wfchat-sync-meta",
	theme: "wfchat-theme",
	font: "wfchat-font",
	locale: "wfchat.locale",
	backgroundImageUrl: "wfchat.backgroundImageUrl",
	memoryFactsCache: "wfchat-memory-facts-cache",
	memorySummariesCache: "wfchat-memory-summaries-cache",
	memoryDeletesCache: "wfchat-memory-deletes-cache",
	chatSessionsCache: "wfchat-chat-sessions-cache",
	chatMessagesCache: "wfchat-chat-messages-cache"
} as const;

export type E2eAuthUser = {
	id: string;
	name: string;
	email?: string;
	avatarUrl?: string;
	provider: "google";
};

export type E2eAuthState = {
	user: E2eAuthUser | null;
	hasPendingGuestSync: boolean;
};

export type E2eSyncItem = {
	item_id: string;
	item_type: string;
	updated_at: number;
	deleted_at: number | null;
	payload: Record<string, unknown> | null;
};

export type E2eApiSession = {
	user_id: string;
	session_id: string;
	kind: "guest" | "registered" | "admin";
	email?: string | null;
	name?: string | null;
	profile?: {
		display_name: string;
		avatar_url?: string | null;
	} | null;
};

type SeedBrowserStateOptions = {
	authState?: E2eAuthState;
	sessionCookieReady?: boolean;
	localStorage?: Record<string, string>;
	sessionStorage?: Record<string, string>;
};

type MockAppApisOptions = {
	session?: E2eApiSession | (() => E2eApiSession);
	onGoogleLogin?: () => void;
	personaId?: string;
	syncServer?: FakeRemoteSyncState;
	failPersonaLists?: boolean;
};

export class FakeRemoteSyncState {
	private readonly items = new Map<string, E2eSyncItem>();
	private nextPreviewFailureStatus: number | null = null;
	private nextCommitFailureStatus: number | null = null;

	previewRequests: E2eSyncItem[][] = [];
	commitRequests: Array<{ operation_id: string; items: E2eSyncItem[] }> = [];
	changesRequests: Array<{ cursor: number; limit: number }> = [];

	constructor(items: E2eSyncItem[] = []) {
		for (const item of items) {
			this.items.set(item.item_id, item);
		}
	}

	failNextPreview(status = 500) {
		this.nextPreviewFailureStatus = status;
	}

	failNextCommit(status = 500) {
		this.nextCommitFailureStatus = status;
	}

	upsertItem(item: E2eSyncItem) {
		this.items.set(item.item_id, item);
	}

	async routePreview(route: Route) {
		const body = route.request().postDataJSON() as { items?: E2eSyncItem[] };
		const items = body.items ?? [];
		this.previewRequests.push(items);

		if (this.nextPreviewFailureStatus !== null) {
			const status = this.nextPreviewFailureStatus;
			this.nextPreviewFailureStatus = null;
			await route.fulfill({
				status,
				contentType: "application/json",
				body: JSON.stringify({ error: "sync_preview_failed" }),
				headers: {
					"access-control-allow-origin": "*"
				}
			});
			return;
		}

		let toCreate = 0;
		let toUpdate = 0;
		let conflicts = 0;
		for (const item of items) {
			const existing = this.items.get(item.item_id);
			if (!existing) {
				toCreate += 1;
			} else if (item.updated_at >= existing.updated_at) {
				toUpdate += 1;
			} else {
				conflicts += 1;
			}
		}

		await fulfillJson(route, {
			to_create: toCreate,
			to_update: toUpdate,
			conflicts
		});
	}

	async routeCommit(route: Route) {
		const body = route.request().postDataJSON() as {
			operation_id?: string;
			items?: E2eSyncItem[];
		};
		const operationId = body.operation_id ?? "e2e-operation";
		const items = body.items ?? [];
		this.commitRequests.push({ operation_id: operationId, items });

		if (this.nextCommitFailureStatus !== null) {
			const status = this.nextCommitFailureStatus;
			this.nextCommitFailureStatus = null;
			await route.fulfill({
				status,
				contentType: "application/json",
				body: JSON.stringify({ error: "sync_commit_failed" }),
				headers: {
					"access-control-allow-origin": "*"
				}
			});
			return;
		}

		let mergedCount = 0;
		for (const item of items) {
			const existing = this.items.get(item.item_id);
			if (!existing || existing.updated_at <= item.updated_at) {
				this.items.set(item.item_id, item);
				mergedCount += 1;
			}
		}

		await fulfillJson(route, {
			operation_id: operationId,
			merged_count: mergedCount,
			conflict_count: 0,
			committed_at: Math.floor(Date.now() / 1000)
		});
	}

	async routeChanges(route: Route) {
		const url = new URL(route.request().url());
		const cursor = Number(url.searchParams.get("cursor") ?? "0");
		const limit = Number(url.searchParams.get("limit") ?? "100");
		this.changesRequests.push({ cursor, limit });

		const items = [...this.items.values()]
			.filter((item) => item.updated_at > cursor)
			.sort((a, b) => a.updated_at - b.updated_at || a.item_id.localeCompare(b.item_id))
			.slice(0, limit);
		const nextCursor = items.reduce((max, item) => Math.max(max, item.updated_at), cursor);

		await fulfillJson(route, {
			items,
			next_cursor: nextCursor
		});
	}
}

export function registeredAuthState(overrides: Partial<E2eAuthUser> = {}): E2eAuthState {
	return {
		user: {
			id: "user-e2e",
			name: "E2E User",
			email: "e2e@example.test",
			provider: "google",
			...overrides
		},
		hasPendingGuestSync: true
	};
}

export function guestAuthState(): E2eAuthState {
	return {
		user: null,
		hasPendingGuestSync: true
	};
}

export async function seedBrowserState(page: Page, options: SeedBrowserStateOptions = {}) {
	await page.addInitScript(
		({ keys, seed }) => {
			if (seed.authState) {
				window.localStorage.setItem(keys.authState, JSON.stringify(seed.authState));
			}
			for (const [key, value] of Object.entries(seed.localStorage ?? {})) {
				window.localStorage.setItem(key, value);
			}
			if (seed.sessionCookieReady) {
				window.sessionStorage.setItem(keys.sessionCookieReady, "true");
			}
			for (const [key, value] of Object.entries(seed.sessionStorage ?? {})) {
				window.sessionStorage.setItem(key, value);
			}
		},
		{ keys: storageKeys, seed: options }
	);
}

export async function mockBaseAppApis(page: Page, options: MockAppApisOptions = {}) {
	const personaId = options.personaId ?? "aiko";
	const session = options.session ?? registeredApiSession();
	const syncServer = options.syncServer ?? new FakeRemoteSyncState();
	const currentSession = () => (typeof session === "function" ? session() : session);

	await page.route("**/api/auth/me", async (route) => {
		await fulfillJson(route, currentSession());
	});
	await page.route("**/api/auth/google", async (route) => {
		options.onGoogleLogin?.();
		await fulfillJson(route, currentSession());
	});
	await page.route("**/api/auth/logout", async (route) => {
		await fulfillJson(route, guestApiSession());
	});
	await page.route("**/api/chat-ui/config", async (route) => {
		await fulfillJson(route, chatUiConfigFixture(personaId));
	});
	await page.route(`**/api/personas/${personaId}/chats`, async (route) => {
		if (options.failPersonaLists) {
			await fulfillApiUnavailable(route);
			return;
		}
		await fulfillJson(route, []);
	});
	await page.route(`**/api/personas/${personaId}/memory/facts`, async (route) => {
		if (options.failPersonaLists) {
			await fulfillApiUnavailable(route);
			return;
		}
		await fulfillJson(route, []);
	});
	await page.route(`**/api/personas/${personaId}/memory/summaries`, async (route) => {
		if (options.failPersonaLists) {
			await fulfillApiUnavailable(route);
			return;
		}
		await fulfillJson(route, []);
	});
	await page.route("**/api/sync/preview", (route) => syncServer.routePreview(route));
	await page.route("**/api/sync/commit", (route) => syncServer.routeCommit(route));
	await page.route("**/api/sync/changes**", (route) => syncServer.routeChanges(route));
}

export async function mockGuestToRegisteredAppApis(
	page: Page,
	options: Omit<MockAppApisOptions, "session" | "onGoogleLogin"> = {}
) {
	let isRegistered = false;
	await mockBaseAppApis(page, {
		...options,
		session: () => (isRegistered ? registeredApiSession() : guestApiSession()),
		onGoogleLogin: () => {
			isRegistered = true;
		}
	});

	return {
		isRegistered: () => isRegistered
	};
}

export async function mockGoogleIdentityScript(page: Page, credential = "fake-google-id-token") {
	await page.route("https://accounts.google.com/gsi/client", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/javascript",
			body: `
				window.google = {
					accounts: {
						id: {
							initialize(options) {
								window.__wfchatE2eGoogleCredentialCallback = options.callback;
							},
							renderButton(element) {
								const button = document.createElement("button");
								button.type = "button";
								button.textContent = "Continue with fake Google";
								button.setAttribute("data-testid", "fake-google-login");
								button.addEventListener("click", () => {
									window.__wfchatE2eGoogleCredentialCallback?.({ credential: ${JSON.stringify(credential)} });
								});
								element.appendChild(button);
							}
						}
					}
				};
			`
		});
	});
}

export async function readLocalStorageItem(page: Page, key: string): Promise<string | null> {
	return page.evaluate((storageKey) => window.localStorage.getItem(storageKey), key);
}

export async function readLocalStorageJson<TValue>(
	page: Page,
	key: string
): Promise<TValue | null> {
	const raw = await readLocalStorageItem(page, key);
	return raw ? (JSON.parse(raw) as TValue) : null;
}

export async function expectLocalStorageItem(page: Page, key: string, value: string) {
	await expect.poll(() => readLocalStorageItem(page, key)).toBe(value);
}

export async function expectSyncCursor(page: Page, value: number) {
	await expectLocalStorageItem(page, storageKeys.syncCursor, String(value));
}

export function guestApiSession(): E2eApiSession {
	return {
		user_id: "guest-e2e",
		session_id: "session-e2e",
		kind: "guest",
		email: null,
		name: null,
		profile: null
	};
}

export function registeredApiSession(): E2eApiSession {
	return {
		user_id: "user-e2e",
		session_id: "session-e2e",
		kind: "registered",
		email: "e2e@example.test",
		name: "E2E User",
		profile: {
			display_name: "E2E User",
			avatar_url: null
		}
	};
}

function chatUiConfigFixture(personaId: string) {
	return {
		personas: [
			{
				id: personaId,
				name: "Aiko",
				title: "Calm anime companion",
				status: "Online",
				last_message: "Ready when you are.",
				last_active_at: "Now",
				unread_count: 0,
				avatar_url: "/images/aiko-avatar.png"
			}
		],
		quick_prompts: ["Hello"],
		voice: {
			assistant_speech_enabled: false,
			user_transcription_enabled: false,
			credits: []
		}
	};
}

async function fulfillJson(route: Route, body: unknown) {
	await route.fulfill({
		status: 200,
		contentType: "application/json",
		body: JSON.stringify(body),
		headers: {
			"access-control-allow-origin": "*"
		}
	});
}

async function fulfillApiUnavailable(route: Route) {
	await route.fulfill({
		status: 503,
		contentType: "application/json",
		body: JSON.stringify({ error: "api_unavailable" }),
		headers: {
			"access-control-allow-origin": "*"
		}
	});
}
