import { createContext, useContext } from "react";
import type { AvatarOverlayPosition, AvatarOverlaySize } from "@/stores/avatarOverlayStore";
import type { AppFont } from "@/types/font";
import type { Theme } from "@/types/theme";

export type AppSettingsContextValue = {
	theme: Theme;
	font: AppFont;
	backgroundImageUrl: string;
	isAvatarOverlayVisible: boolean;
	avatarOverlayPosition: AvatarOverlayPosition;
	avatarOverlaySize: AvatarOverlaySize;
	isAssistantSpeechVisible: boolean;
	isAssistantSpeechAutoPlayEnabled: boolean;
	setTheme: (theme: Theme) => void;
	setFont: (font: AppFont) => void;
	toggleTheme: () => void;
	setBackgroundImageUrl: (url: string) => void;
	setAvatarOverlayVisible: (isVisible: boolean) => void;
	setAvatarOverlayPosition: (position: AvatarOverlayPosition) => void;
	setAvatarOverlaySize: (size: AvatarOverlaySize) => void;
	setAssistantSpeechVisible: (isVisible: boolean) => void;
	setAssistantSpeechAutoPlayEnabled: (isEnabled: boolean) => void;
	applyPulledTheme: (theme: Theme) => void;
	applyPulledFont: (font: AppFont) => void;
	applyPulledBackgroundImageUrl: (url: string) => void;
};

export const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);

export function useAppSettings() {
	const context = useContext(AppSettingsContext);

	if (!context) {
		throw new Error("useAppSettings must be used within AppSettingsProvider");
	}

	return context;
}
