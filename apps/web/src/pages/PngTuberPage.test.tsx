/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PngTuberPage from "@/pages/PngTuberPage";

const runtimeMocks = vi.hoisted(() => ({
	setExpression: vi.fn(),
	setMotionState: vi.fn()
}));

vi.mock("@/layouts/AppLayout", () => ({
	default: ({ children }: { children: ReactNode }) => <div>{children}</div>
}));

vi.mock("@/features/avatar/renderers/pngtuber/PngTuberRenderer", () => ({
	default: ({ alt }: { alt: string }) => <div aria-label={alt} />
}));

vi.mock("@/features/avatar/runtime/avatarRuntimeStore", () => ({
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

vi.mock("@/i18n", () => ({
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

		fireEvent.click(
			within(emotionStrip as HTMLElement).getByRole("button", {
				name: "pngtuber.emotion.happy"
			})
		);

		expect(runtimeMocks.setExpression).toHaveBeenCalledWith("happy");
	});
});
