/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppSettingsDialog from "@/components/settings/AppSettingsDialog";

const dialogMocks = vi.hoisted(() => ({
	alert: vi.fn(),
	confirm: vi.fn()
}));

vi.mock("@/components/dialog/DialogContext", () => ({
	useDialog: () => dialogMocks
}));

vi.mock("@/i18n/i18nContext", () => ({
	useI18n: () => ({
		t: (key: string, params?: Record<string, string>) => {
			if (key === "settings.assistantSpeech.showInChat") {
				return "Show voice playback";
			}
			if (key === "settings.assistantSpeech.autoPlayLatest") {
				return "Auto-play latest reply";
			}
			if (key === "settings.assistantSpeech.credits") {
				return "Credits";
			}
			if (key === "settings.memory.reset") {
				return `Clear ${params?.aiko}'s memory`;
			}
			if (key === "settings.memory.resetConfirm") {
				return `Clear ${params?.aiko}'s memory?`;
			}
			if (key === "settings.memory.resetError") {
				return `Could not clear ${params?.aiko}'s memory`;
			}
			return key;
		}
	})
}));

const baseProps = {
	isOpen: true,
	backgroundImageUrl: "",
	voiceCredits: [],
	isAvatarOverlayVisible: true,
	isAssistantSpeechVisible: true,
	isAssistantSpeechAutoPlayEnabled: false,
	avatarOverlayPosition: "bottom-right" as const,
	avatarOverlaySize: "small" as const,
	aikoName: "Aiko",
	onClose: vi.fn(),
	onUpdateBackgroundImageUrl: vi.fn(),
	onAvatarOverlayVisibleChange: vi.fn(),
	onAvatarOverlayPositionChange: vi.fn(),
	onAvatarOverlaySizeChange: vi.fn(),
	onAssistantSpeechVisibleChange: vi.fn(),
	onAssistantSpeechAutoPlayEnabledChange: vi.fn(),
	onResetLearnedContext: vi.fn().mockResolvedValue(undefined)
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

	it("shows configured voice credits without adding controls", () => {
		render(
			<AppSettingsDialog {...baseProps} voiceCredits={[{ text: "VOICEVOX: Test Speaker" }]} />
		);

		expect(screen.getByText("Credits")).toBeTruthy();
		expect(screen.getByText("VOICEVOX: Test Speaker")).toBeTruthy();
		expect(screen.queryByLabelText(/provider/i)).toBeNull();
		expect(screen.queryByLabelText(/speaker/i)).toBeNull();
	});

	it("interpolates the character name and resets only after confirmation", async () => {
		dialogMocks.confirm.mockResolvedValue(true);
		render(<AppSettingsDialog {...baseProps} />);

		fireEvent.click(screen.getByRole("button", { name: "Clear Aiko's memory" }));

		await waitFor(() => {
			expect(dialogMocks.confirm).toHaveBeenCalledWith({
				title: "Clear Aiko's memory?",
				confirmLabel: "Clear Aiko's memory",
				tone: "destructive"
			});
			expect(baseProps.onResetLearnedContext).toHaveBeenCalledTimes(1);
		});
	});

	it("does not reset learned context when confirmation is cancelled", async () => {
		dialogMocks.confirm.mockResolvedValue(false);
		render(<AppSettingsDialog {...baseProps} />);

		fireEvent.click(screen.getByRole("button", { name: "Clear Aiko's memory" }));

		await waitFor(() => expect(dialogMocks.confirm).toHaveBeenCalledTimes(1));
		expect(baseProps.onResetLearnedContext).not.toHaveBeenCalled();
	});
});
