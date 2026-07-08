import { useCallback, useEffect, useRef, useState } from "react";
import {
	applyFontToDocument,
	persistFont,
	resolveInitialFont,
	writeFont
} from "@/stores/fontStore";
import type { AppFont } from "@/types/font";

export function useFont() {
	const [font, setFont] = useState<AppFont>(resolveInitialFont);
	const fontRef = useRef(font);

	useEffect(() => {
		applyFontToDocument(font);
	}, [font]);

	const setLocalFont = useCallback((nextFont: AppFont) => {
		fontRef.current = nextFont;
		persistFont(nextFont);
		applyFontToDocument(nextFont);
		setFont(nextFont);
	}, []);

	const applyPulledFont = useCallback((nextFont: AppFont) => {
		fontRef.current = nextFont;
		writeFont(nextFont);
		applyFontToDocument(nextFont);
		setFont(nextFont);
	}, []);

	return {
		font,
		setFont: setLocalFont,
		applyPulledFont
	};
}
