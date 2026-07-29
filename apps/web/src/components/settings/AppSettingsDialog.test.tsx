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

		const voiceSwitch = screen.getByRole("switch", { name: "Show voice playback" });
		const track = voiceSwitch.querySelector("[data-switch-track]");
		const thumb = voiceSwitch.querySelector("[data-switch-thumb]");

		expect(track?.className).toContain("border-action-border");
		expect(track?.className).toContain("bg-action");
		expect(track?.className).not.toContain("dark:bg-");
		expect(thumb?.className).toContain("left-6");
		expect(thumb?.className).toContain("bg-action-text");

		fireEvent.click(voiceSwitch);

		expect(baseProps.onAssistantSpeechVisibleChange).toHaveBeenCalledWith(false);
	});

	it("lets users toggle assistant voice auto-play", () => {
		render(<AppSettingsDialog {...baseProps} />);

		const autoPlaySwitch = screen.getByRole("switch", {
			name: "Auto-play latest reply"
		});
		const track = autoPlaySwitch.querySelector("[data-switch-track]");
		const thumb = autoPlaySwitch.querySelector("[data-switch-thumb]");

		expect(track?.className).toContain("border-dialog-border");
		expect(track?.className).toContain("bg-transparent");
		expect(track?.className).not.toContain("dark:bg-");
		expect(thumb?.className).toContain("left-1");
		expect(thumb?.className).toContain("bg-muted/60");

		fireEvent.click(autoPlaySwitch);

		expect(baseProps.onAssistantSpeechAutoPlayEnabledChange).toHaveBeenCalledWith(true);
	});

	it("uses one group border and a filled borderless active segment", () => {
		render(<AppSettingsDialog {...baseProps} />);

		const activePosition = screen.getByRole("button", {
			name: "settings.avatarOverlay.positionBottomRight"
		});
		const inactivePosition = screen.getByRole("button", {
			name: "settings.avatarOverlay.positionBottomLeft"
		});
		const positionGroup = activePosition.parentElement;

		expect(positionGroup?.className).toContain("border-dialog-border");
		expect(activePosition.className).toContain("button--segment-selected");
		expect(activePosition.className).not.toContain("button--selected");
		expect(inactivePosition.className).toContain("button--segment");
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
