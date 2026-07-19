/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CafeRoomPage from "@/pages/CafeRoomPage";
import type {
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
		error: "room_full" as CafeRoomErrorCode | null,
		retryConnection: vi.fn(),
		sendMovement: vi.fn(),
		interact: vi.fn(),
		sendEmote: vi.fn()
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
	default: ({ children }: { children: ReactNode }) => <div>{children}</div>
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
				message: "Bring the leaves to the counter.",
				expression: "happy"
			},
			error: null
		});

		renderRoomPage();

		expect(screen.getByRole("dialog").textContent).toContain("cafe.guide.title");
		fireEvent.click(screen.getByRole("button", { name: "cafe.guide.start" }));
		expect(window.localStorage.getItem("wfchat_cafe_guide_seen_v1")).toBe("seen");
		expect(screen.getByTestId("cafe-carried-tea").textContent).toContain(
			"cafe.activity.carried"
		);
		expect(screen.getByTestId("cafe-quest-hint-desktop").textContent).toBe(
			"cafe.activity.returnHintDesktop"
		);
		expect(screen.getByTestId("cafe-quest-hint-mobile").textContent).toBe(
			"cafe.activity.returnHintMobile"
		);
		expect(gameCanvas.props?.interactionLabels.deliverTea).toBe("cafe.room.deliverTea");
		const dialogue = screen.getByTestId("aiko-dialogue");
		expect(dialogue.textContent).toContain("Bring the leaves to the counter.");
		expect(dialogue.className).toContain("bg-dialog-soft");
	});

	it("explains how to collect tea on desktop and mobile", () => {
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
		const mobileHint = screen.getByTestId("cafe-quest-hint-mobile");
		expect(desktopHint.textContent).toBe("cafe.activity.findHintDesktop");
		expect(desktopHint.className).toContain("hidden sm:inline");
		expect(mobileHint.textContent).toBe("cafe.activity.findHintMobile");
		expect(mobileHint.className).toContain("sm:hidden");
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

		expect(screen.getByTestId("cafe-offline-status").textContent).toBe(
			"cafe.room.offlineMessage"
		);
		expect(gameCanvas.props?.inputEnabled).toBe(false);
		expect(screen.getByRole("button", { name: "cafe.emote.wave" })).toHaveProperty(
			"disabled",
			true
		);
	});

	it("shows the authoritative round and intermission status", () => {
		const room = roomFixture();
		room.activity = {
			...room.activity,
			roundNumber: 2,
			phase: "intermission",
			nextRoundAt: Date.now() + 5_000,
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
		mapWidth: 1280,
		mapHeight: 800,
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
				equippedCosmetic: "mint_scarf"
			}
		],
		activity: {
			id: "tea_delivery",
			roundNumber: 1,
			phase: "active",
			nextRoundAt: null,
			delivered: 1,
			target: 3,
			completed: false,
			teaLeaves: []
		},
		aiko: { x: 640, y: 272, motion: "idle" }
	};
}
