import { useEffect, useState } from "react";
import { applyFontToDocument, persistFont, resolveInitialFont } from "@/stores/fontStore";
import type { AppFont } from "@/types/font";

export function useFont() {
	const [font, setFont] = useState<AppFont>(resolveInitialFont);

	useEffect(() => {
		applyFontToDocument(font);
		persistFont(font);
	}, [font]);

	return {
		font,
		setFont
	};
}
