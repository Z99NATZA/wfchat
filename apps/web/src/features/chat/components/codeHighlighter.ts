import type { Theme } from "@/types/theme";

export type HighlightedCodeToken = {
	content: string;
	color?: string;
	fontStyle?: "bold" | "italic" | "underline";
};

export type HighlightedCodeLine = HighlightedCodeToken[];

export type HighlightedCode = {
	lines: HighlightedCodeLine[];
};

type HighlightCodeOptions = {
	code: string;
	language?: string;
	theme: Theme;
};

type ShikiToken = {
	content: string;
	color?: string;
	fontStyle?: number;
};

type ShikiBundleWeb = {
	codeToTokens: (
		code: string,
		options: {
			lang: SupportedHighlightLanguage;
			theme: SupportedHighlightTheme;
			tokenizeMaxLineLength: number;
			tokenizeTimeLimit: number;
		}
	) => { tokens: ShikiToken[][] } | Promise<{ tokens: ShikiToken[][] }>;
};

type FineGrainedHighlighterFactory = (options: {
	langs: SupportedHighlightLanguage[];
	themes: SupportedHighlightTheme[];
	warnings: boolean;
}) => Promise<ShikiBundleWeb>;

type SupportedHighlightLanguage =
	| "bash"
	| "css"
	| "diff"
	| "go"
	| "html"
	| "javascript"
	| "jsx"
	| "json"
	| "markdown"
	| "python"
	| "rust"
	| "sql"
	| "tsx"
	| "typescript"
	| "yaml";

type SupportedHighlightTheme = "github-light" | "one-dark-pro";

const syntaxHighlightThemeByAppTheme = {
	light: "github-light",
	dark: "one-dark-pro"
} as const satisfies Record<Theme, SupportedHighlightTheme>;

const maxHighlightCodeLength = 20_000;
const maxHighlightLineLength = 1_000;
const highlightDebounceMs = 180;
const maxHighlightCacheEntries = 120;
const supportedHighlightLanguages = new Set<SupportedHighlightLanguage>([
	"bash",
	"css",
	"diff",
	"go",
	"html",
	"javascript",
	"jsx",
	"json",
	"markdown",
	"python",
	"rust",
	"sql",
	"tsx",
	"typescript",
	"yaml"
]);
const highlightedCodeCache = new Map<string, HighlightedCode>();
const highlighterPromises = new Map<SupportedHighlightLanguage, Promise<ShikiBundleWeb>>();
let highlighterFactoryPromise: Promise<FineGrainedHighlighterFactory> | null = null;

export function getHighlightDebounceMs() {
	return highlightDebounceMs;
}

export function canHighlightCode(code: string, language?: string) {
	return Boolean(normalizeLanguage(language)) && code.length > 0 && code.length <= maxHighlightCodeLength;
}

export function getCachedHighlightedCode({ code, language, theme }: HighlightCodeOptions): HighlightedCode | null {
	const normalizedLanguage = normalizeLanguage(language);

	if (!normalizedLanguage || !canHighlightCode(code, normalizedLanguage)) {
		return null;
	}

	return highlightedCodeCache.get(createHighlightCacheKey(code, normalizedLanguage, theme)) ?? null;
}

export async function highlightCode({ code, language, theme }: HighlightCodeOptions): Promise<HighlightedCode | null> {
	const normalizedLanguage = normalizeLanguage(language);

	if (!normalizedLanguage || !canHighlightCode(code, normalizedLanguage)) {
		return null;
	}

	const cacheKey = createHighlightCacheKey(code, normalizedLanguage, theme);
	const cachedHighlight = getCachedHighlightedCode({ code, language: normalizedLanguage, theme });

	if (cachedHighlight) {
		return cachedHighlight;
	}

	const shiki = await getHighlighter(normalizedLanguage);

	const result = await shiki.codeToTokens(code, {
		lang: normalizedLanguage,
		theme: syntaxHighlightThemeByAppTheme[theme],
		tokenizeMaxLineLength: maxHighlightLineLength,
		tokenizeTimeLimit: 200
	});
	const highlightedCode = {
		lines: result.tokens.map((line) =>
			line.map((token) => ({
				content: token.content,
				color: token.color,
				fontStyle: mapShikiFontStyle(token.fontStyle)
			}))
		)
	};

	writeHighlightCache(cacheKey, highlightedCode);

	return highlightedCode;
}

