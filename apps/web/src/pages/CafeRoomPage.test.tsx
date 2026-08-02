/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CafeRoomPage from "@/pages/CafeRoomPage";
import type {
	CafeChatEvent,
	CafeConnectionState,
	CafeDialogue,
	CafeRoomErrorCode,
	CafeRoomState
} from "@/features/cafe/types";

const roomHook = vi.hoisted(() => ({
	retryConnection: vi.fn(),
	value: {
		room: null as CafeRoomState | null,
		selfPlayerId: null,
		connectionEpoch: 0,
		cafeStars: 0,
		connectionState: "closed" as CafeConnectionState,
		dialogue: null as CafeDialogue | null,
		emote: null,
		chatEvents: [] as CafeChatEvent[],
		latestChatMessage: null as CafeChatEvent | null,
		chatError: null,
		error: "room_full" as CafeRoomErrorCode | null,
		retryConnection: vi.fn(),
		sendMovement: vi.fn(),
		interact: vi.fn(),
		sendEmote: vi.fn(),
		sendChat: vi.fn(() => true)
	}
}));

const gameCanvas = vi.hoisted(() => ({
	props: null as null | {
		connectionEpoch: number;
		inputEnabled: boolean;
		interactionLabels: Record<string, string>;
	}
}));

vi.mock("@/features/cafe/hooks/useCafeRoom", () => ({
	useCafeRoom: () => ({ ...roomHook.value, retryConnection: roomHook.retryConnection })
}));
vi.mock("@/features/cafe/components/CafeGameCanvas", () => ({
	default: (props: {
		connectionEpoch: number;
		inputEnabled: boolean;
		interactionLabels: Record<string, string>;
	}) => {
		gameCanvas.props = props;
		return <div data-testid="cafe-game" />;
	}
}));
vi.mock("@/layouts/AppLayout", () => ({
	default: ({
		children,
		details,
		sidebar
	}: {
		children: ReactNode;
		details?: ReactNode;
		sidebar: ReactNode;
	}) => (
		<div>
			{sidebar}
			{children}
			{details ? <div data-testid="layout-details">{details}</div> : null}
		</div>
	)
}));
vi.mock("@/components/header/AppHeaderBar", () => ({ default: () => null }));
vi.mock("@/components/header/AppHeaderControls", () => ({
	AppHeaderDesktopControls: () => null,
	AppHeaderMobileControls: () => null
}));
vi.mock("@/i18n/i18nContext", () => ({
	useI18n: () => ({ t: (key: string) => key })
}));

const headerControls = {
	theme: "light" as const,
	font: "inter" as const,
	isAuthenticated: false,
	hasPendingGuestSync: false,
	onFontChange: vi.fn(),
	onOpenProfile: vi.fn(),
	onOpenSettings: vi.fn(),
	onToggleTheme: vi.fn()
};

const storedGuideValues = new Map<string, string>();

