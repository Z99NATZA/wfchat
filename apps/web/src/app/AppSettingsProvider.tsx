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
import { persistBackgroundImageUrl, readBackgroundImageUrl } from "@/stores/backgroundStore";
import type { AppFont } from "@/types/font";
import type { Theme } from "@/types/theme";

type AppSettingsContextValue = {
	theme: Theme;
	font: AppFont;
	backgroundImageUrl: string;
	isAvatarOverlayVisible: boolean;
	avatarOverlayPosition: AvatarOverlayPosition;
	avatarOverlaySize: AvatarOverlaySize;
	setFont: (font: AppFont) => void;
	toggleTheme: () => void;
	setBackgroundImageUrl: (url: string) => void;
	setAvatarOverlayVisible: (isVisible: boolean) => void;
	setAvatarOverlayPosition: (position: AvatarOverlayPosition) => void;
	setAvatarOverlaySize: (size: AvatarOverlaySize) => void;
	applyPulledBackgroundImageUrl: (url: string) => void;
};

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);

type AppSettingsProviderProps = {
	children: ReactNode;
};

export function AppSettingsProvider({ children }: AppSettingsProviderProps) {
	const { theme, toggleTheme } = useTheme();
	const { font, setFont } = useFont();
	const [backgroundImageUrl, setBackgroundImageUrlState] = useState(readBackgroundImageUrl);
	const [isAvatarOverlayVisible, setAvatarOverlayVisibleState] = useState(readAvatarOverlayVisible);
	const [avatarOverlayPosition, setAvatarOverlayPositionState] = useState(readAvatarOverlayPosition);
	const [avatarOverlaySize, setAvatarOverlaySizeState] = useState(readAvatarOverlaySize);

	const setBackgroundImageUrl = useCallback((url: string) => {
		const nextUrl = url.trim();
		persistBackgroundImageUrl(nextUrl);
		setBackgroundImageUrlState(nextUrl);
	}, []);

	const applyPulledBackgroundImageUrl = useCallback((url: string) => {
		setBackgroundImageUrlState(url.trim());
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

	const value = useMemo<AppSettingsContextValue>(
		() => ({
			theme,
			font,
			backgroundImageUrl,
			isAvatarOverlayVisible,
			avatarOverlayPosition,
			avatarOverlaySize,
			setFont,
			toggleTheme,
			setBackgroundImageUrl,
			setAvatarOverlayVisible,
			setAvatarOverlayPosition,
			setAvatarOverlaySize,
			applyPulledBackgroundImageUrl
		}),
		[
			theme,
			font,
			backgroundImageUrl,
			isAvatarOverlayVisible,
			avatarOverlayPosition,
			avatarOverlaySize,
			setFont,
			toggleTheme,
			setBackgroundImageUrl,
			setAvatarOverlayVisible,
			setAvatarOverlayPosition,
			setAvatarOverlaySize,
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
