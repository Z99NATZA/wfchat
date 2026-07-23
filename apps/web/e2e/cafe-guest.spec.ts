import { expect, test } from "@playwright/test";

const cafeUrl = "http://localhost:5173/cafe";

test.describe.configure({ mode: "serial" });

test("cafe chrome follows the app theme in dark mode", async ({ page }) => {
	await page.goto(cafeUrl);
	await expect(page.locator("html")).toHaveClass(/dark/);
	const guestNote = page.getByText(/Sign in to save Cafe Stars|เข้าสู่ระบบเพื่อเก็บ Cafe Stars/);
	await expect(guestNote).toBeVisible();
	const colors = await guestNote.evaluate((element) => {
		const style = getComputedStyle(element);
		return { foreground: style.color, background: style.backgroundColor };
	});

	expect(contrastRatio(colors.foreground, colors.background)).toBeGreaterThanOrEqual(4.5);
	await page.screenshot({
		path: "test-results/aiko-cafe-themed-lobby.png",
		fullPage: true
	});
});

test("two guests quick join the same cafe and mobile controls stay usable", async ({ browser }) => {
	const firstContext = await browser.newContext();
	const secondContext = await browser.newContext();
	const firstPage = await firstContext.newPage();
	const secondPage = await secondContext.newPage();

	try {
		await firstPage.goto(cafeUrl);
		await expect(firstPage.getByRole("heading", { name: "Aiko Cafe" })).toBeVisible();
		await firstPage.getByRole("button", { name: /Quick Join|เข้าห้องทันที/ }).click();
		await expect(firstPage).toHaveURL(/\/cafe\/rooms\/[0-9a-f-]{36}$/);
		await expect(firstPage.locator("canvas")).toBeVisible();
		await expect(firstPage.getByRole("dialog")).toContainText(
			/Help Aiko make tea|ช่วย Aiko เตรียมชา/
		);
		await firstPage.screenshot({
			path: "test-results/aiko-cafe-onboarding.png",
			fullPage: true
		});
		await firstPage.getByRole("button", { name: /Start helping Aiko|เริ่มช่วย Aiko/ }).click();

		await secondPage.goto(cafeUrl);
		await secondPage.getByRole("button", { name: /Quick Join|เข้าห้องทันที/ }).click();
		await expect(secondPage).toHaveURL(firstPage.url());
		await expect(firstPage.getByText(/^Guest [0-9A-F]{4}$/)).toHaveCount(2);

		const wardrobePage = await firstContext.newPage();
		await wardrobePage.goto(cafeUrl);
		await expect(wardrobePage.getByTestId("cafe-cosmetic-wardrobe")).toBeVisible();
		await wardrobePage.getByRole("button", { name: /^Equip$|^สวมใส่$/ }).click();
		await expect(
			wardrobePage.getByRole("button", { name: /Equipped|กำลังใช้อยู่/ })
		).toBeVisible();
		await expect(secondPage.getByLabel(/Wearing Sakura pin|กำลังสวม ปิ่นซากุระ/)).toBeVisible();
		await secondPage.getByRole("button", { name: /Start helping Aiko|เริ่มช่วย Aiko/ }).click();
		await secondPage.screenshot({
			path: "test-results/aiko-cafe-cosmetic-realtime.png",
			fullPage: true
		});

		await firstPage.setViewportSize({ width: 390, height: 844 });
		await expect(firstPage.getByRole("button", { name: "Up" })).toBeVisible();
		await expect(
			firstPage.getByRole("button", { name: /Move closer|เดินเข้าใกล้/ })
		).toBeVisible();
		await expect(firstPage.locator("body")).toHaveJSProperty("scrollTop", 0);
		await firstPage.screenshot({
			path: "test-results/aiko-cafe-mobile.png",
			fullPage: true
		});
	} finally {
		await firstContext.close();
		await secondContext.close();
	}
});