describe("CafeRoomPage", () => {
	beforeEach(() => {
		storedGuideValues.clear();
		Object.defineProperty(window, "localStorage", {
			configurable: true,
			value: {
				getItem: (key: string) => storedGuideValues.get(key) ?? null,
				setItem: (key: string, value: string) => storedGuideValues.set(key, value),
				clear: () => storedGuideValues.clear()
			}
		});
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
		window.localStorage.clear();
		Object.assign(roomHook.value, {
			room: null,
			selfPlayerId: null,
			connectionEpoch: 0,
			cafeStars: 0,
			connectionState: "closed",
			dialogue: null,
			emote: null,
			chatEvents: [],
			latestChatMessage: null,
			chatError: null,
			error: "room_full"
		});
	});

	it("gives a full-room player retry and lobby recovery actions", () => {
		render(
			<MemoryRouter initialEntries={["/cafe/rooms/11111111-1111-4111-8111-111111111111"]}>
				<Routes>
					<Route
						path="/cafe/rooms/:roomId"
						element={
							<CafeRoomPage
								activityBar={null}
								backgroundImageUrl=""
								headerControls={headerControls}
							/>
						}
					/>
					<Route path="/cafe" element={<div>lobby</div>} />
				</Routes>
			</MemoryRouter>
		);

		expect(screen.getByRole("alert").textContent).toContain("cafe.room.errorFull");
		const recoveryBackdrop = screen.getByTestId("cafe-recovery-backdrop");
		const recoveryDialog = screen.getByTestId("cafe-recovery-dialog");
		expect(recoveryBackdrop.className).toContain("cafe-world-backdrop");
		expect(recoveryBackdrop.className).not.toContain("backdrop-blur");
		expect(recoveryDialog.className).toContain("cafe-world-overlay-strong");
		expect(recoveryDialog.className).not.toContain("bg-dialog-soft");
		expect(screen.getByRole("button", { name: "cafe.room.retry" }).className).toContain(
			"cafe-world-action-primary"
		);
		fireEvent.click(screen.getByRole("button", { name: "cafe.room.retry" }));
		expect(roomHook.retryConnection).toHaveBeenCalledTimes(1);
		fireEvent.click(screen.getByRole("button", { name: "cafe.room.backToLobby" }));
		expect(screen.getByText("lobby")).toBeTruthy();
	});

	it("guides a player carrying tea back to Aiko with readable in-game dialogue", () => {
		const room = roomFixture();
		Object.assign(roomHook.value, {
			room,
			selfPlayerId: room.players[0].id,
			cafeStars: 2,
			connectionState: "connected",
			dialogue: {
				messageKey: "cafe.dialogue.teaCollected",
				expression: "happy"
			},
			error: null
		});

		renderRoomPage();

		const roomSurface = screen.getByTestId("cafe-room-surface");
		expect(roomSurface.className).toContain("select-none");
		expect(roomSurface.className).toContain("[-webkit-touch-callout:none]");
		const guide = screen.getByRole("dialog");
		expect(guide.textContent).toContain("cafe.guide.title");
		expect(guide.className).toContain("cafe-world-overlay");
		expect(guide.className).toContain("cafe-world-overlay-strong");
		const guideBackdrop = screen.getByTestId("cafe-guide-backdrop");
		expect(guideBackdrop.className).toContain("cafe-world-backdrop");
		expect(guideBackdrop.className).not.toContain("backdrop-blur");
		expect(screen.getByTestId("cafe-guide-controls").className).toContain("text-[10px]");
		expect(screen.getByTestId("cafe-guide-controls").className).toContain("sm:text-sm");
		expect(screen.getByTestId("cafe-guide-controls").textContent).toContain(
			"cafe.guide.moveDesktop"
		);
		expect(screen.getByTestId("cafe-guide-controls").textContent).toContain(
			"cafe.guide.nearbyDesktop"
		);
		expect(screen.getByTestId("cafe-guide-controls").textContent).toContain(
			"cafe.guide.actionDesktop"
		);
		expect(screen.getByTestId("cafe-guide-controls").textContent).toContain(
			"cafe.guide.followPrompts"
		);
		expect(screen.getByRole("button", { name: "cafe.guide.start" }).className).toContain(
			"cafe-world-action"
		);
		fireEvent.click(screen.getByRole("button", { name: "cafe.guide.start" }));
		expect(window.localStorage.getItem("wfchat_cafe_guide_seen_v1")).toBe("seen");
		fireEvent.click(screen.getByRole("button", { name: "cafe.guide.open" }));
		expect(screen.getByRole("dialog").className).toContain("cafe-world-overlay-strong");
		fireEvent.click(screen.getByRole("button", { name: "cafe.guide.start" }));
		expect(screen.getByTestId("cafe-carried-tea").textContent).toContain(
			"cafe.activity.carried"
		);
		expect(screen.getByTestId("cafe-quest-hint-desktop").textContent).toBe(
			"cafe.activity.returnHintDesktop"
		);
		expect(screen.getByTestId("cafe-quest-hint").className).toContain("hidden");
		expect(gameCanvas.props?.interactionLabels.deliverTea).toBe("cafe.room.deliverTea");
		const dialogue = screen.getByTestId("aiko-dialogue");
		expect(dialogue.textContent).toContain("cafe.dialogue.teaCollected");
		expect(dialogue.className).toContain("cafe-world-overlay");
		expect(dialogue.className).toContain("cafe-world-overlay-strong");
		expect(dialogue.className).not.toContain("bg-dialog-soft");
		expect(screen.getByAltText("Aiko").getAttribute("draggable")).toBe("false");
	});

	it("keeps detailed activity guidance behind Help on mobile", () => {
		const room = roomFixture();
		room.players[0].carriedTea = 0;
		Object.assign(roomHook.value, {
			room,
			selfPlayerId: room.players[0].id,
			connectionState: "connected",
			error: null
		});

		renderRoomPage();

		const desktopHint = screen.getByTestId("cafe-quest-hint-desktop");
		expect(desktopHint.textContent).toBe("cafe.activity.findHintDesktop");
		expect(screen.getByTestId("cafe-quest-hint").className).toContain("hidden");
		expect(screen.getByTestId("cafe-quest-hint").className).toContain("sm:block");
		expect(screen.getByRole("button", { name: "cafe.guide.open" })).toBeTruthy();
	});

	it("keeps mobile reactions collapsed and groups room status controls", () => {
		const room = roomFixture();
		Object.assign(roomHook.value, {
			room,
			selfPlayerId: room.players[0].id,
			connectionState: "connected",
			error: null
		});

		renderRoomPage();

		const roomStatus = screen.getByTestId("cafe-room-status");
		const activityHud = screen.getByTestId("cafe-activity-hud");
		const stars = screen.getByTestId("cafe-stars");
		const inviteCode = screen.getByTestId("cafe-invite-code");
		expect(activityHud.className).toContain("cafe-world-overlay-status");
		expect(stars.className).toContain("cafe-world-overlay-status");
		expect(inviteCode.className).toContain("cafe-world-button");
		expect(roomStatus.contains(stars)).toBe(true);
		expect(roomStatus.contains(inviteCode)).toBe(true);
		expect(screen.queryByTestId("cafe-mobile-emote-menu")).toBeNull();

		fireEvent.click(screen.getByTestId("cafe-mobile-emote-toggle"));
		const mobileMenu = screen.getByTestId("cafe-mobile-emote-menu");
		expect(mobileMenu.className).toContain("w-12");
		expect(mobileMenu.className).toContain("cafe-world-overlay");
		expect(screen.getByTestId("cafe-mobile-emote-toggle").className).toContain("size-12");
		expect(screen.getByTestId("cafe-mobile-emote-toggle").className).toContain(
			"cafe-world-overlay"
		);
		const waveButton = mobileMenu.querySelector<HTMLButtonElement>(
			'[aria-label="cafe.emote.wave"]'
		);
		expect(waveButton).not.toBeNull();
		fireEvent.click(waveButton as HTMLButtonElement);

		expect(roomHook.value.sendEmote).toHaveBeenCalledWith("wave");
		expect(screen.queryByTestId("cafe-mobile-emote-menu")).toBeNull();
	});

	it("keeps room activity in the sidebar and mounts an empty desktop right rail", () => {
		const room = roomFixture();
		Object.assign(roomHook.value, {
			room,
			selfPlayerId: room.players[0].id,
			connectionState: "connected",
			error: null
		});

		renderRoomPage();

		expect(
			screen
				.getByTestId("cafe-room-sidebar")
				.contains(screen.getByTestId("cafe-room-activity-details"))
		).toBe(true);
		expect(screen.getByTestId("cafe-room-activity-details").textContent).toContain(
			"cafe.activity.title"
		);
		expect(screen.getByTestId("cafe-room-activity-details").textContent).toContain(
			"cafe.activity.teaLeaves"
		);
		expect(screen.getByTestId("cafe-room-activity-details").textContent).toContain(
			"cafe.room.controls"
		);
		const details = screen.getByTestId("cafe-room-details");
		expect(screen.getByTestId("layout-details").contains(details)).toBe(true);
		expect(details.childElementCount).toBe(0);
		expect(details.className).toContain("hidden");
		expect(details.className).toContain("w-14");
		expect(details.className).toContain("xl:flex");
	});

	it("guides table service players to their claimed table", () => {
		const room = roomFixture();
		room.activity = {
			id: "table_service",
			roundNumber: 2,
			phase: "active",
			nextRoundAt: null,
			endsAt: null,
			delivered: 1,
			target: 3,
			combo: 0,
			bestCombo: 0,
			comboExpiresAt: null,
			completed: false,
			teaLeaves: [],
			tableOrders: [
				{
					id: "order-2-1",
					tableId: "garden",
					drink: "mint",
					x: 906,
					y: 411,
					status: "claimed",
					claimedBy: room.players[0].id
				}
			]
		};
		room.players[0].carriedTea = 0;
		room.players[0].carriedOrderId = "order-2-1";
		Object.assign(roomHook.value, {
			room,
			selfPlayerId: room.players[0].id,
			connectionState: "connected",
			error: null
		});

		renderRoomPage();

		expect(screen.getAllByText("cafe.tableService.title")).toHaveLength(2);
		expect(screen.getByTestId("cafe-carried-order").textContent).toContain(
			"cafe.tableService.carrying"
		);
		expect(screen.getByTestId("cafe-quest-hint-desktop").textContent).toBe(
			"cafe.tableService.deliverHintDesktop"
		);
		expect(screen.getByTestId("cafe-quest-hint").className).toContain("hidden");
		expect(gameCanvas.props?.interactionLabels.pickUpDrink).toBe("cafe.tableService.pickUp");
		expect(gameCanvas.props?.interactionLabels.serveDrink).toBe("cafe.tableService.serve");
	});

	it("shows Cafe Rush timer, combo, ingredient handoff, and mobile guidance", () => {
		const room = roomFixture();
		room.activity = {
			id: "cafe_rush",
			roundNumber: 3,
			phase: "active",
			nextRoundAt: null,
			endsAt: Date.now() + 60_000,
			delivered: 1,
			target: 4,
			combo: 2,
			bestCombo: 2,
			comboExpiresAt: Date.now() + 10_000,
			completed: false,
			teaLeaves: [],
			tableOrders: [
				{
					id: "order-3-1",
					tableId: "window",
					drink: "sakura",
					x: 250,
					y: 383,
					status: "waiting_ingredient",
					claimedBy: null
				}
			]
		};
		room.players[0].carriedTea = 1;
		Object.assign(roomHook.value, {
			room,
			selfPlayerId: room.players[0].id,
			connectionState: "connected",
			error: null
		});

		renderRoomPage();

		expect(screen.getByRole("dialog").textContent).toContain("cafe.rush.guideTitle");
		expect(screen.getByTestId("cafe-rush-timer").textContent).toContain("cafe.rush.timer");
		expect(screen.getByTestId("cafe-rush-combo").textContent).toContain("cafe.rush.combo");
		expect(screen.getByTestId("cafe-carried-tea").textContent).toContain(
			"cafe.rush.carryingIngredient"
		);
		expect(screen.getByTestId("cafe-quest-hint-desktop").textContent).toBe(
			"cafe.rush.prepareHintDesktop"
		);
		expect(screen.getByTestId("cafe-quest-hint").className).toContain("hidden");
		expect(gameCanvas.props?.interactionLabels.prepareOrder).toBe("cafe.rush.prepareOrder");
		expect(gameCanvas.props?.interactionLabels.findIngredient).toBe("cafe.rush.findIngredient");
	});

	it("shows unread room chat, presence history, and sends a message without moving", () => {
		const room = roomFixture();
		const otherMessage: CafeChatEvent = {
			id: "44444444-4444-4444-8444-444444444444",
			kind: "message",
			playerId: "55555555-5555-4555-8555-555555555555",
			playerName: "Mint Friend",
			text: "Hello cafe",
			createdAt: Date.now()
		};
		Object.assign(roomHook.value, {
			room,
			selfPlayerId: room.players[0].id,
			connectionState: "connected",
			chatEvents: [
				{
					...otherMessage,
					id: "33333333-3333-4333-8333-333333333333",
					kind: "joined",
					text: null
				},
				otherMessage
			],
			latestChatMessage: otherMessage,
			error: null
		});

		renderRoomPage();

		expect(screen.getByTestId("cafe-chat-unread").textContent).toBe("1");
		const chatToggle = screen.getByTestId("cafe-chat-toggle");
		expect(chatToggle.getAttribute("aria-label")).toBe("cafe.chat.open");
		expect(chatToggle.getAttribute("aria-expanded")).toBe("false");
		expect(chatToggle.getAttribute("data-active")).toBe("false");
		expect(chatToggle.className).toContain("bottom-3");
		expect(chatToggle.className).toContain("left-3");
		expect(chatToggle.className).toContain("max-sm:bottom-");
		fireEvent.click(chatToggle);
		expect(screen.getByTestId("cafe-chat-toggle")).toBe(chatToggle);
		expect(chatToggle.getAttribute("aria-label")).toBe("cafe.chat.close");
		expect(chatToggle.getAttribute("aria-expanded")).toBe("true");
		expect(chatToggle.getAttribute("aria-controls")).toBe("cafe-room-chat-panel");
		expect(chatToggle.getAttribute("data-active")).toBe("true");
		const roomChat = screen.getByTestId("cafe-room-chat");
		expect(roomChat.className).toContain("select-text");
		expect(roomChat.className).toContain("[-webkit-touch-callout:default]");
		const chatPanelPosition = screen.getByTestId("cafe-chat-panel-position");
		expect(chatPanelPosition.className).toContain("bottom-16");
		expect(chatPanelPosition.className).toContain("left-3");
		expect(chatPanelPosition.className).toContain("max-sm:bottom-");
		expect(screen.getByTestId("cafe-chat-presence").textContent).toContain(
			"cafe.chat.playerJoined"
		);
		expect(screen.getByTestId("cafe-chat-message").textContent).toContain("Hello cafe");
		expect(screen.getByTestId("cafe-chat-name").textContent).toBe("[Mint F..]");
		expect(screen.getByTestId("cafe-chat-name").getAttribute("title")).toBe("Mint Friend");
		expect(gameCanvas.props?.inputEnabled).toBe(true);

		const chatInput = screen.getByLabelText("cafe.chat.inputLabel");
		fireEvent.focus(chatInput);
		expect(gameCanvas.props?.inputEnabled).toBe(false);
		fireEvent.blur(chatInput);
		expect(gameCanvas.props?.inputEnabled).toBe(true);

		chatInput.focus();
		expect(document.activeElement).toBe(chatInput);
		fireEvent.change(chatInput, {
			target: { value: "Nice to meet you" }
		});
		fireEvent.click(screen.getByRole("button", { name: "cafe.chat.send" }));
		expect(roomHook.value.sendChat).toHaveBeenCalledWith("Nice to meet you");
		expect((chatInput as HTMLInputElement).value).toBe("");
		expect(document.activeElement).not.toBe(chatInput);
		expect(gameCanvas.props?.inputEnabled).toBe(true);

		roomHook.value.sendChat.mockReturnValueOnce(false);
		chatInput.focus();
		fireEvent.change(chatInput, {
			target: { value: "Please retry" }
		});
		fireEvent.click(screen.getByRole("button", { name: "cafe.chat.send" }));
		expect((chatInput as HTMLInputElement).value).toBe("Please retry");
		expect(gameCanvas.props?.inputEnabled).toBe(false);

		fireEvent.click(chatToggle);
		expect(screen.queryByTestId("cafe-room-chat")).toBeNull();
		expect(chatToggle.getAttribute("aria-label")).toBe("cafe.chat.open");
		expect(chatToggle.getAttribute("aria-expanded")).toBe("false");
		expect(chatToggle.getAttribute("data-active")).toBe("false");

		fireEvent.click(chatToggle);
		fireEvent.click(screen.getByTestId("cafe-chat-panel-close"));
		expect(screen.queryByTestId("cafe-room-chat")).toBeNull();
		expect(chatToggle.getAttribute("aria-expanded")).toBe("false");
	});

	it("blocks room controls immediately while the browser is offline", () => {
		const room = roomFixture();
		Object.assign(roomHook.value, {
			room,
			selfPlayerId: room.players[0].id,
			connectionEpoch: 1,
			connectionState: "offline",
			error: null
		});

		renderRoomPage();

		const offlineStatus = screen.getByTestId("cafe-offline-status");
		expect(offlineStatus.textContent).toBe("cafe.room.offlineMessage");
		expect(offlineStatus.className).toContain("cafe-world-overlay-status");
		expect(offlineStatus.className).toContain("cafe-world-notice-error");
		expect(offlineStatus.className).not.toContain("bg-dialog-soft");
		expect(gameCanvas.props?.inputEnabled).toBe(false);
		expect(screen.getByRole("button", { name: "cafe.emote.wave" })).toHaveProperty(
			"disabled",
			true
		);
	});

	it("uses the Cafe game palette while reconnecting", () => {
		const room = roomFixture();
		Object.assign(roomHook.value, {
			room,
			selfPlayerId: room.players[0].id,
			connectionState: "reconnecting",
			error: null
		});

		renderRoomPage();

		const reconnectingStatus = screen.getByTestId("cafe-reconnecting-status");
		expect(reconnectingStatus.className).toContain("cafe-world-overlay-status");
		expect(reconnectingStatus.className).toContain("cafe-world-notice-warning");
		expect(reconnectingStatus.className).not.toContain("bg-dialog-soft");
	});

	it("uses the Cafe game palette for recoverable room errors", () => {
		const room = roomFixture();
		Object.assign(roomHook.value, {
			room,
			selfPlayerId: room.players[0].id,
			connectionState: "connected",
			error: "connection_interrupted"
		});

		renderRoomPage();

		const errorStatus = screen.getByTestId("cafe-error-status");
		expect(errorStatus.className).toContain("cafe-world-overlay-status");
		expect(errorStatus.className).toContain("cafe-world-notice-error");
		expect(errorStatus.className).not.toContain("bg-dialog-soft");
	});

	it("shows the authoritative round and intermission status", () => {
		const room = roomFixture();
		room.activity = {
			...room.activity,
			roundNumber: 2,
			phase: "intermission",
			nextRoundAt: Date.now() + 5_000,
			endsAt: null,
			delivered: 3,
			completed: true
		};
		Object.assign(roomHook.value, {
			room,
			selfPlayerId: room.players[0].id,
			connectionEpoch: 1,
			connectionState: "connected",
			error: null
		});

		renderRoomPage();

		expect(screen.getByTestId("cafe-round-number").textContent).toBe("cafe.activity.round");
		expect(screen.getByTestId("cafe-quest-hint").textContent).toBe("cafe.activity.nextRound");
		expect(screen.queryByTestId("cafe-carried-tea")).toBeNull();
	});
});

