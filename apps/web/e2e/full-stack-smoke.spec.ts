import { expect, test, type Page, type WebSocket } from "@playwright/test";

type CafeRoomResponse = {
	room: {
		id: string;
	};
};

type CafeWelcome = {
	type: "welcome";
	self_player_id: string;
	revision: number;
	room: {
		id: string;
	};
};

test("guest chat is persisted through the Web, API, and PostgreSQL stack", async ({ page }) => {
	const message = `Full-stack smoke ${Date.now()}`;
	const assistantReply = `[aiko_default] mock reply: I received "${message}".`;

	const healthResponse = await page.request.get("/api/health");
	expect(healthResponse.ok()).toBe(true);
	await expect(healthResponse.json()).resolves.toEqual({ status: "ok" });

	await page.goto("/chat");
	await expect(page.getByText("Aiko").first()).toBeVisible();

	await page.getByPlaceholder("Message Aiko", { exact: true }).fill(message);
	await page.getByRole("button", { name: "Send message", exact: true }).click();

	await expect(page).toHaveURL(/\/chat\/[0-9a-f-]+$/);
	await expect(page.getByRole("article").getByText(message, { exact: true })).toBeVisible();
	await expect(
		page.getByRole("article").getByText(assistantReply, { exact: true })
	).toBeVisible();

	await page.reload();

	await expect(page.getByRole("article").getByText(message, { exact: true })).toBeVisible();
	await expect(
		page.getByRole("article").getByText(assistantReply, { exact: true })
	).toBeVisible();
});

test("Cafe room reconnects through the Web, API, PostgreSQL, and WebSocket stack", async ({
	page
}) => {
	const sessionResponse = await page.request.get("/api/auth/me");
	const sessionBody = await sessionResponse.text();
	expect(
		sessionResponse.ok(),
		`Guest session creation failed with ${sessionResponse.status()}: ${sessionBody}`
	).toBe(true);

	const createResponse = await page.request.post("/api/cafe/rooms", {
		data: { is_private: true }
	});
	const createBody = await createResponse.text();
	expect(
		createResponse.ok(),
		`Cafe room creation failed with ${createResponse.status()}: ${createBody}`
	).toBe(true);
	const created = JSON.parse(createBody) as CafeRoomResponse;
	expect(created.room.id).toMatch(
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
	);

	const firstWelcomePromise = waitForCafeWelcome(page, created.room.id);
	await page.goto(`/cafe/rooms/${created.room.id}`);
	const first = await firstWelcomePromise;
	expect(first.message.room.id).toBe(created.room.id);

	const firstSocketClosed = first.socket.isClosed()
		? Promise.resolve()
		: first.socket.waitForEvent("close");
	const replacementWelcomePromise = waitForCafeWelcome(page, created.room.id);
	await page.reload();
	const [replacement] = await Promise.all([replacementWelcomePromise, firstSocketClosed]);

	expect(replacement.socket).not.toBe(first.socket);
	expect(replacement.message.room.id).toBe(created.room.id);
	expect(replacement.message.self_player_id).toBe(first.message.self_player_id);
	expect(replacement.message.revision).toBeGreaterThan(first.message.revision);
});

async function waitForCafeWelcome(
	page: Page,
	roomId: string
): Promise<{ socket: WebSocket; message: CafeWelcome }> {
	const expectedPath = `/api/cafe/rooms/${roomId}/ws`;

	return new Promise((resolve, reject) => {
		type SocketHandlers = {
			frame: (frame: { payload: string | Buffer }) => void;
			error: (error: string) => void;
			close: () => void;
		};
		const socketHandlers = new Map<WebSocket, SocketHandlers>();
		let lastSocketFailure = "no matching socket opened";
		const timeout = setTimeout(
			() =>
				fail(
					new Error(
						`Timed out waiting for Cafe welcome for room ${roomId}; ${lastSocketFailure}`
					)
				),
			10_000
		);

		function cleanup() {
			clearTimeout(timeout);
			page.off("websocket", handleWebSocket);
			page.off("close", handlePageClose);
			for (const socket of socketHandlers.keys()) {
				detachSocket(socket);
			}
		}

		function fail(error: Error) {
			cleanup();
			reject(error);
		}

		function handlePageClose() {
			fail(new Error(`Page closed before Cafe welcome for room ${roomId}`));
		}

		function detachSocket(socket: WebSocket) {
			const handlers = socketHandlers.get(socket);
			if (!handlers) return;
			socket.off("framereceived", handlers.frame);
			socket.off("socketerror", handlers.error);
			socket.off("close", handlers.close);
			socketHandlers.delete(socket);
		}

		function handleWebSocket(candidate: WebSocket) {
			if (new URL(candidate.url()).pathname !== expectedPath) return;
			const handlers: SocketHandlers = {
				frame: ({ payload }) => {
					const message = parseCafeWelcome(payload);
					if (message?.room.id !== roomId) return;
					cleanup();
					resolve({ socket: candidate, message });
				},
				error: (error) => {
					lastSocketFailure = `last socket error: ${error}`;
					detachSocket(candidate);
				},
				close: () => {
					lastSocketFailure = "last matching socket closed before welcome";
					detachSocket(candidate);
				}
			};
			socketHandlers.set(candidate, handlers);
			candidate.on("framereceived", handlers.frame);
			candidate.on("socketerror", handlers.error);
			candidate.on("close", handlers.close);
		}

		page.on("close", handlePageClose);
		page.on("websocket", handleWebSocket);
	});
}

function parseCafeWelcome(payload: string | Buffer): CafeWelcome | null {
	try {
		const parsed: unknown = JSON.parse(
			typeof payload === "string" ? payload : payload.toString("utf8")
		);
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			!("type" in parsed) ||
			parsed.type !== "welcome" ||
			!("self_player_id" in parsed) ||
			typeof parsed.self_player_id !== "string" ||
			!("revision" in parsed) ||
			typeof parsed.revision !== "number" ||
			!("room" in parsed) ||
			typeof parsed.room !== "object" ||
			parsed.room === null ||
			!("id" in parsed.room) ||
			typeof parsed.room.id !== "string"
		) {
			return null;
		}
		return parsed as CafeWelcome;
	} catch {
		return null;
	}
}
