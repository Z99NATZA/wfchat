/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CafePage from "@/pages/CafePage";

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
const room = {
	id: "11111111-1111-4111-8111-111111111111",
	inviteCode: "ABC123",
	isPrivate: false,
	playerCount: 1,
	capacity: 8,
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
		fireEvent.click(quickJoin);

		await waitFor(() => expect(serviceMocks.quickJoinCafe).toHaveBeenCalledTimes(1));
		expect(screen.queryByText(/login required/i)).toBeNull();
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
	});
});
