import { type ReactNode, useCallback, useMemo, useState } from "react";
import { AppSettingsContext, type AppSettingsContextValue } from "@/app/AppSettingsContext";
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
	persistAssistantSpeechAutoPlay,
	persistAssistantSpeechVisible,
	readAssistantSpeechAutoPlay,
	readAssistantSpeechVisible
} from "@/stores/assistantSpeechStore";
type AppSettingsProviderProps = {
	children: ReactNode;
};

export function AppSettingsProvider({ children }: AppSettingsProviderProps) {
	const { theme, setTheme, applyPulledTheme, toggleTheme } = useTheme();
	const { font, setFont, applyPulledFont } = useFont();
	const [backgroundImageUrl, setBackgroundImageUrlState] = useState(readBackgroundImageUrl);
	const [isAvatarOverlayVisible, setAvatarOverlayVisibleState] =
		useState(readAvatarOverlayVisible);
	const [avatarOverlayPosition, setAvatarOverlayPositionState] =
		useState(readAvatarOverlayPosition);
	const [avatarOverlaySize, setAvatarOverlaySizeState] = useState(readAvatarOverlaySize);
	const [isAssistantSpeechVisible, setAssistantSpeechVisibleState] = useState(
		readAssistantSpeechVisible
	);
	const [isAssistantSpeechAutoPlayEnabled, setAssistantSpeechAutoPlayEnabledState] = useState(
		readAssistantSpeechAutoPlay
	);

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

	const setAssistantSpeechAutoPlayEnabled = useCallback((isEnabled: boolean) => {
		persistAssistantSpeechAutoPlay(isEnabled);
		setAssistantSpeechAutoPlayEnabledState(isEnabled);
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
			isAssistantSpeechAutoPlayEnabled,
			setTheme,
			setFont,
			toggleTheme,
			setBackgroundImageUrl,
			setAvatarOverlayVisible,
			setAvatarOverlayPosition,
			setAvatarOverlaySize,
			setAssistantSpeechVisible,
			setAssistantSpeechAutoPlayEnabled,
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
			isAssistantSpeechAutoPlayEnabled,
			setTheme,
			setFont,
			toggleTheme,
			setBackgroundImageUrl,
			setAvatarOverlayVisible,
			setAvatarOverlayPosition,
			setAvatarOverlaySize,
			setAssistantSpeechVisible,
			setAssistantSpeechAutoPlayEnabled,
			applyPulledTheme,
			applyPulledFont,
			applyPulledBackgroundImageUrl
		]
	);

	return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}
