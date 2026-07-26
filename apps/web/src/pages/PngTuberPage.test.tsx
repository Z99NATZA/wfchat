/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PngTuberPage from "@/pages/PngTuberPage";

const runtimeMocks = vi.hoisted(() => ({
	setExpression: vi.fn(),
	setMotionState: vi.fn()
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
			{details}
		</div>
	)
}));

vi.mock("@/features/avatar/renderers/pngtuber/PngTuberRenderer", () => ({
	default: ({ alt }: { alt: string }) => <div aria-label={alt} />
}));

vi.mock("@/features/avatar/runtime/avatarRuntimeContext", () => ({
	useAvatarRuntime: () => ({
		state: {
			avatarId: "aiko-pngtuber",
			rendererKind: "pngtuber",
			expressionId: "neutral",
			motionState: "idle",
			drivenBy: "manual"
		},
		setExpression: runtimeMocks.setExpression,
		setMotionState: runtimeMocks.setMotionState
	})
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

describe("PngTuberPage", () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("keeps viewport emotion controls above the performer layer and clickable", () => {
		const { container } = render(
			<PngTuberPage
				activityBar={null}
				backgroundImageUrl=""
				headerControls={headerControls}
			/>
		);
		const emotionStrip = container.querySelector<HTMLElement>("[data-pngtuber-emotion-strip]");

		expect(emotionStrip).not.toBeNull();
		expect(emotionStrip?.className).toContain("z-30");
		expect(emotionStrip?.className).toContain("lg:hidden");

		fireEvent.click(
			within(emotionStrip as HTMLElement).getByRole("button", {
				name: "pngtuber.emotion.happy"
			})
		);

		expect(runtimeMocks.setExpression).toHaveBeenCalledWith("happy");
	});

	it("keeps only expressions in the sidebar and renders an empty desktop right bar", () => {
		render(
			<PngTuberPage
				activityBar={null}
				backgroundImageUrl=""
				headerControls={headerControls}
			/>
		);

		const sidebar = screen.getByTestId("pngtuber-sidebar");
		expect(sidebar.textContent).toContain("pngtuber.sidebar.title");
		expect(sidebar.textContent).toContain("pngtuber.sidebar.expressions");
		expect(sidebar.textContent).not.toContain("pngtuber.sidebar.assets");
		expect(sidebar.textContent).not.toContain("pngtuber.assets.aikoPngTuber");
		expect(sidebar.textContent).not.toContain("pngtuber.tools.pose");

		const details = screen.getByTestId("pngtuber-details");
		expect(details.childElementCount).toBe(0);
		expect(details.className).toContain("w-14");
		expect(details.className).toContain("hidden");
		expect(details.className).toContain("xl:flex");
	});
});