test("invite rooms accept their code and disappear after the final player leaves", async ({
	browser
}) => {
	const contexts = [];
	const ownerContext = await browser.newContext();
	contexts.push(ownerContext);
	const ownerPage = await ownerContext.newPage();
	const observerContext = await browser.newContext();
	const observerPage = await observerContext.newPage();

	try {
		await ownerPage.goto(cafeUrl);
		const roomResponse = ownerPage.waitForResponse(
			(response) =>
				response.url().endsWith("/api/cafe/rooms") && response.request().method() === "POST"
		);
		await ownerPage.getByRole("button", { name: /Create Room|สร้างห้อง/ }).click();
		const roomPayload = (await (await roomResponse).json()) as {
			room: { id: string; invite_code: string };
		};
		const roomUrl = `${cafeUrl}/rooms/${roomPayload.room.id}`;
		await expect(ownerPage).toHaveURL(roomUrl);
		await expect(ownerPage.getByLabel(/Connected|เชื่อมต่อแล้ว/)).toBeVisible();

		const invitedContext = await browser.newContext();
		contexts.push(invitedContext);
		const invitedPage = await invitedContext.newPage();
		await invitedPage.goto(cafeUrl);
		await invitedPage
			.getByLabel(/Have an invite code|มีรหัสเชิญหรือไม่/)
			.fill(roomPayload.room.invite_code);
		await invitedPage.getByRole("button", { name: /Join by Code|เข้าด้วยรหัส/ }).click();
		await expect(invitedPage).toHaveURL(roomUrl);
		await expect(invitedPage.getByLabel(/Connected|เชื่อมต่อแล้ว/)).toBeVisible();
		await expect(ownerPage.getByText(/^Guest [0-9A-F]{4}$/)).toHaveCount(2);
		await observerPage.goto(cafeUrl);

		for (const context of contexts.splice(0)) {
			await context.close();
		}
		await expect
			.poll(async () => {
				const response = await observerPage.request.post(
					"http://localhost:5173/api/cafe/rooms/join",
					{ data: { invite_code: roomPayload.room.invite_code } }
				);
				return response.status();
			})
			.toBe(404);
	} finally {
		for (const context of contexts) {
			await context.close();
		}
		await observerContext.close();
	}
});

test("a full-room server response offers clear recovery actions", async ({ page }) => {
	await page.routeWebSocket(/\/api\/cafe\/rooms\/[^/]+\/ws$/, (socket) => {
		socket.send(
			JSON.stringify({
				type: "error",
				code: "room_full",
				message: "Cafe room is full"
			})
		);
	});
	await page.goto("http://localhost:5173/cafe/rooms/00000000-0000-4000-8000-000000000002");
	await expect(page.getByRole("alert")).toContainText(
		/room already has eight visitors|ผู้เล่นครบ 8 คน/
	);
	await expect(page.getByRole("button", { name: /Back to lobby|กลับล็อบบี้/ })).toBeVisible();
	await expect(page.getByRole("button", { name: /Try again|ลองอีกครั้ง/ })).toBeVisible();
});

