import { expect, test } from "@playwright/test";

const cafeUrl = process.env.WFCHAT_CAFE_E2E_URL ?? "http://localhost:5173/cafe";

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

test("lobby adapts room entry and wardrobe controls across viewport sizes", async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 844 });
	await page.goto(cafeUrl);

	const playerName = page.locator("#cafe-player-name");
	const inviteCode = page.locator("#cafe-invite-code");
	const roomCodeToggle = page.getByRole("button", {
		name: "Have a room code?",
		exact: true
	});
	for (const width of [320, 390]) {
		await page.setViewportSize({ width, height: 844 });
		await expect(playerName).toHaveCSS("height", "44px");
		await expect(roomCodeToggle).toBeVisible();
		await expect(inviteCode).toBeHidden();
	}
	await expect(page.getByRole("button", { name: "Join", exact: true })).toBeVisible();
	await expect(roomCodeToggle).toHaveAttribute("aria-expanded", "false");
	await roomCodeToggle.click();
	await expect(roomCodeToggle).toHaveAttribute("aria-expanded", "true");
	await expect(page.getByText("Room code", { exact: true })).toBeVisible();
	await expect(inviteCode).toBeVisible();
	await expect(inviteCode).toHaveCSS("height", "44px");
	await expect(page.getByText("Cosmetics", { exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "Reset look", exact: true })).toHaveCount(0);
	await page.getByTestId("cafe-cosmetic-summary").click();
	await expect(page.getByRole("dialog")).toBeVisible();
	await expect(page.getByRole("button", { name: "Reset look", exact: true })).toBeVisible();
	await expect(page.getByTestId("cafe-cosmetic-wardrobe")).toHaveCSS("padding-bottom", "48px");
	await page
		.getByRole("dialog")
		.getByRole("button", { name: "Close dialog", exact: true })
		.click();
	await expect(page.locator("[data-testid='cafe-entry-panel'] h2")).toHaveCSS(
		"text-wrap",
		"balance"
	);
	await expect(
		page.getByText("Help Aiko prepare tea and play with up to 8 players.", {
			exact: true
		})
	).toHaveCount(0);

	await page.evaluate(() => localStorage.setItem("wfchat.locale", "th"));
	await page.reload();
	await expect(page.getByRole("button", { name: "เข้าห้อง", exact: true })).toBeVisible();
	const thaiRoomCodeToggle = page.getByRole("button", {
		name: "มีรหัสห้อง?",
		exact: true
	});
	await expect(thaiRoomCodeToggle).toBeVisible();
	await expect(page.getByText("รหัสห้อง", { exact: true })).toBeHidden();
	await thaiRoomCodeToggle.click();
	await expect(page.getByText("รหัสห้อง", { exact: true })).toBeVisible();
	await expect(page.getByText("ของแต่ง", { exact: true })).toBeVisible();
	await page.getByTestId("cafe-cosmetic-summary").click();
	await expect(page.getByRole("button", { name: "ถอดของแต่ง", exact: true })).toBeVisible();
	await expect(page.getByTestId("cafe-cosmetic-wardrobe")).toHaveCSS("padding-bottom", "48px");
	await page
		.getByRole("dialog")
		.getByRole("button", { name: "Close dialog", exact: true })
		.click();
	await expect(page.locator("[data-testid='cafe-entry-panel'] h2")).toHaveCSS(
		"text-wrap",
		"balance"
	);
	await expect(
		page.getByText("ช่วย Aiko เตรียมชา และเล่นร่วมกับผู้เล่นอื่นได้สูงสุด 8 คน", {
			exact: true
		})
	).toHaveCount(0);
	await expect(inviteCode).toHaveCSS("height", "44px");
	await page.screenshot({
		path: "test-results/aiko-cafe-lobby-copy-th-mobile.png",
		fullPage: true
	});

	await page.setViewportSize({ width: 640, height: 844 });
	await page.reload();
	await expect(thaiRoomCodeToggle).toBeHidden();
	await expect(inviteCode).toBeVisible();
	await expect(inviteCode).toHaveCSS("height", "44px");

	await page.evaluate(() => localStorage.setItem("wfchat.locale", "en"));
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.reload();
	await expect(roomCodeToggle).toBeHidden();
	await expect(inviteCode).toBeVisible();
	const [playerNameBox, inviteCodeBox, joinBox, joinByCodeBox, createRoomBox] = await Promise.all(
		[
			playerName.boundingBox(),
			inviteCode.boundingBox(),
			page.getByRole("button", { name: "Join", exact: true }).boundingBox(),
			page.getByRole("button", { name: "Join by Code", exact: true }).boundingBox(),
			page.getByRole("button", { name: "Create Room", exact: true }).boundingBox()
		]
	);
	for (const box of [playerNameBox, inviteCodeBox, joinBox, joinByCodeBox, createRoomBox]) {
		expect(box).not.toBeNull();
	}
	expect(Math.abs((playerNameBox?.x ?? 0) - (inviteCodeBox?.x ?? 0))).toBeLessThanOrEqual(1);
	expect(Math.abs((playerNameBox?.width ?? 0) - (inviteCodeBox?.width ?? 0))).toBeLessThanOrEqual(
		1
	);
	expect(Math.abs((joinBox?.x ?? 0) - (joinByCodeBox?.x ?? 0))).toBeLessThanOrEqual(1);
	expect(Math.abs((joinBox?.width ?? 0) - (joinByCodeBox?.width ?? 0))).toBeLessThanOrEqual(1);
	expect(Math.abs((joinBox?.width ?? 0) - (createRoomBox?.width ?? 0))).toBeLessThanOrEqual(1);
	await page.getByTestId("cafe-cosmetic-summary").click();
	await expect(page.getByTestId("cafe-cosmetic-wardrobe")).toHaveCSS("padding-bottom", "48px");
});

