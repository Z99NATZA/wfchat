/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CafePage from "@/pages/CafePage";
import { CAFE_PLAYER_NAME_STORAGE_KEY } from "@/features/cafe/services/cafePlayerName";

const serviceMocks = vi.hoisted(() => ({
	listCafeRooms: vi.fn(),
	getCafeProgress: vi.fn(),
	equipCafeCosmetic: vi.fn(),
	quickJoinCafe: vi.fn(),
	createCafeRoom: vi.fn(),
	joinCafeByCode: vi.fn(),
	cafeLobbyErrorCode: vi.fn(() => "unavailable")
}));

vi.mock("@/features/cafe/services/cafeApiService", () => serviceMocks);
vi.mock("@/layouts/AppLayout", () => ({
	default: ({
		children,
		details,
		sidebar
	}: {
		children: ReactNode;
		details: ReactNode;
		sidebar: ReactNode;
	}) => (
		<div>
			{sidebar}
			{children}
			{details}
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
const room = {
	id: "11111111-1111-4111-8111-111111111111",
	inviteCode: "ABC123",
	isPrivate: false,
	playerCount: 1,
	capacity: 8,
	activityId: "tea_delivery" as const,
	activityCompleted: false
};
const progress = {
	cafeStars: 3,
	unlockedCosmetics: ["sakura_pin", "mint_scarf"],
	equippedCosmetic: null,
	cosmetics: [
		{ id: "sakura_pin", requiredStars: 0, unlocked: true },
		{ id: "mint_scarf", requiredStars: 3, unlocked: true },
		{ id: "tea_hat", requiredStars: 5, unlocked: false }
	]
};

describe("CafePage", () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
		window.sessionStorage.clear();
	});

	it("lets a guest quick join without showing a login gate", async () => {
		serviceMocks.listCafeRooms.mockResolvedValue([room]);
		serviceMocks.getCafeProgress.mockResolvedValue(progress);
		serviceMocks.quickJoinCafe.mockResolvedValue(room);

		render(
			<MemoryRouter initialEntries={["/cafe"]}>
				<Routes>
					<Route
						path="/cafe"
						element={
							<CafePage
								activityBar={null}
								backgroundImageUrl=""
								headerControls={headerControls}
							/>
						}
					/>
				</Routes>
			</MemoryRouter>
		);

		const quickJoin = await screen.findByRole("button", { name: "cafe.lobby.quickJoin" });
		expect(screen.getByTestId("cafe-lobby-scroll").className).toContain("chat-scroll");
		expect(screen.queryByText("cafe.lobby.guestFriendly")).toBeNull();
		expect(screen.getByText("cafe.lobby.heroDescription")).toBeTruthy();
		expect(screen.getByText("cafe.sidebar.guestNote")).toBeTruthy();
		expect(screen.queryByText("cafe.details.capacity")).toBeNull();
		expect(
			screen
				.getByTestId("cafe-entry-panel")
				.contains(screen.getByLabelText("cafe.lobby.joinCodeTitle"))
		).toBe(true);
		fireEvent.click(quickJoin);

		await waitFor(() => expect(serviceMocks.quickJoinCafe).toHaveBeenCalledTimes(1));
		expect(screen.queryByText(/login required/i)).toBeNull();
	});

	it("keeps an optional cafe name only for the current tab", async () => {
		window.sessionStorage.setItem(CAFE_PLAYER_NAME_STORAGE_KEY, "Mint Friend");
		serviceMocks.listCafeRooms.mockResolvedValue([]);
		serviceMocks.getCafeProgress.mockResolvedValue(progress);

		render(
			<MemoryRouter initialEntries={["/cafe"]}>
				<CafePage
					activityBar={null}
					backgroundImageUrl=""
					headerControls={headerControls}
				/>
			</MemoryRouter>
		);

		const playerName = await screen.findByLabelText("cafe.lobby.playerName");
		expect(playerName).toHaveProperty("value", "Mint Friend");
		expect(playerName).toHaveProperty("maxLength", 24);
		expect(screen.queryByText("cafe.lobby.playerNameHint")).toBeNull();
		fireEvent.change(playerName, { target: { value: "Tea Friend" } });
		expect(window.sessionStorage.getItem(CAFE_PLAYER_NAME_STORAGE_KEY)).toBe("Tea Friend");
		fireEvent.change(playerName, { target: { value: "   " } });
		expect(window.sessionStorage.getItem(CAFE_PLAYER_NAME_STORAGE_KEY)).toBeNull();
	});

	it("shows a specific message when an invite room is full", async () => {
		serviceMocks.listCafeRooms.mockResolvedValue([]);
		serviceMocks.getCafeProgress.mockResolvedValue(progress);
		serviceMocks.joinCafeByCode.mockRejectedValue(new Error("full"));
		serviceMocks.cafeLobbyErrorCode.mockReturnValue("room_full");

		render(
			<MemoryRouter initialEntries={["/cafe"]}>
				<CafePage
					activityBar={null}
					backgroundImageUrl=""
					headerControls={headerControls}
				/>
			</MemoryRouter>
		);

		fireEvent.change(await screen.findByLabelText("cafe.lobby.joinCodeTitle"), {
			target: { value: "ABC123" }
		});
		expect(screen.getByText("cafe.lobby.noRooms")).toBeTruthy();
		fireEvent.submit(screen.getByLabelText("cafe.lobby.joinCodeTitle").closest("form")!);

		await waitFor(() => expect(serviceMocks.joinCafeByCode).toHaveBeenCalledWith("ABC123"));
		expect(screen.getByRole("alert").textContent).toBe("cafe.lobby.roomFull");
	});

	it("shows server-owned unlocks and equips an available cosmetic", async () => {
		serviceMocks.listCafeRooms.mockResolvedValue([]);
		serviceMocks.getCafeProgress.mockResolvedValue(progress);
		serviceMocks.equipCafeCosmetic.mockResolvedValue({
			...progress,
			equippedCosmetic: "mint_scarf"
		});

		render(
			<MemoryRouter initialEntries={["/cafe"]}>
				<CafePage
					activityBar={null}
					backgroundImageUrl=""
					headerControls={headerControls}
				/>
			</MemoryRouter>
		);

		const equipButtons = await screen.findAllByRole("button", { name: "cafe.cosmetics.equip" });
		fireEvent.click(equipButtons[1]);
		await waitFor(() =>
			expect(serviceMocks.equipCafeCosmetic).toHaveBeenCalledWith("mint_scarf")
		);
		expect(screen.getByRole("button", { name: "cafe.cosmetics.equipped" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "cafe.cosmetics.locked" })).toHaveProperty(
			"disabled",
			true
		);
		expect(screen.queryByText("cafe.cosmetics.unlocked")).toBeNull();
		expect(screen.queryByText("cafe.cosmetics.sakura_pin.description")).toBeNull();
		expect(screen.getByLabelText("cafe.cosmetics.needStars").textContent).toContain("5");
	});

	it("equips the Cafe Apron after eight server-owned stars", async () => {
		const apronProgress = {
			...progress,
			cafeStars: 8,
			unlockedCosmetics: ["sakura_pin", "mint_scarf", "tea_hat", "cafe_apron"],
			cosmetics: [
				...progress.cosmetics,
				{ id: "cafe_apron", requiredStars: 8, unlocked: true }
			]
		};
		serviceMocks.listCafeRooms.mockResolvedValue([]);
		serviceMocks.getCafeProgress.mockResolvedValue(apronProgress);
		serviceMocks.equipCafeCosmetic.mockResolvedValue({
			...apronProgress,
			equippedCosmetic: "cafe_apron"
		});

		render(
			<MemoryRouter initialEntries={["/cafe"]}>
				<CafePage
					activityBar={null}
					backgroundImageUrl=""
					headerControls={headerControls}
				/>
			</MemoryRouter>
		);

		const preview = await screen.findByTestId("cafe-cosmetic-preview-cafe_apron");
		const equipButton = preview.closest("article")?.querySelector("button");
		expect(equipButton).toBeTruthy();
		fireEvent.click(equipButton!);

		await waitFor(() =>
			expect(serviceMocks.equipCafeCosmetic).toHaveBeenCalledWith("cafe_apron")
		);
		expect(screen.getByRole("button", { name: "cafe.cosmetics.equipped" })).toBeTruthy();
	});
});
