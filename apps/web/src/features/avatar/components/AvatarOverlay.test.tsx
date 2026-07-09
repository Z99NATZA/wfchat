/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AvatarOverlay from "@/features/avatar/components/AvatarOverlay";

vi.mock("@/features/avatar/renderers/pngtuber/PngTuberRenderer", () => ({
	default: ({ alt }: { alt: string }) => <img alt={alt} />
}));

vi.mock("@/features/avatar/runtime/avatarRuntimeContext", () => ({
	useAvatarRuntime: () => ({
		state: {
			rendererKind: "pngtuber",
			expressionId: "neutral",
			motionState: "idle"
		}
	})
}));

vi.mock("@/i18n/i18nContext", () => ({
	useI18n: () => ({
		t: (key: string) => key
	})
}));

describe("AvatarOverlay", () => {
	afterEach(() => {
		cleanup();
	});

	it("positions itself above the measured composer offset", () => {
		render(<AvatarOverlay position="bottom-right" size="small" bottomOffsetPx={148} />);

		expect(screen.getByLabelText("pngtuber.header.title").style.bottom).toBe(
			"calc(148px + 0.75rem)"
		);
	});
});