test("mobile overlays reserve separate control and status zones", async ({ page }) => {
	const roomId = "00000000-0000-4000-8000-000000000007";
	const room = cafeRoomFixture(roomId);
	let showDialogue: () => void = () => undefined;
	await page.addInitScript(() => {
		if (localStorage.getItem("wfchat.locale") === null) {
			localStorage.setItem("wfchat.locale", "en");
		}
		localStorage.removeItem("wfchat_cafe_guide_seen_v1");
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: {
				writeText: async () => {
					throw new Error("Clipboard API blocked");
				}
			}
		});
		Object.defineProperty(document, "execCommand", {
			configurable: true,
			value: () => true
		});
	});
	room.players[0].carried_tea = 0;
	await page.routeWebSocket(new RegExp(`/api/cafe/rooms/${roomId}/ws$`), (socket) => {
		showDialogue = () =>
			socket.send(
				JSON.stringify({
					type: "dialogue",
					message_key: "cafe.dialogue.roundComplete",
					expression: "happy"
				})
			);
		setTimeout(() => {
			socket.send(
				JSON.stringify({
					type: "welcome",
					self_player_id: room.players[0].id,
					cafe_stars: 2,
					room
				})
			);
		}, 50);
	});
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(`${cafeUrl}/rooms/${roomId}`);
	await expect(page.getByTestId("cafe-game")).toBeVisible();
	const guide = page.getByRole("dialog");
	const guideStartButton = page.getByRole("button", { name: "Ok", exact: true });
	await expect(guide).toBeVisible();
	await expect(page.getByTestId("cafe-guide-backdrop")).toHaveCSS(
		"background-color",
		"rgba(43, 22, 14, 0.72)"
	);
	await expect(page.getByTestId("cafe-guide-backdrop")).toHaveCSS("backdrop-filter", "none");
	await expect(guide).toHaveCSS("background-color", "rgba(120, 72, 42, 0.56)");
	await expect(page.getByTestId("cafe-guide-controls")).toBeVisible();
	await expect(
		page.getByText("Move with the arrow buttons on the left", { exact: true })
	).toBeVisible();
	await expect(
		page.getByText(
			"When you approach something, the button in the bottom-right becomes available",
			{ exact: true }
		)
	).toBeVisible();
	await expect(page.getByText("Tap that button to take action", { exact: true })).toBeVisible();
	await expect(
		page.getByText("Follow the objectives and guidance on screen", { exact: true })
	).toBeVisible();
	await expect(guideStartButton).toHaveCSS("background-color", "rgba(82, 48, 29, 0.78)");
	await page.screenshot({
		path: "test-results/aiko-cafe-guide-game-theme-mobile.png",
		fullPage: true
	});
	await guideStartButton.click();
	await page.getByRole("button", { name: /Open cafe guide|เปิดวิธีเล่นคาเฟ่/ }).click();
	await expect(guide).toHaveCSS("background-color", "rgba(120, 72, 42, 0.56)");
	await guideStartButton.click();

	await expect(page.getByRole("button", { name: "Up" })).toBeVisible();
	await expect(page.getByTestId("cafe-action-button")).toBeVisible();
	await expect(page.locator("body")).toHaveJSProperty("scrollTop", 0);
	await expect(page.getByTestId("cafe-room-surface")).toHaveCSS("user-select", "none");
	const inviteCodeButton = page.getByTestId("cafe-invite-code");
	await expect(inviteCodeButton).toContainText("ABC123");
	await expect(page.getByTestId("cafe-invite-copy-icon")).toBeVisible();
	await inviteCodeButton.click();
	await expect(page.getByTestId("cafe-invite-check-icon")).toBeVisible();
	await expect(inviteCodeButton).toContainText("ABC123");

	const mobileMenuButton = page.getByRole("button", {
		name: /More actions|การดำเนินการเพิ่มเติม/
	});
	await mobileMenuButton.click();
	await expect(mobileMenuButton).toHaveAttribute("aria-expanded", "true");
	await expect(page.locator("#app-header-mobile-menu")).toBeVisible();
	const overlayLayers = await page.evaluate(() => {
		const header = document.querySelector<HTMLElement>('[data-testid="app-header"]');
		const activityHud = document.querySelector<HTMLElement>(
			'[data-testid="cafe-activity-hud"]'
		);
		return {
			header: Number(getComputedStyle(header!).zIndex),
			cafe: Number(getComputedStyle(activityHud!.parentElement!).zIndex)
		};
	});
	expect(overlayLayers.header).toBeGreaterThan(overlayLayers.cafe);
	await page.screenshot({
		path: "test-results/aiko-cafe-mobile-header-menu.png",
		fullPage: true
	});
	await mobileMenuButton.click();
	await expect(mobileMenuButton).toHaveAttribute("aria-expanded", "false");
	await expect(page.getByTestId("app-header")).toHaveCSS("z-index", "20");

	const directionPadBox = await page.getByTestId("cafe-direction-pad").boundingBox();
	const actionButtonBox = await page.getByTestId("cafe-action-button").boundingBox();
	const activityHudBox = await page.getByTestId("cafe-activity-hud").boundingBox();
	const roomStatusBox = await page.getByTestId("cafe-room-status").boundingBox();
	expect(directionPadBox).not.toBeNull();
	expect(actionButtonBox).not.toBeNull();
	expect(activityHudBox).not.toBeNull();
	expect(roomStatusBox).not.toBeNull();
	expect(rectanglesOverlap(directionPadBox!, actionButtonBox!)).toBe(false);
	expect(rectanglesOverlap(activityHudBox!, roomStatusBox!)).toBe(false);
	expect(activityHudBox!.height).toBeLessThanOrEqual(72);
	for (const testId of ["cafe-activity-hud", "cafe-stars", "cafe-invite-code"]) {
		await expect(page.getByTestId(testId)).toHaveCSS(
			"background-color",
			testId === "cafe-invite-code" ? "rgba(82, 48, 29, 0.78)" : "rgba(91, 54, 33, 0.72)"
		);
	}
	await expect(page.getByRole("button", { name: "Up" })).toHaveCSS(
		"background-color",
		"rgba(82, 48, 29, 0.78)"
	);

	await page.getByTestId("cafe-mobile-emote-toggle").click();
	const emoteMenuBox = await page.getByTestId("cafe-mobile-emote-menu").boundingBox();
	const emoteToggleBox = await page.getByTestId("cafe-mobile-emote-toggle").boundingBox();
	expect(emoteMenuBox).not.toBeNull();
	expect(emoteToggleBox).not.toBeNull();
	expect(rectanglesOverlap(emoteMenuBox!, directionPadBox!)).toBe(false);
	expect(rectanglesOverlap(emoteMenuBox!, actionButtonBox!)).toBe(false);
	expect(emoteMenuBox!.width).toBe(emoteToggleBox!.width);
	expect(emoteMenuBox!.x).toBe(emoteToggleBox!.x);
	expect(emoteToggleBox!.x + emoteToggleBox!.width).toBe(
		actionButtonBox!.x + actionButtonBox!.width
	);
	const mobileEmoteMenuColor = await page
		.getByTestId("cafe-mobile-emote-menu")
		.evaluate((element) => getComputedStyle(element).backgroundColor);
	expect(mobileEmoteMenuColor).toBe("rgba(170, 108, 55, 0.36)");
	await expect(page.getByTestId("cafe-mobile-emote-toggle")).toHaveCSS(
		"background-color",
		"rgba(120, 72, 42, 0.56)"
	);
	await page.screenshot({
		path: "test-results/aiko-cafe-mobile-overlays.png",
		fullPage: true
	});
	await page.getByTestId("cafe-mobile-emote-toggle").click();
	const mobileHudToggle = page.getByTestId("cafe-room-hud-toggle");
	await expect(mobileHudToggle).toBeVisible();
	await mobileHudToggle.click();
	await expect(page.getByTestId("cafe-room-hud")).toBeHidden();
	await expect(mobileHudToggle).toHaveAttribute("aria-pressed", "false");
	await mobileHudToggle.click();
	await expect(page.getByTestId("cafe-room-hud")).toBeVisible();
	await page.getByTestId("cafe-chat-toggle").click();
	await expect(page.getByTestId("cafe-room-chat")).toHaveCSS("user-select", "text");
	await expect(page.getByTestId("cafe-room-hud")).toBeHidden();
	await expect(mobileHudToggle).toBeHidden();
	await expect(page.getByTestId("cafe-chat-toggle")).toBeVisible();
	await expect(page.getByTestId("cafe-chat-toggle")).toHaveAttribute("aria-expanded", "true");
	const chatInput = page.locator("#cafe-room-chat-input");
	await chatInput.focus();
	await expect(chatInput).toHaveCSS("border-color", "rgba(255, 247, 237, 0.72)");
	await page.getByTestId("cafe-chat-toggle").click();
	await expect(page.getByTestId("cafe-room-chat")).toBeHidden();
	await expect(page.getByTestId("cafe-room-hud")).toBeVisible();
	await expect(mobileHudToggle).toBeVisible();
	showDialogue();
	await expect(page.getByTestId("aiko-dialogue")).toBeVisible();
	await expect(page.getByTestId("aiko-dialogue")).toHaveCSS(
		"background-color",
		"rgba(120, 72, 42, 0.56)"
	);
	await page.screenshot({
		path: "test-results/aiko-cafe-world-overlays-mobile.png",
		fullPage: true
	});
	await page.setViewportSize({ width: 1280, height: 720 });
	await expect(page.getByTestId("cafe-interaction-prompt")).toBeVisible();
	await expect(page.getByTestId("cafe-interaction-prompt")).toHaveCSS(
		"background-color",
		"rgba(120, 72, 42, 0.56)"
	);
	await expect(page.getByTestId("cafe-emotes")).toHaveCSS(
		"background-color",
		"rgba(170, 108, 55, 0.36)"
	);
	await page.screenshot({
		path: "test-results/aiko-cafe-world-overlays-desktop.png",
		fullPage: true
	});
	await page.evaluate(() => {
		localStorage.setItem("wfchat.locale", "th");
		localStorage.removeItem("wfchat_cafe_guide_seen_v1");
	});
	await page.reload();
	await expect(page.getByRole("heading", { name: "ช่วย Aiko เตรียมชา" })).toBeVisible();
	await expect(page.getByText("ใช้ WASD หรือปุ่มลูกศรเพื่อเดิน", { exact: true })).toBeVisible();
	await expect(
		page.getByText("เมื่อเข้าใกล้บางอย่าง คำสั่งจะแสดงบนหน้าจอ", { exact: true })
	).toBeVisible();
	await expect(page.getByText("กด E เพื่อดำเนินการ", { exact: true })).toBeVisible();
	await expect(page.getByText("ทำตามเป้าหมายและคำแนะนำบนหน้าจอ", { exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "Ok", exact: true })).toBeVisible();
	await page.screenshot({
		path: "test-results/aiko-cafe-guide-thai-copy.png",
		fullPage: true
	});
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(page.getByText("เดินด้วยปุ่มลูกศรด้านซ้าย", { exact: true })).toBeVisible();
	await expect(
		page.getByText("เมื่อเข้าใกล้บางอย่าง ปุ่มด้านขวาล่างจะทำงานได้", { exact: true })
	).toBeVisible();
	await expect(page.getByText("แตะปุ่มนั้นเพื่อดำเนินการ", { exact: true })).toBeVisible();
	await expect(page.getByText("ทำตามเป้าหมายและคำแนะนำบนหน้าจอ", { exact: true })).toBeVisible();
	await page.screenshot({
		path: "test-results/aiko-cafe-guide-thai-copy-mobile.png",
		fullPage: true
	});
});

