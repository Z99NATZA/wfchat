import { useCallback, useEffect, useRef, useState } from "react";
import {
	applyThemeToDocument,
	persistTheme,
	resolveInitialTheme,
	writeTheme
} from "@/stores/themeStore";
import type { Theme } from "@/types/theme";

export function useTheme() {
	const [theme, setTheme] = useState<Theme>(resolveInitialTheme);
	const themeRef = useRef(theme);

	useEffect(() => {
		applyThemeToDocument(theme);
	}, [theme]);

	const setLocalTheme = useCallback((nextTheme: Theme) => {
		themeRef.current = nextTheme;
		persistTheme(nextTheme);
		applyThemeToDocument(nextTheme);
		setTheme(nextTheme);
	}, []);

	const applyPulledTheme = useCallback((nextTheme: Theme) => {
		themeRef.current = nextTheme;
		writeTheme(nextTheme);
		applyThemeToDocument(nextTheme);
		setTheme(nextTheme);
	}, []);

	const toggleTheme = useCallback(() => {
		const nextTheme = themeRef.current === "dark" ? "light" : "dark";
		setLocalTheme(nextTheme);
	}, [setLocalTheme]);

	return {
		theme,
		setTheme: setLocalTheme,
		applyPulledTheme,
		toggleTheme
	};
}
