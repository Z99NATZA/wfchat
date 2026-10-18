/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MistwaterPage from "@/pages/MistwaterPage";

vi.mock("@/features/mistwater/components/MistwaterGame", () => ({
	default: ({ ariaLabel }: { ariaLabel: string }) => (
		<div data-testid="mistwater-game" aria-label={ariaLabel} />
	)
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
	afterEach(cleanup);

	it("shows the water study without gameplay decorations", () => {
		render(
			<MistwaterPage
				activityBar={null}
				backgroundImageUrl=""
				headerControls={headerControls}
			/>
		);

		expect(screen.getByTestId("mistwater-stage")).toBeTruthy();
		expect(screen.getByLabelText("mistwater.game.ariaLabel")).toBeTruthy();
		expect(screen.queryByTestId("mistwater-sidebar")).toBeNull();
		expect(screen.queryByText("mistwater.game.hint")).toBeNull();
	});
});
