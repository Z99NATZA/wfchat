/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MistwaterPage from "@/pages/MistwaterPage";

const gameProps = vi.hoisted(() => ({ resetSignal: -1 }));

vi.mock("@/features/mistwater/components/MistwaterGame", () => ({
	default: ({
		onSnapshot,
		resetSignal
	}: {
		onSnapshot: (snapshot: { blooms: number; streak: number; bestStreak: number }) => void;
		resetSignal: number;
	}) => {
		gameProps.resetSignal = resetSignal;
		return (
			<button
				data-testid="mistwater-game"
				onClick={() => onSnapshot({ blooms: 7, streak: 3, bestStreak: 5 })}
			>
				game
			</button>
		);
	}
}));
vi.mock("@/layouts/AppLayout", () => ({
	default: ({ children, sidebar }: { children: ReactNode; sidebar: ReactNode }) => (
		<div>
			{sidebar}
			{children}
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

describe("MistwaterPage", () => {
	afterEach(() => {
		cleanup();
		gameProps.resetSignal = -1;
	});

	it("shows live arcade stats and can reset the local run", () => {
		render(
			<MistwaterPage
				activityBar={null}
				backgroundImageUrl=""
				headerControls={headerControls}
			/>
		);

		expect(screen.getByTestId("mistwater-stage")).toBeTruthy();
		expect(screen.getByText("mistwater.game.hint")).toBeTruthy();

		fireEvent.click(screen.getByTestId("mistwater-game"));
		expect(screen.getAllByText("7")).toHaveLength(2);
		expect(screen.getAllByText("×3")).toHaveLength(2);
		expect(screen.getByText("×5")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "mistwater.actions.reset" }));
		expect(gameProps.resetSignal).toBe(1);
		expect(screen.getAllByText("0").length).toBeGreaterThan(0);
	});
});
