import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const browserGlobals = {
	Blob: "readonly",
	CustomEvent: "readonly",
	Event: "readonly",
	EventSource: "readonly",
	File: "readonly",
	FileReader: "readonly",
	FormData: "readonly",
	HTMLElement: "readonly",
	HTMLInputElement: "readonly",
	MouseEvent: "readonly",
	ResizeObserver: "readonly",
	URL: "readonly",
	clearInterval: "readonly",
	console: "readonly",
	document: "readonly",
	fetch: "readonly",
	localStorage: "readonly",
	navigator: "readonly",
	setInterval: "readonly",
	setTimeout: "readonly",
	sessionStorage: "readonly",
	window: "readonly"
};

const testGlobals = {
	afterEach: "readonly",
	beforeEach: "readonly",
	describe: "readonly",
	expect: "readonly",
	it: "readonly",
	test: "readonly",
	vi: "readonly"
};

export default tseslint.config(
	{
		ignores: [
			"dist/**",
			"node_modules/**",
			"coverage/**",
			"playwright-report/**",
			"test-results/**"
		]
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ["**/*.{ts,tsx}"],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: "module",
			globals: browserGlobals
		},
		plugins: {
			"react-hooks": reactHooks,
			"react-refresh": reactRefresh
		},
		rules: {
			"react-hooks/rules-of-hooks": "error",
			"react-hooks/exhaustive-deps": "warn",
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					argsIgnorePattern: "^_",
					caughtErrorsIgnorePattern: "^_",
					varsIgnorePattern: "^_"
				}
			],
			"react-refresh/only-export-components": ["warn", { allowConstantExport: true }]
		}
	},
	{
		files: ["**/*.test.{ts,tsx}", "**/test/**/*.{ts,tsx}"],
		languageOptions: {
			globals: testGlobals
		}
	}
);
