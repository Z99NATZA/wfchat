/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CafePage from "@/pages/CafePage";
import { CAFE_PLAYER_NAME_STORAGE_KEY } from "@/features/cafe/services/cafePlayerName";
import en from "@/i18n/locales/en.json";
import th from "@/i18n/locales/th.json";

const serviceMocks = vi.hoisted(() => ({
	listCafeRooms: vi.fn(),
	getCafeProgress: vi.fn(),
	equipCafeAvatar: vi.fn(),
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
	equippedAvatar: "boy" as const,
	cosmetics: [
		{ id: "sakura_pin", requiredStars: 0, unlocked: true },
		{ id: "mint_scarf", requiredStars: 3, unlocked: true },
		{ id: "tea_hat", requiredStars: 5, unlocked: false }
	],
	avatars: [{ id: "boy" as const }, { id: "girl" as const }]
};

describe("CafePage", () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
		window.sessionStorage.clear();
	});

	it("uses concise lobby copy in Thai and English", () => {
		expect(th["cafe.lobby.quickJoin"]).toBe("เข้าห้อง");
		expect(th["cafe.lobby.joinCodeTitle"]).toBe("รหัสห้อง");
		expect(th["cafe.lobby.haveCode"]).toBe("มีรหัสห้อง?");
		expect(th["cafe.cosmetics.title"]).toBe("ของแต่ง");
		expect(th["cafe.cosmetics.classic"]).toBe("ถอดของแต่ง");
		expect(th["cafe.cosmetics.defaultLook"]).toBe("ลุคปกติ");
		expect("cafe.lobby.heroDescription" in th).toBe(false);

		expect(en["cafe.lobby.quickJoin"]).toBe("Join");
		expect(en["cafe.lobby.joinCodeTitle"]).toBe("Room code");
		expect(en["cafe.lobby.haveCode"]).toBe("Have a room code?");
		expect(en["cafe.cosmetics.title"]).toBe("Cosmetics");
		expect(en["cafe.cosmetics.classic"]).toBe("Reset look");
		expect(en["cafe.cosmetics.defaultLook"]).toBe("Classic look");
		expect("cafe.lobby.heroDescription" in en).toBe(false);
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
		const createRoom = screen.getByRole("button", { name: "cafe.lobby.createRoom" });
		const joinWithCode = screen.getByRole("button", { name: "cafe.lobby.joinCode" });
		const entryActions = screen.getByTestId("cafe-entry-actions");
		const primaryEntryRow = screen.getByTestId("cafe-primary-entry-row");
		const desktopEntryColumns = "lg:grid-cols-[minmax(0,1fr)_10rem_10rem]";
		expect(entryActions.className).toContain("grid-cols-2");
		expect(entryActions.className).toContain("w-full");
		expect(entryActions.className).toContain("sm:w-fit");
		expect(entryActions.className).toContain("lg:contents");
		expect(primaryEntryRow.className).toContain(desktopEntryColumns);
		expect(entryActions.contains(quickJoin)).toBe(true);
		expect(entryActions.contains(createRoom)).toBe(true);
		expect(quickJoin.className).toContain("w-full");
		expect(createRoom.className).toContain("w-full");
		expect(joinWithCode.className).toContain("button--lg");
		expect(joinWithCode.className).not.toContain("button--md");
		for (const formButton of [quickJoin, createRoom, joinWithCode]) {
			expect(formButton.className).toContain("rounded-lg");
			expect(formButton.className).not.toContain("rounded-xl");
		}
		expect(quickJoin.className).not.toContain("cafe-quick-join-effect");
		expect(createRoom.className).not.toContain("cafe-quick-join-effect");
		const quickJoinEffect = screen.getByTestId("cafe-quick-join-effect");
		expect(quickJoinEffect.contains(quickJoin)).toBe(true);
		expect(quickJoinEffect.className).toContain("min-w-0");
		expect(quickJoinEffect.querySelectorAll(".cafe-quick-join-sparkle")).toHaveLength(4);
		expect(quickJoinEffect.getAttribute("data-active")).toBe("true");
		const lobbyAiko = screen.getByTestId("cafe-lobby-aiko");
		expect(lobbyAiko.querySelector(".cafe-lobby-aiko-idle")).toBeTruthy();
		expect(lobbyAiko.querySelector(".cafe-lobby-aiko-shadow")).toBeTruthy();
		expect(lobbyAiko.className).toContain("h-24");
		expect(lobbyAiko.className).toContain("md:h-44");
		expect(lobbyAiko.className).not.toContain("h-52");
		expect(screen.getByTestId("cafe-lobby-scroll").className).toContain("chat-scroll");
		expect(screen.queryByText("cafe.lobby.guestFriendly")).toBeNull();
		expect(screen.queryByText("cafe.lobby.heroDescription")).toBeNull();
		expect(screen.getByText("cafe.lobby.heroTitle").className).toContain("text-balance");
		expect(screen.getByText("cafe.sidebar.guestNote")).toBeTruthy();
		expect(
			screen
				.getByTestId("cafe-lobby-sidebar")
				.contains(screen.getByTestId("cafe-sidebar-activity"))
		).toBe(true);
		expect(screen.getByTestId("cafe-sidebar-activity").textContent).toContain(
			"cafe.details.today"
		);
		expect(screen.getByTestId("cafe-sidebar-activity").textContent).toContain(
			"cafe.activity.title"
		);
		expect(screen.getByTestId("cafe-sidebar-activity").textContent).toContain(
			"cafe.activity.description"
		);
		const cosmeticSummary = screen.getByTestId("cafe-cosmetic-summary");
		const cosmeticFooter = screen.getByTestId("cafe-cosmetic-footer");
		const entryPanel = screen.getByTestId("cafe-entry-panel");
		expect(entryPanel.contains(cosmeticFooter)).toBe(true);
		expect(cosmeticFooter.className).toContain("border-t");
		expect(cosmeticSummary.className).toContain("button--ghost");
		expect(cosmeticSummary.className).toContain("rounded-none");
		expect(cosmeticSummary.className).toContain("px-5");
		expect(cosmeticSummary.className).not.toContain("rounded-xl");
		expect(cosmeticSummary.getAttribute("aria-haspopup")).toBe("dialog");
		expect(cosmeticSummary.getAttribute("aria-expanded")).toBe("false");
		expect(screen.queryByTestId("cafe-cosmetic-wardrobe")).toBeNull();
		const details = screen.getByTestId("cafe-lobby-details");
		expect(screen.getByTestId("layout-details").contains(details)).toBe(true);
		expect(details.childElementCount).toBe(0);
		expect(details.className).toContain("hidden");
		expect(details.className).toContain("w-14");
		expect(details.className).toContain("xl:flex");
		expect(screen.queryByText("cafe.details.capacity")).toBeNull();
		expect(
			screen
				.getByTestId("cafe-entry-panel")
				.contains(screen.getByLabelText("cafe.lobby.joinCodeTitle"))
		).toBe(true);
		const inviteCodeInput = screen.getByLabelText("cafe.lobby.joinCodeTitle");
		const inviteCodeToggle = screen.getByRole("button", {
			name: "cafe.lobby.haveCode"
		});
		const inviteCodeForm = screen.getByTestId("cafe-invite-code-form");
		expect(inviteCodeToggle.getAttribute("aria-controls")).toBe("cafe-invite-code-form");
		expect(inviteCodeToggle.getAttribute("aria-expanded")).toBe("false");
		expect(inviteCodeToggle.className).toContain("sm:hidden");
		expect(inviteCodeToggle.className).toContain("px-2");
		expect(screen.getByTestId("cafe-invite-code-leading").className).toContain("w-10");
		expect(inviteCodeForm.className).toContain("hidden");
		expect(inviteCodeForm.className).toContain("sm:flex");
		expect(inviteCodeForm.className).toContain("lg:grid");
		expect(inviteCodeForm.className).toContain(desktopEntryColumns);
		expect(joinWithCode.className).toContain("lg:col-start-2");
		expect(joinWithCode.className).toContain("lg:w-full");
		fireEvent.click(inviteCodeToggle);
		expect(inviteCodeToggle.getAttribute("aria-expanded")).toBe("true");
		expect(inviteCodeForm.className).toContain("flex");
		expect(inviteCodeInput.className).toContain("h-11");
		expect(inviteCodeInput.className).toContain("w-full");
		expect(inviteCodeInput.parentElement?.className).toContain("sm:flex-1");
		expect(inviteCodeInput.parentElement?.className).toContain("lg:col-start-1");
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

		await screen.findByLabelText("cafe.lobby.joinCodeTitle");
		fireEvent.click(screen.getByRole("button", { name: "cafe.lobby.haveCode" }));
		fireEvent.change(screen.getByLabelText("cafe.lobby.joinCodeTitle"), {
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

		const cosmeticSummary = await screen.findByTestId("cafe-cosmetic-summary");
		fireEvent.click(cosmeticSummary);

		expect(screen.getByRole("dialog")).toBeTruthy();
		expect(cosmeticSummary.getAttribute("aria-expanded")).toBe("true");
		expect(screen.getByTestId("cafe-cosmetic-wardrobe").className).toContain("pb-12");
		expect(screen.getByTestId("cafe-cosmetic-wardrobe").className).not.toContain("sm:pb-12");
		const mintTile = screen.getByTestId("cafe-cosmetic-tile-mint_scarf");
		fireEvent.click(mintTile);
		await waitFor(() =>
			expect(serviceMocks.equipCafeCosmetic).toHaveBeenCalledWith("mint_scarf")
		);
		const equippedStatus = screen.getByRole("status", {
			name: "cafe.cosmetics.equipped"
		});
		expect(equippedStatus.textContent).toBe("cafe.cosmetics.equipped");
		expect(mintTile.className).toContain("button--primary");
		expect(mintTile.getAttribute("aria-pressed")).toBe("true");
		expect(cosmeticSummary.textContent).toContain("cafe.cosmetics.mint_scarf.name");
		const cosmeticTrack = screen.getByTestId("cafe-cosmetic-track");
		expect(cosmeticTrack.className).toContain("grid-cols-2");
		expect(cosmeticTrack.className).toContain("sm:grid-cols-4");
		expect(cosmeticTrack.className).not.toContain("overflow-x-auto");
		const equippedPreview = screen.getByTestId("cafe-cosmetic-preview-mint_scarf");
		const lockedPreview = screen.getByTestId("cafe-cosmetic-preview-tea_hat");
		expect(equippedPreview.className).toContain("size-10");
		expect(equippedPreview.className).toContain("text-xl");
		expect(equippedPreview.className).toContain("bg-dialog-panel");
		expect(equippedPreview.getAttribute("style")).not.toContain("background-color");
		expect(mintTile.className).toContain("min-w-0");
		expect(mintTile.className).toContain("p-2.5");
		const lockedTile = screen.getByTestId("cafe-cosmetic-tile-tea_hat");
		expect((lockedTile as HTMLButtonElement).disabled).toBe(true);
		expect(lockedPreview.className).toContain("opacity-55");
		expect(lockedPreview.className).toContain("grayscale");
		expect(screen.queryByText("cafe.cosmetics.unlocked")).toBeNull();
		expect(screen.queryByText("cafe.cosmetics.sakura_pin.description")).toBeNull();
		expect(screen.getByLabelText("cafe.cosmetics.needStars").textContent).toContain("5");
	});

	it("selects a sprite v2 avatar from the wardrobe", async () => {
		serviceMocks.listCafeRooms.mockResolvedValue([]);
		serviceMocks.getCafeProgress.mockResolvedValue(progress);
		serviceMocks.equipCafeAvatar.mockResolvedValue({
			...progress,
			equippedAvatar: "girl"
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

		fireEvent.click(await screen.findByTestId("cafe-cosmetic-summary"));
		const girlTile = screen.getByTestId("cafe-avatar-tile-girl");
		fireEvent.click(girlTile);

		await waitFor(() => expect(serviceMocks.equipCafeAvatar).toHaveBeenCalledWith("girl"));
		expect(girlTile.getAttribute("aria-pressed")).toBe("true");
		expect(girlTile.className).toContain("button--primary");
		expect(screen.getByTestId("cafe-avatar-summary-preview-girl")).toBeTruthy();
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

		fireEvent.click(await screen.findByTestId("cafe-cosmetic-summary"));
		const preview = screen.getByTestId("cafe-cosmetic-preview-cafe_apron");
		const equipButton = preview.closest("button");
		expect(equipButton).toBeTruthy();
		fireEvent.click(equipButton!);

		await waitFor(() =>
			expect(serviceMocks.equipCafeCosmetic).toHaveBeenCalledWith("cafe_apron")
		);
		expect(screen.getByRole("status", { name: "cafe.cosmetics.equipped" })).toBeTruthy();
	});
});
