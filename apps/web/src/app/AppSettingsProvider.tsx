import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { useFont } from "@/hooks/useFont";
import { useTheme } from "@/hooks/useTheme";
import { persistBackgroundImageUrl, readBackgroundImageUrl } from "@/stores/backgroundStore";
import type { AppFont } from "@/types/font";
import type { Theme } from "@/types/theme";

type AppSettingsContextValue = {
	theme: Theme;
	font: AppFont;
	backgroundImageUrl: string;
	setFont: (font: AppFont) => void;
	toggleTheme: () => void;
	setBackgroundImageUrl: (url: string) => void;
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

	const setBackgroundImageUrl = useCallback((url: string) => {
		const nextUrl = url.trim();
		persistBackgroundImageUrl(nextUrl);
		setBackgroundImageUrlState(nextUrl);
	}, []);

	const applyPulledBackgroundImageUrl = useCallback((url: string) => {
		setBackgroundImageUrlState(url.trim());
	}, []);

	const value = useMemo<AppSettingsContextValue>(
		() => ({
			theme,
			font,
			backgroundImageUrl,
			setFont,
			toggleTheme,
			setBackgroundImageUrl,
			applyPulledBackgroundImageUrl
		}),
		[
			theme,
			font,
			backgroundImageUrl,
			setFont,
			toggleTheme,
			setBackgroundImageUrl,
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