async function getHighlighter(language: SupportedHighlightLanguage) {
	const cachedHighlighterPromise = highlighterPromises.get(language);

	if (cachedHighlighterPromise) {
		return cachedHighlighterPromise;
	}

	const nextHighlighterPromise = createHighlighter(language);
	highlighterPromises.set(language, nextHighlighterPromise);

	return nextHighlighterPromise;
}

async function createHighlighter(language: SupportedHighlightLanguage): Promise<ShikiBundleWeb> {
	const createFineGrainedHighlighter = await getHighlighterFactory();

	return createFineGrainedHighlighter({
		langs: [language],
		themes: Object.values(syntaxHighlightThemeByAppTheme),
		warnings: false
	});
}

async function getHighlighterFactory() {
	if (!highlighterFactoryPromise) {
		highlighterFactoryPromise = createHighlighterFactory();
	}

	return highlighterFactoryPromise;
}

async function createHighlighterFactory(): Promise<FineGrainedHighlighterFactory> {
	const [{ createBundledHighlighter }, { createJavaScriptRegexEngine }] = await Promise.all([
		import("shiki/core"),
		import("shiki/engine/javascript")
	]);

	return createBundledHighlighter({
		langs: {
			bash: () => import("@shikijs/langs/bash"),
			css: () => import("@shikijs/langs/css"),
			diff: () => import("@shikijs/langs/diff"),
			go: () => import("@shikijs/langs/go"),
			html: () => import("@shikijs/langs/html"),
			javascript: () => import("@shikijs/langs/javascript"),
			jsx: () => import("@shikijs/langs/jsx"),
			json: () => import("@shikijs/langs/json"),
			markdown: () => import("@shikijs/langs/markdown"),
			python: () => import("@shikijs/langs/python"),
			rust: () => import("@shikijs/langs/rust"),
			sql: () => import("@shikijs/langs/sql"),
			tsx: () => import("@shikijs/langs/tsx"),
			typescript: () => import("@shikijs/langs/typescript"),
			yaml: () => import("@shikijs/langs/yaml")
		},
		themes: {
			"github-light": () => import("@shikijs/themes/github-light"),
			"one-dark-pro": () => import("@shikijs/themes/one-dark-pro")
		},
		engine: () => createJavaScriptRegexEngine()
	}) as unknown as FineGrainedHighlighterFactory;
}

function normalizeLanguage(language?: string): SupportedHighlightLanguage | null {
	if (!language) {
		return null;
	}

	const normalizedLanguage = language.trim().toLowerCase();

	if (!normalizedLanguage) {
		return null;
	}

	const languageAliases: Record<string, SupportedHighlightLanguage> = {
		js: "javascript",
		jsx: "jsx",
		golang: "go",
		md: "markdown",
		py: "python",
		rs: "rust",
		sh: "bash",
		shell: "bash",
		shellscript: "bash",
		ts: "typescript",
		yml: "yaml"
	};
	const resolvedLanguage = languageAliases[normalizedLanguage] ?? normalizedLanguage;

	if (supportedHighlightLanguages.has(resolvedLanguage as SupportedHighlightLanguage)) {
		return resolvedLanguage as SupportedHighlightLanguage;
	}

	return null;
}

function createHighlightCacheKey(code: string, language: string, theme: Theme) {
	return `${theme}:${language}:${code}`;
}

function writeHighlightCache(cacheKey: string, highlightedCode: HighlightedCode) {
	if (highlightedCodeCache.size >= maxHighlightCacheEntries) {
		const firstCacheKey = highlightedCodeCache.keys().next().value;

		if (firstCacheKey) {
			highlightedCodeCache.delete(firstCacheKey);
		}
	}

	highlightedCodeCache.set(cacheKey, highlightedCode);
}

function mapShikiFontStyle(fontStyle?: number): HighlightedCodeToken["fontStyle"] {
	if (!fontStyle) {
		return undefined;
	}

	if (fontStyle & 1) {
		return "italic";
	}

	if (fontStyle & 2) {
		return "bold";
	}

	if (fontStyle & 4) {
		return "underline";
	}

	return undefined;
}
