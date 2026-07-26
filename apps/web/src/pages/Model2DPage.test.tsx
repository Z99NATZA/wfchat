/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Model2DPage from "@/pages/Model2DPage";

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
	useI18n: () => ({
		t: (key: string) => key
	})
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

describe("Model2DPage", () => {
	afterEach(cleanup);

	it("keeps the route visible while clearly disabling its unfinished workspace", () => {
		render(
			<Model2DPage activityBar={null} backgroundImageUrl="" headerControls={headerControls} />
		);

		const stage = screen.getByTestId("model2d-stage");
		expect(stage.getAttribute("aria-disabled")).toBe("true");
		expect(screen.getByTestId("model2d-disabled-preview").className).toContain("opacity-30");
		expect(screen.getByTestId("model2d-unavailable").textContent).toContain(
			"model2d.viewport.unavailableTitle"
		);
		expect(screen.getByTestId("model2d-unavailable").textContent).toContain(
			"model2d.viewport.unavailableDescription"
		);

		const disabledControls = screen.getByTestId("model2d-disabled-controls");
		expect(disabledControls.className).toContain("opacity-30");
		expect(disabledControls.querySelectorAll("button:not(:disabled)")).toHaveLength(0);

		const details = screen.getByTestId("model2d-details");
		expect(details.childElementCount).toBe(0);
		expect(details.className).toContain("w-14");
		expect(details.className).toContain("hidden");
		expect(details.className).toContain("xl:flex");
	});
});
