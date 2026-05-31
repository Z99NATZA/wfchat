export const FONT_OPTIONS = [
	{ id: "inter", label: "Inter" },
	{ id: "itim", label: "Itim" },
	{ id: "jetbrains-mono", label: "JetBrains Mono" }
] as const;

export type AppFont = (typeof FONT_OPTIONS)[number]["id"];
