import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { useFont } from "@/hooks/useFont";
import { useTheme } from "@/hooks/useTheme";
import {
	persistAvatarOverlayPosition,
	persistAvatarOverlaySize,
	persistAvatarOverlayVisible,
	readAvatarOverlayPosition,
	readAvatarOverlaySize,
	readAvatarOverlayVisible,
	type AvatarOverlayPosition,
	type AvatarOverlaySize
} from "@/stores/avatarOverlayStore";
import {
	persistBackgroundImageUrl,
	readBackgroundImageUrl,
	writeBackgroundImageUrl
} from "@/stores/backgroundStore";
import {
	persistAssistantSpeechVisible,
	readAssistantSpeechVisible
} from "@/stores/assistantSpeechStore";
import type { AppFont } from "@/types/font";
import type { Theme } from "@/types/theme";

type AppSettingsContextValue = {
	theme: Theme;
	font: AppFont;
	backgroundImageUrl: string;
	isAvatarOverlayVisible: boolean;
	avatarOverlayPosition: AvatarOverlayPosition;
	avatarOverlaySize: AvatarOverlaySize;
	isAssistantSpeechVisible: boolean;
	setTheme: (theme: Theme) => void;
	setFont: (font: AppFont) => void;
	toggleTheme: () => void;
	setBackgroundImageUrl: (url: string) => void;
	setAvatarOverlayVisible: (isVisible: boolean) => void;
	setAvatarOverlayPosition: (position: AvatarOverlayPosition) => void;
	setAvatarOverlaySize: (size: AvatarOverlaySize) => void;
	setAssistantSpeechVisible: (isVisible: boolean) => void;
	applyPulledTheme: (theme: Theme) => void;
	applyPulledFont: (font: AppFont) => void;
	applyPulledBackgroundImageUrl: (url: string) => void;
};

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);

type AppSettingsProviderProps = {
	children: ReactNode;
};

export function AppSettingsProvider({ children }: AppSettingsProviderProps) {
	const { theme, setTheme, applyPulledTheme, toggleTheme } = useTheme();
	const { font, setFont, applyPulledFont } = useFont();
	const [backgroundImageUrl, setBackgroundImageUrlState] = useState(readBackgroundImageUrl);
	const [isAvatarOverlayVisible, setAvatarOverlayVisibleState] = useState(readAvatarOverlayVisible);
	const [avatarOverlayPosition, setAvatarOverlayPositionState] = useState(readAvatarOverlayPosition);
	const [avatarOverlaySize, setAvatarOverlaySizeState] = useState(readAvatarOverlaySize);
	const [isAssistantSpeechVisible, setAssistantSpeechVisibleState] = useState(readAssistantSpeechVisible);

	const setBackgroundImageUrl = useCallback((url: string) => {
		const nextUrl = url.trim();
		persistBackgroundImageUrl(nextUrl);
		setBackgroundImageUrlState(nextUrl);
	}, []);

	const applyPulledBackgroundImageUrl = useCallback((url: string) => {
		const nextUrl = url.trim();
		writeBackgroundImageUrl(nextUrl);
		setBackgroundImageUrlState(nextUrl);
	}, []);

	const setAvatarOverlayVisible = useCallback((isVisible: boolean) => {
		persistAvatarOverlayVisible(isVisible);
		setAvatarOverlayVisibleState(isVisible);
	}, []);

	const setAvatarOverlayPosition = useCallback((position: AvatarOverlayPosition) => {
		persistAvatarOverlayPosition(position);
		setAvatarOverlayPositionState(position);
	}, []);

	const setAvatarOverlaySize = useCallback((size: AvatarOverlaySize) => {
		persistAvatarOverlaySize(size);
		setAvatarOverlaySizeState(size);
	}, []);

	const setAssistantSpeechVisible = useCallback((isVisible: boolean) => {
		persistAssistantSpeechVisible(isVisible);
		setAssistantSpeechVisibleState(isVisible);
	}, []);

	const value = useMemo<AppSettingsContextValue>(
		() => ({
			theme,
			font,
			backgroundImageUrl,
			isAvatarOverlayVisible,
			avatarOverlayPosition,
			avatarOverlaySize,
			isAssistantSpeechVisible,
			setTheme,
			setFont,
			toggleTheme,
			setBackgroundImageUrl,
			setAvatarOverlayVisible,
			setAvatarOverlayPosition,
			setAvatarOverlaySize,
			setAssistantSpeechVisible,
			applyPulledTheme,
			applyPulledFont,
			applyPulledBackgroundImageUrl
		}),
		[
			theme,
			font,
			backgroundImageUrl,
			isAvatarOverlayVisible,
			avatarOverlayPosition,
			avatarOverlaySize,
			isAssistantSpeechVisible,
			setTheme,
			setFont,
			toggleTheme,
			setBackgroundImageUrl,
			setAvatarOverlayVisible,
			setAvatarOverlayPosition,
			setAvatarOverlaySize,
			setAssistantSpeechVisible,
			applyPulledTheme,
			applyPulledFont,
			applyPulledBackgroundImageUrl
		]
	);

	return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings() {
	const context = useContext(AppSettingsContext);

	if (!context) {
		throw new Error("useAppSettings must be used within AppSettingsProvider");
	}

	return context;
}
