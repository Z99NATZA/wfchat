import { useCallback, useEffect, useState } from "react";
import {
	applyThemeToDocument,
	persistTheme,
	resolveInitialTheme
} from "@/stores/themeStore";
import type { Theme } from "@/types/theme";

export function useTheme() {
	const [theme, setTheme] = useState<Theme>(resolveInitialTheme);

	useEffect(() => {
		applyThemeToDocument(theme);
		persistTheme(theme);
	}, [theme]);

	const toggleTheme = useCallback(() => {
		setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
	}, []);

	return {
		theme,
		setTheme,
		toggleTheme
	};
}