function renderRoomPage() {
	return render(
		<MemoryRouter initialEntries={["/cafe/rooms/11111111-1111-4111-8111-111111111111"]}>
			<Routes>
				<Route
					path="/cafe/rooms/:roomId"
					element={
						<CafeRoomPage
							activityBar={null}
							backgroundImageUrl=""
							headerControls={headerControls}
						/>
					}
				/>
			</Routes>
		</MemoryRouter>
	);
}

function roomFixture(): CafeRoomState {
	return {
		id: "11111111-1111-4111-8111-111111111111",
		inviteCode: "ABC123",
		isPrivate: true,
		capacity: 8,
		mapLayout: {
			version: "cafe-room-v1",
			width: 1280,
			height: 800,
			playerCollisionRadius: 10,
			interactionRadius: 92,
			hostInteractionRadius: 132,
			playerSpawn: { x: 640, y: 704 },
			colliders: [],
			interactionTargets: [{ id: "aiko", x: 640, y: 272 }]
		},
		players: [
			{
				id: "22222222-2222-4222-8222-222222222222",
				name: "Guest TEST",
				color: "#80cbc4",
				x: 640,
				y: 350,
				direction: "up",
				moving: false,
				carriedTea: 2,
				carriedOrderId: null,
				equippedCosmetic: "mint_scarf"
			}
		],
		activity: {
			id: "tea_delivery",
			roundNumber: 1,
			phase: "active",
			nextRoundAt: null,
			endsAt: null,
			delivered: 1,
			target: 3,
			combo: 0,
			bestCombo: 0,
			comboExpiresAt: null,
			completed: false,
			teaLeaves: [],
			tableOrders: []
		},
		aiko: { x: 640, y: 272, motion: "idle" }
	};
}
