/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppSettingsDialog from "@/components/settings/AppSettingsDialog";

vi.mock("@/i18n", () => ({
	useI18n: () => ({
		t: (key: string) => {
			if (key === "settings.assistantSpeech.showInChat") {
				return "Show voice playback";
			}
			if (key === "settings.assistantSpeech.autoPlayLatest") {
				return "Auto-play latest reply";
			}
			return key;
		}
	})
}));

const baseProps = {
	isOpen: true,
	backgroundImageUrl: "",
	isAvatarOverlayVisible: true,
	isAssistantSpeechVisible: true,
	isAssistantSpeechAutoPlayEnabled: false,
	avatarOverlayPosition: "bottom-right" as const,
	avatarOverlaySize: "small" as const,
	onClose: vi.fn(),
	onUpdateBackgroundImageUrl: vi.fn(),
	onAvatarOverlayVisibleChange: vi.fn(),
	onAvatarOverlayPositionChange: vi.fn(),
	onAvatarOverlaySizeChange: vi.fn(),
	onAssistantSpeechVisibleChange: vi.fn(),
	onAssistantSpeechAutoPlayEnabledChange: vi.fn()
};

describe("AppSettingsDialog", () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("lets users toggle assistant voice playback visibility", () => {
		render(<AppSettingsDialog {...baseProps} />);

		fireEvent.click(screen.getByRole("switch", { name: "Show voice playback" }));

		expect(baseProps.onAssistantSpeechVisibleChange).toHaveBeenCalledWith(false);
	});

	it("lets users toggle assistant voice auto-play", () => {
		render(<AppSettingsDialog {...baseProps} />);

		fireEvent.click(screen.getByRole("switch", { name: "Auto-play latest reply" }));

		expect(baseProps.onAssistantSpeechAutoPlayEnabledChange).toHaveBeenCalledWith(true);
	});
});