test("mobile movement stays active on the first hold after switching direction", async ({
	page
}) => {
	const roomId = "00000000-0000-4000-8000-000000000008";
	const room = cafeRoomFixture(roomId);
	const movementMessages: Array<{
		type: string;
		direction?: string;
		moving?: boolean;
	}> = [];
	await page.routeWebSocket(new RegExp(`/api/cafe/rooms/${roomId}/ws$`), (socket) => {
		setTimeout(() => {
			socket.send(
				JSON.stringify({
					type: "welcome",
					self_player_id: room.players[0].id,
					cafe_stars: 0,
					room
				})
			);
		}, 50);
		socket.onMessage((value) => {
			const message = JSON.parse(String(value)) as {
				type: string;
				direction?: string;
				moving?: boolean;
			};
			if (message.type === "move") {
				movementMessages.push(message);
			}
		});
	});
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(`${cafeUrl}/rooms/${roomId}`);
	await page.getByRole("button", { name: "Ok", exact: true }).click();

	const leftButton = page.getByRole("button", { name: "Left" });
	const downButton = page.getByRole("button", { name: "Down" });
	const holdDirection = async (button: typeof leftButton) => {
		const box = await button.boundingBox();
		expect(box).not.toBeNull();
		await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
		await page.mouse.down();
		await page.waitForTimeout(320);
		await page.mouse.up();
	};

	await holdDirection(leftButton);
	movementMessages.length = 0;
	await holdDirection(downButton);
	expect(
		movementMessages.filter((message) => message.moving && message.direction === "down").length
	).toBeGreaterThanOrEqual(2);

	movementMessages.length = 0;
	await holdDirection(leftButton);
	expect(
		movementMessages.filter((message) => message.moving && message.direction === "left").length
	).toBeGreaterThanOrEqual(2);
	await page.screenshot({
		path: "test-results/aiko-cafe-direction-hold-fixed.png",
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
		await firstPage.getByRole("button", { name: /^Join$|^เข้าห้อง$/ }).click();
		await expect(firstPage).toHaveURL(/\/cafe\/rooms\/[0-9a-f-]{36}$/);
		await expect(firstPage.locator("canvas")).toBeVisible();
		await expect(firstPage.getByRole("dialog")).toContainText(
			/Help Aiko make tea|ช่วย Aiko เตรียมชา/
		);
		await firstPage.screenshot({
			path: "test-results/aiko-cafe-onboarding.png",
			fullPage: true
		});
		await firstPage.getByRole("button", { name: "Ok", exact: true }).click();

		await secondPage.goto(cafeUrl);
		await secondPage.getByRole("button", { name: /^Join$|^เข้าห้อง$/ }).click();
		await expect(secondPage).toHaveURL(firstPage.url());
		await expect(firstPage.getByText(/^Guest [0-9A-F]{4}$/)).toHaveCount(2);

		const wardrobePage = await firstContext.newPage();
		await wardrobePage.goto(cafeUrl);
		await wardrobePage.getByTestId("cafe-cosmetic-summary").click();
		await expect(wardrobePage.getByTestId("cafe-cosmetic-wardrobe")).toBeVisible();
		await wardrobePage.getByTestId("cafe-cosmetic-tile-sakura_pin").click();
		await expect(
			wardrobePage.getByRole("status", { name: /Equipped|กำลังใช้อยู่/ })
		).toBeVisible();
		await wardrobePage
			.getByRole("dialog")
			.getByRole("button", { name: "Close dialog", exact: true })
			.click();
		await wardrobePage.close();
		await expect(secondPage.getByLabel(/Wearing Sakura pin|กำลังสวม ปิ่นซากุระ/)).toBeVisible();
		await secondPage.getByRole("button", { name: "Ok", exact: true }).click();
		await secondPage.screenshot({
			path: "test-results/aiko-cafe-cosmetic-realtime.png",
			fullPage: true
		});

		await firstPage.getByRole("button", { name: /Open room chat|เปิดแชทในห้อง/ }).click();
		await firstPage
			.getByLabel(/Message the cafe room|ส่งข้อความในห้องคาเฟ่/)
			.fill("Hello from Chrome");
		await firstPage.getByRole("button", { name: /Send message|ส่งข้อความ/ }).click();
		await firstPage.getByTestId("cafe-chat-panel-close").click();
		await expect(secondPage.getByTestId("cafe-chat-unread")).toHaveText("1");
		await secondPage.getByRole("button", { name: /Open room chat|เปิดแชทในห้อง/ }).click();
		await expect(secondPage.getByTestId("cafe-chat-history")).toContainText(
			"Hello from Chrome"
		);
		await secondPage.getByTestId("cafe-chat-panel-close").click();

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

function rectanglesOverlap(
	first: { x: number; y: number; width: number; height: number },
	second: { x: number; y: number; width: number; height: number }
) {
	return !(
		first.x + first.width <= second.x ||
		second.x + second.width <= first.x ||
		first.y + first.height <= second.y ||
		second.y + second.height <= first.y
	);
}

test("invite rooms accept their code and remain joinable during reconnect grace", async ({
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
		await invitedPage.getByLabel(/Room code|รหัสห้อง/).fill(roomPayload.room.invite_code);
		await invitedPage.getByRole("button", { name: /Join by Code|เข้าด้วยรหัส/ }).click();
		await expect(invitedPage).toHaveURL(roomUrl);
		await expect(invitedPage.getByLabel(/Connected|เชื่อมต่อแล้ว/)).toBeVisible();
		await expect(ownerPage.getByText(/^Guest [0-9A-F]{4}$/)).toHaveCount(2);
		await observerPage.goto(cafeUrl);
		const observerSession = await observerPage.request.get("http://localhost:5173/api/auth/me");
		expect(observerSession.ok()).toBe(true);

		for (const context of contexts.splice(0)) {
			await context.close();
		}
		const reconnectResponse = await observerPage.request.post(
			"http://localhost:5173/api/cafe/rooms/join",
			{ data: { invite_code: roomPayload.room.invite_code } }
		);
		expect(reconnectResponse.status()).toBe(200);
		await expect(reconnectResponse.json()).resolves.toMatchObject({
			room: { id: roomPayload.room.id, player_count: 0 }
		});
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
	await page.goto(`${cafeUrl}/rooms/00000000-0000-4000-8000-000000000002`);
	await expect(page.getByRole("alert")).toContainText(
		/room already has eight visitors|ผู้เล่นครบ 8 คน/
	);
	await expect(page.getByTestId("cafe-recovery-backdrop")).toHaveCSS(
		"background-color",
		"rgba(43, 22, 14, 0.72)"
	);
	await expect(page.getByTestId("cafe-recovery-backdrop")).toHaveCSS("backdrop-filter", "none");
	await expect(page.getByTestId("cafe-recovery-dialog")).toHaveCSS(
		"background-color",
		"rgba(120, 72, 42, 0.56)"
	);
	await expect(page.getByRole("button", { name: /Back to lobby|กลับล็อบบี้/ })).toBeVisible();
	await expect(page.getByRole("button", { name: /Try again|ลองอีกครั้ง/ })).toHaveCSS(
		"background-color",
		"rgba(126, 72, 37, 0.96)"
	);
});

test("Cafe Rush exposes its shared timer, combo, and ingredient handoff on mobile", async ({
	page
}) => {
	const rushRoomId = "00000000-0000-4000-8000-000000000005";
	const room = cafeRoomFixture(rushRoomId);
	room.players[0].carried_tea = 1;
	room.activity = {
		id: "cafe_rush",
		round_number: 3,
		phase: "active",
		next_round_at: null,
		ends_at: Date.now() + 60_000,
		delivered: 1,
		target: 3,
		combo: 2,
		best_combo: 2,
		combo_expires_at: Date.now() + 10_000,
		completed: false,
		tea_leaves: [],
		table_orders: [
			{
				...tableOrder("order-3-1", "window", "sakura"),
				status: "waiting_ingredient" as const
			}
		]
	};
	await page.routeWebSocket(new RegExp(`/api/cafe/rooms/${rushRoomId}/ws$`), (socket) => {
		setTimeout(() => {
			socket.send(
				JSON.stringify({
					type: "welcome",
					self_player_id: room.players[0].id,
					cafe_stars: 4,
					room
				})
			);
		}, 50);
	});

	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(`${cafeUrl}/rooms/${rushRoomId}`);

	await expect(page.getByRole("dialog")).toContainText(
		/Beat the Cafe Rush together|ช่วยกันผ่านช่วงเร่งด่วน/
	);
	await expect(page.getByTestId("cafe-rush-timer")).toContainText(/left|เหลือ/);
	await expect(page.getByTestId("cafe-rush-combo")).toContainText(/2/);
	await expect(page.getByTestId("cafe-quest-hint")).toBeHidden();
	await expect(
		page.getByRole("button", { name: /Prepare rush order|เตรียมออเดอร์ด่วน/ })
	).toBeVisible();
});

test("room chat uses a compact transparent overlay and stays usable on mobile", async ({
	page
}) => {
	const chatRoomId = "00000000-0000-4000-8000-000000000006";
	const room = cafeRoomFixture(chatRoomId);
	const friendId = "99999999-9999-4999-8999-999999999999";
	let sendFriendMessage = () => {};
	let movingMessages = 0;
	await page.addInitScript(() => {
		localStorage.setItem("wfchat.locale", "th");
		localStorage.setItem("wfchat-theme", "light");
	});
	await page.routeWebSocket(new RegExp(`/api/cafe/rooms/${chatRoomId}/ws$`), (socket) => {
		sendFriendMessage = () => {
			socket.send(
				JSON.stringify({
					type: "chat_event",
					event: chatEvent(friendId, "Mint Friend", "Hello from another browser")
				})
			);
		};
		setTimeout(() => {
			socket.send(
				JSON.stringify({
					type: "welcome",
					self_player_id: room.players[0].id,
					cafe_stars: 2,
					room,
					chat_history: [
						{
							...chatEvent(friendId, "Mint Friend", null),
							kind: "joined"
						}
					]
				})
			);
		}, 50);
		socket.onMessage((value) => {
			const message = JSON.parse(String(value)) as {
				type: string;
				text?: string;
				moving?: boolean;
			};
			if (message.type === "ping") {
				socket.send(JSON.stringify({ type: "pong" }));
			}
			if (message.type === "move" && message.moving) {
				movingMessages += 1;
			}
			if (message.type === "chat" && message.text) {
				socket.send(
					JSON.stringify({
						type: "chat_event",
						event: chatEvent(room.players[0].id, room.players[0].name, message.text)
					})
				);
			}
		});
	});

	await page.goto(`${cafeUrl}/rooms/${chatRoomId}`);
	await expect(page.getByLabel(/Connected|เชื่อมต่อแล้ว/)).toBeVisible();
	await page.getByRole("button", { name: "Ok", exact: true }).click();
	sendFriendMessage();

	await expect(page.getByTestId("cafe-chat-unread")).toHaveText("1");
	const desktopHudToggle = page.getByTestId("cafe-room-hud-toggle");
	await expect(desktopHudToggle).toBeVisible();
	await desktopHudToggle.click();
	await expect(page.getByTestId("cafe-room-hud")).toBeHidden();
	await desktopHudToggle.click();
	await expect(page.getByTestId("cafe-room-hud")).toBeVisible();
	await page.getByRole("button", { name: /Open room chat|เปิดแชทในห้อง/ }).click();
	await expect(desktopHudToggle).toBeHidden();
	await expect(page.getByTestId("cafe-room-hud")).toBeVisible();
	await expect(page.getByRole("heading", { name: "แชทในคาเฟ่" })).toBeVisible();
	await expect(page.getByText("ข้อความจะหายไปเมื่อห้องปิด", { exact: true })).toBeVisible();
	const chatChrome = await page.getByTestId("cafe-room-chat").evaluate((element) => {
		const style = getComputedStyle(element);
		return {
			backgroundColor: style.backgroundColor,
			backdropFilter: style.backdropFilter,
			borderColor: style.borderTopColor,
			color: style.color,
			fontWeight: style.fontWeight,
			letterSpacing: style.letterSpacing
		};
	});
	expect(chatChrome.backgroundColor).toBe("rgba(170, 108, 55, 0.36)");
	expect(chatChrome.backdropFilter).toBe("none");
	expect(chatChrome.borderColor).toBe("rgba(255, 232, 204, 0.22)");
	expect(chatChrome.color).toBe("rgb(255, 247, 237)");
	expect(chatChrome.fontWeight).toBe("400");
	expect(chatChrome.letterSpacing).not.toBe("normal");
	await expect(page.getByTestId("cafe-chat-name")).toHaveText("[Mint F..]");
	await expect(page.getByTestId("cafe-chat-name")).toHaveAttribute("title", "Mint Friend");
	const chatInput = page.getByLabel(/Message the cafe room|ส่งข้อความในห้องคาเฟ่/);
	await chatInput.click();
	const chatNameColor = await page
		.getByTestId("cafe-chat-name")
		.evaluate((element) => getComputedStyle(element).color);
	const inputChrome = await chatInput.evaluate((element) => {
		const style = getComputedStyle(element);
		return {
			borderColor: style.borderColor,
			boxShadow: style.boxShadow,
			color: style.color
		};
	});
	const sendColor = await page
		.getByRole("button", { name: /Send message|ส่งข้อความ/ })
		.evaluate((element) => getComputedStyle(element).color);
	expect(chatNameColor).toBe("rgb(74, 222, 128)");
	expect(inputChrome.color).toBe(chatChrome.color);
	expect(inputChrome.borderColor).not.toBe(chatNameColor);
	expect(inputChrome.boxShadow).toBe("none");
	expect(sendColor).toBe(chatChrome.color);
	await page.keyboard.type("wasde ไทย");
	await expect(chatInput).toHaveValue("wasde ไทย");
	const focusedMovingMessages = movingMessages;
	await page.waitForTimeout(150);
	expect(movingMessages).toBe(focusedMovingMessages);
	await chatInput.press("Enter");
	await expect(chatInput).toHaveValue("");
	await expect(chatInput).not.toBeFocused();
	await page.keyboard.down("d");
	try {
		await expect.poll(() => movingMessages).toBeGreaterThan(focusedMovingMessages);
	} finally {
		await page.keyboard.up("d");
	}
	await chatInput.click();
	const desktopChatPanelBox = await page.getByTestId("cafe-chat-panel-position").boundingBox();
	expect(desktopChatPanelBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(384);
	await page.screenshot({
		path: "test-results/aiko-cafe-chat-desktop.png",
		fullPage: true
	});

	await page.getByTestId("cafe-chat-toggle").click();
	await expect(page.getByTestId("cafe-room-chat")).toBeHidden();
	await expect(desktopHudToggle).toBeVisible();
	await page.setViewportSize({ width: 390, height: 844 });
	await page.getByRole("button", { name: /Open room chat|เปิดแชทในห้อง/ }).click();
	const chatPanelBox = await page.getByTestId("cafe-chat-panel-position").boundingBox();
	const cafeGameBox = await page.getByTestId("cafe-game").boundingBox();
	const mobileUpButtonBox = await page.getByRole("button", { name: "Up" }).boundingBox();
	expect(chatPanelBox).not.toBeNull();
	expect(cafeGameBox).not.toBeNull();
	expect(mobileUpButtonBox).not.toBeNull();
	expect((chatPanelBox?.x ?? 0) - (cafeGameBox?.x ?? 0)).toBeLessThan(24);
	expect((chatPanelBox?.y ?? 0) + (chatPanelBox?.height ?? 0)).toBeLessThan(
		mobileUpButtonBox?.y ?? 0
	);
	await expect(page.getByTestId("cafe-chat-presence")).toContainText("Mint Friend");
	await expect(page.getByTestId("cafe-chat-history")).toContainText("Hello from another browser");

	await page.getByLabel(/Message the cafe room|ส่งข้อความในห้องคาเฟ่/).fill("Nice to meet you");
	await page.getByRole("button", { name: /Send message|ส่งข้อความ/ }).click();
	await expect(page.getByTestId("cafe-chat-history")).toContainText("Nice to meet you");
	await page.screenshot({
		path: "test-results/aiko-cafe-chat-mobile.png",
		fullPage: true
	});
	await page.getByTestId("cafe-chat-toggle").click();
	await expect(page.getByTestId("cafe-room-chat")).toBeHidden();
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
						ends_at: null,
						delivered: 0,
						target: 3,
						combo: 0,
						best_combo: 0,
						combo_expires_at: null,
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
	await page.getByRole("button", { name: "Ok", exact: true }).click();
	await expect(page.getByTestId("cafe-round-number")).toContainText(/Round 1|รอบ 1/);
	const persistentOverlayBackgrounds = await Promise.all(
		["cafe-activity-hud", "cafe-stars", "cafe-invite-code"].map((testId) =>
			page
				.getByTestId(testId)
				.evaluate((element) => getComputedStyle(element).backgroundColor)
		)
	);
	expect(persistentOverlayBackgrounds).toEqual([
		"rgba(91, 54, 33, 0.72)",
		"rgba(91, 54, 33, 0.72)",
		"rgba(82, 48, 29, 0.78)"
	]);
	await expect(page.getByTestId("cafe-emotes")).toHaveCSS(
		"background-color",
		"rgba(170, 108, 55, 0.36)"
	);
	await expect(page.getByTestId("cafe-interaction-prompt")).toContainText(
		/Collect tea leaf|เก็บใบชา/
	);
	await expect(page.getByTestId("cafe-interaction-prompt")).toHaveCSS(
		"background-color",
		"rgba(120, 72, 42, 0.56)"
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
	await expect(interactButton).toHaveCSS("background-color", "rgba(82, 48, 29, 0.78)");
	await interactButton.click();
	await expect(page.getByText(/Tea is ready!|ชาพร้อมแล้ว!/)).toBeVisible();
	await expect(page.getByTestId("cafe-stars")).toContainText("7");
	await expect(page.getByTestId("cafe-quest-hint")).toContainText(
		/Next round starts|รอบใหม่จะเริ่ม/
	);
	await expect(page.getByTestId("cafe-round-number")).toContainText(/Round 2|รอบ 2/);
	await expect(page.getByTestId("cafe-activity-hud")).toContainText(
		/Table service|บริการเสิร์ฟโต๊ะ/
	);
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
	expect(dialogueColors.background).toBe("rgba(120, 72, 42, 0.56)");
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

	await page.goto(`${cafeUrl}/rooms/${reconnectRoomId}`);
	await expect(page.getByLabel(/Connected|เชื่อมต่อแล้ว/)).toBeVisible();
	const connectionsBeforeOffline = connections;
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(page.getByRole("button", { name: "Up" })).toBeEnabled();
	await page.context().setOffline(true);
	await expect(page.getByTestId("cafe-offline-status")).toContainText(/offline|ออฟไลน์/i);
	await expect(page.getByTestId("cafe-offline-status")).toHaveCSS(
		"background-color",
		"rgba(91, 54, 33, 0.72)"
	);
	await expect(page.getByTestId("cafe-offline-status")).toHaveCSS(
		"border-bottom-color",
		"rgba(248, 113, 113, 0.52)"
	);
	await expect(page.getByRole("button", { name: "Up" })).toBeDisabled();
	await page.context().setOffline(false);
	const reconnectingStatus = page.getByTestId("cafe-reconnecting-status");
	await expect(reconnectingStatus).toContainText(
		/Reconnecting to the cafe|กำลังเชื่อมต่อคาเฟ่อีกครั้ง/
	);
	await expect(reconnectingStatus).toHaveCSS("border-bottom-color", "rgba(251, 191, 36, 0.52)");
	await expect(page.getByLabel(/Connected|เชื่อมต่อแล้ว/)).toBeVisible();
	await expect(page.getByRole("button", { name: "Up" })).toBeEnabled();
	expect(connections).toBe(connectionsBeforeOffline + 1);

	const missingRoomId = "00000000-0000-4000-8000-000000000001";
	await page.routeWebSocket(new RegExp(`/api/cafe/rooms/${missingRoomId}/ws$`), (socket) => {
		socket.send(
			JSON.stringify({
				type: "error",
				code: "room_not_found",
				message: "Cafe room was not found"
			})
		);
	});
	await page.goto(`${cafeUrl}/rooms/${missingRoomId}`);
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
			ends_at: null,
			delivered: 0,
			target: 3,
			combo: 0,
			best_combo: 0,
			combo_expires_at: null,
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
		status: "available" as "waiting_ingredient" | "available" | "claimed" | "served",
		claimed_by: null as string | null
	};
}

function chatEvent(playerId: string, playerName: string, text: string | null) {
	return {
		id: crypto.randomUUID(),
		kind: "message",
		player_id: playerId,
		player_name: playerName,
		text,
		created_at: Date.now()
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