test("tea delivery rotates into table service with one reward per round", async ({ page }) => {
	const room = cafeRoomFixture();
	const rewardedRounds = new Set<number>();
	await page.routeWebSocket(/\/api\/cafe\/rooms\/[^/]+\/ws$/, (socket) => {
		setTimeout(() => {
			socket.send(
				JSON.stringify({
					type: "welcome",
					self_player_id: room.players[0].id,
					cafe_stars: 6,
					room
				})
			);
		}, 50);
		socket.onMessage((value) => {
			const message = JSON.parse(String(value)) as { type: string; target_id?: string };
			if (message.type === "ping") {
				socket.send(JSON.stringify({ type: "pong" }));
				return;
			}
			if (message.type !== "interact") {
				return;
			}
			if (message.target_id?.startsWith("tea-")) {
				room.players[0].carried_tea = 3;
				for (const leaf of room.activity.tea_leaves) leaf.available = false;
				socket.send(JSON.stringify({ type: "snapshot", room }));
				return;
			}
			if (message.target_id === "service-counter") {
				const order = room.activity.table_orders.find(
					(candidate) => candidate.status === "available"
				);
				if (order) {
					order.status = "claimed";
					order.claimed_by = room.players[0].id;
					room.players[0].carried_order_id = order.id;
					socket.send(JSON.stringify({ type: "snapshot", room }));
				}
				return;
			}
			if (message.target_id?.startsWith("order-")) {
				const order = room.activity.table_orders.find(
					(candidate) =>
						candidate.id === message.target_id &&
						candidate.claimed_by === room.players[0].id
				);
				if (!order) return;
				order.status = "served";
				order.claimed_by = null;
				room.players[0].carried_order_id = null;
				room.activity.delivered += 1;
				if (room.activity.delivered < room.activity.target) {
					socket.send(JSON.stringify({ type: "snapshot", room }));
					socket.send(
						JSON.stringify({
							type: "dialogue",
							message_key: "cafe.dialogue.serviceDelivered",
							expression: "happy"
						})
					);
					return;
				}
			} else {
				room.players[0].carried_tea = 0;
			}
			const completedRound = room.activity.round_number;
			room.activity.delivered = room.activity.target;
			room.activity.completed = true;
			room.activity.phase = "intermission";
			room.activity.next_round_at = Date.now() + 8_000;
			socket.send(JSON.stringify({ type: "snapshot", room }));
			socket.send(
				JSON.stringify({
					type: "dialogue",
					message_key: "cafe.dialogue.roundComplete",
					expression: "happy"
				})
			);
			if (!rewardedRounds.has(completedRound)) {
				rewardedRounds.add(completedRound);
				socket.send(
					JSON.stringify({
						type: "reward",
						player_id: room.players[0].id,
						earned_stars: 1
					})
				);
			}
			if (completedRound === 1) {
				setTimeout(() => {
					room.activity = {
						id: "table_service",
						round_number: 2,
						phase: "active",
						next_round_at: null,
						delivered: 0,
						target: 3,
						completed: false,
						tea_leaves: [],
						table_orders: [
							tableOrder("order-2-1", "window", "sakura"),
							tableOrder("order-2-2", "garden", "mint"),
							tableOrder("order-2-3", "long", "classic")
						]
					};
					socket.send(JSON.stringify({ type: "snapshot", room }));
				}, 300);
			}
		});
	});

	await page.goto("http://localhost:5173/cafe/rooms/00000000-0000-4000-8000-000000000003");
	await expect(page.getByLabel(/Connected|เชื่อมต่อแล้ว/)).toBeVisible();
	await page.getByRole("button", { name: /Start helping Aiko|เริ่มช่วย Aiko/ }).click();
	await expect(page.getByTestId("cafe-round-number")).toContainText(/Round 1|รอบ 1/);
	const overlayBackgrounds = await Promise.all(
		["cafe-activity-hud", "cafe-stars", "cafe-invite-code", "cafe-emotes"].map((testId) =>
			page
				.getByTestId(testId)
				.evaluate((element) => getComputedStyle(element).backgroundColor)
		)
	);
	expect(new Set(overlayBackgrounds).size).toBe(1);
	expect(overlayBackgrounds[0]).not.toMatch(/rgb\(2,\s*6,\s*23/);
	expect(overlayBackgrounds[0]).not.toContain("rgba");
	await expect(page.getByTestId("cafe-interaction-prompt")).toContainText(
		/Collect tea leaf|เก็บใบชา/
	);
	await page.keyboard.press("e");
	await expect(page.getByTestId("cafe-carried-tea")).toContainText("3");
	await expect(page.getByTestId("cafe-quest-hint")).toContainText(
		/Go to the counter|ไปที่เคาน์เตอร์/
	);
	await expect(page.getByTestId("cafe-interaction-prompt")).toContainText(
		/Give Aiko 3 tea|ส่งใบชา 3 ใบให้ Aiko/
	);
	await page.setViewportSize({ width: 390, height: 844 });
	const interactButton = page.getByRole("button", {
		name: /Give Aiko 3 tea|ส่งใบชา 3 ใบให้ Aiko/
	});
	await expect(interactButton).toBeEnabled();
	await interactButton.click();
	await expect(page.getByText(/Tea is ready!|ชาพร้อมแล้ว!/)).toBeVisible();
	await expect(page.getByTestId("cafe-stars")).toContainText("7");
	await expect(page.getByTestId("cafe-quest-hint")).toContainText(
		/Next round starts|รอบใหม่จะเริ่ม/
	);
	await expect(page.getByTestId("cafe-round-number")).toContainText(/Round 2|รอบ 2/);
	await expect(page.getByText(/Table service|บริการเสิร์ฟโต๊ะ/).first()).toBeVisible();
	for (let index = 0; index < 3; index += 1) {
		const pickUp = page.getByRole("button", {
			name: /Pick up drink|รับถ้วยชา/
		});
		await expect(pickUp).toBeEnabled();
		await pickUp.click();
		await expect(page.getByTestId("cafe-carried-order")).toBeVisible();
		const serve = page.getByRole("button", {
			name: /Serve the|เสิร์ฟที่โต๊ะ/
		});
		await expect(serve).toBeEnabled();
		await serve.click();
	}
	await expect(page.getByTestId("cafe-stars")).toContainText("8");
	const dialogue = page.getByTestId("aiko-dialogue");
	await expect(dialogue).toContainText(/Everyone earned a Cafe Star|ทุกคนได้รับ Cafe Star/);
	const dialogueColors = await page
		.getByText(/Everyone earned a Cafe Star|ทุกคนได้รับ Cafe Star/)
		.evaluate((element) => ({
			foreground: getComputedStyle(element).color,
			background: getComputedStyle(element.parentElement?.parentElement ?? element)
				.backgroundColor
		}));
	expect(
		contrastRatio(dialogueColors.foreground, dialogueColors.background)
	).toBeGreaterThanOrEqual(4.5);
	expect(dialogueColors.background).toBe(overlayBackgrounds[0]);
	await page.screenshot({
		path: "test-results/aiko-cafe-table-service.png",
		fullPage: true
	});
});

test("offline input waits for authoritative reconnect and missing rooms recover", async ({
	page
}) => {
	const reconnectRoomId = "00000000-0000-4000-8000-000000000004";
	const room = cafeRoomFixture(reconnectRoomId);
	let connections = 0;
	await page.routeWebSocket(new RegExp(`/api/cafe/rooms/${reconnectRoomId}/ws$`), (socket) => {
		connections += 1;
		const connectionNumber = connections;
		setTimeout(
			() => {
				socket.send(
					JSON.stringify({
						type: "welcome",
						self_player_id: room.players[0].id,
						cafe_stars: 0,
						room
					})
				);
			},
			connectionNumber === 1 ? 50 : 1000
		);
	});

	await page.goto(`http://localhost:5173/cafe/rooms/${reconnectRoomId}`);
	await expect(page.getByLabel(/Connected|เชื่อมต่อแล้ว/)).toBeVisible();
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(page.getByRole("button", { name: "Up" })).toBeEnabled();
	await page.context().setOffline(true);
	await expect(page.getByTestId("cafe-offline-status")).toContainText(/offline|ออฟไลน์/i);
	await expect(page.getByRole("button", { name: "Up" })).toBeDisabled();
	await page.context().setOffline(false);
	await expect(
		page.getByText(/Reconnecting to the cafe|กำลังเชื่อมต่อคาเฟ่อีกครั้ง/)
	).toBeVisible();
	await expect(page.getByLabel(/Connected|เชื่อมต่อแล้ว/)).toBeVisible();
	await expect(page.getByRole("button", { name: "Up" })).toBeEnabled();
	expect(connections).toBe(2);

	await page.goto("http://localhost:5173/cafe/rooms/00000000-0000-4000-8000-000000000001");
	await expect(page.getByRole("alert")).toContainText(
		/room has closed or no longer exists|ห้องนี้ปิดไปแล้ว/
	);
	await expect(page.getByRole("button", { name: /Try again|ลองอีกครั้ง/ })).toBeVisible();
});

function cafeRoomFixture(id = "00000000-0000-4000-8000-000000000003") {
	return {
		id,
		invite_code: "ABC123",
		is_private: true,
		capacity: 8,
		map_layout: {
			version: "cafe-room-v1",
			width: 1280,
			height: 800,
			player_collision_radius: 10,
			interaction_radius: 92,
			host_interaction_radius: 132,
			player_spawn: { x: 640, y: 704 },
			colliders: [],
			interaction_targets: [{ id: "aiko", x: 640, y: 272 }]
		},
		players: [
			{
				id: "11111111-1111-4111-8111-111111111111",
				name: "Guest TEST",
				color: "#80cbc4",
				x: 640,
				y: 350,
				direction: "up",
				moving: false,
				carried_tea: 3,
				carried_order_id: null as string | null,
				equipped_cosmetic: null
			}
		],
		activity: {
			id: "tea_delivery",
			round_number: 1,
			phase: "active",
			next_round_at: null,
			delivered: 0,
			target: 3,
			completed: false,
			tea_leaves: [
				{ id: "tea-1", x: 640, y: 350, available: true },
				{ id: "tea-2", x: 642, y: 350, available: true },
				{ id: "tea-3", x: 644, y: 350, available: true }
			],
			table_orders: [] as ReturnType<typeof tableOrder>[]
		},
		aiko: { x: 640, y: 272, motion: "idle" }
	};
}

function tableOrder(
	id: string,
	tableId: "window" | "garden" | "long",
	drink: "sakura" | "mint" | "classic"
) {
	return {
		id,
		table_id: tableId,
		drink,
		x: 640,
		y: 350,
		status: "available" as "available" | "claimed" | "served",
		claimed_by: null as string | null
	};
}

function contrastRatio(foreground: string, background: string) {
	const luminance = (value: string) => {
		const channels =
			value
				.match(/[\d.]+/g)
				?.slice(0, 3)
				.map(Number) ?? [];
		const linear = channels.map((channel) => {
			const normalized = channel / 255;
			return normalized <= 0.04045
				? normalized / 12.92
				: ((normalized + 0.055) / 1.055) ** 2.4;
		});
		return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
	};
	const lighter = Math.max(luminance(foreground), luminance(background));
	const darker = Math.min(luminance(foreground), luminance(background));
	return (lighter + 0.05) / (darker + 0.05);
}
