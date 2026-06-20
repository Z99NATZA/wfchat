/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const shikiMock = vi.hoisted(() => ({
	createBundledHighlighter: vi.fn(),
	createJavaScriptRegexEngine: vi.fn(() => ({})),
	createFineGrainedHighlighter: vi.fn(),
	codeToTokens: vi.fn()
}));

vi.mock("shiki/core", () => ({
	createBundledHighlighter: shikiMock.createBundledHighlighter
}));

vi.mock("shiki/engine/javascript", () => ({
	createJavaScriptRegexEngine: shikiMock.createJavaScriptRegexEngine
}));

describe("codeHighlighter", () => {
	beforeEach(() => {
		vi.resetModules();
		shikiMock.createBundledHighlighter.mockReset();
		shikiMock.createJavaScriptRegexEngine.mockClear();
		shikiMock.createFineGrainedHighlighter.mockReset();
		shikiMock.codeToTokens.mockReset();
		shikiMock.createFineGrainedHighlighter.mockResolvedValue({
			codeToTokens: shikiMock.codeToTokens
		});
		shikiMock.createBundledHighlighter.mockReturnValue(shikiMock.createFineGrainedHighlighter);
		shikiMock.codeToTokens.mockResolvedValue({
			tokens: [
				[
					{ content: "const", color: "#cf222e" },
					{ content: " enabled", color: "#24292f" }
				]
			]
		});
	});

	it("highlights known fenced-code languages into renderable tokens", async () => {
		const { highlightCode } = await import("./codeHighlighter");

		const result = await highlightCode({
			code: "const enabled = true;",
			language: "ts",
			theme: "light"
		});

		expect(result?.lines[0][0]).toEqual({ content: "const", color: "#cf222e" });
		expect(shikiMock.codeToTokens).toHaveBeenCalledWith("const enabled = true;", {
			lang: "typescript",
			theme: "github-light",
			tokenizeMaxLineLength: 1000,
			tokenizeTimeLimit: 200
		});
		expect(shikiMock.createFineGrainedHighlighter).toHaveBeenCalledWith({
			langs: ["typescript"],
			themes: ["github-light", "github-dark"],
			warnings: false
		});
	});

	it("uses a dark Shiki theme for dark app theme", async () => {
		const { highlightCode } = await import("./codeHighlighter");

		await highlightCode({
			code: "const enabled = true;",
			language: "ts",
			theme: "dark"
		});

		expect(shikiMock.codeToTokens).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({ theme: "github-dark" })
		);
	});

	it("supports Rust language aliases", async () => {
		const { highlightCode } = await import("./codeHighlighter");

		await highlightCode({
			code: "let value = 1;",
			language: "rs",
			theme: "light"
		});

		expect(shikiMock.codeToTokens).toHaveBeenCalledWith(
			"let value = 1;",
			expect.objectContaining({ lang: "rust" })
		);
		expect(shikiMock.createFineGrainedHighlighter).toHaveBeenCalledWith(
			expect.objectContaining({ langs: ["rust"] })
		);
	});

	it("supports Go language aliases", async () => {
		const { highlightCode } = await import("./codeHighlighter");

		await highlightCode({
			code: "package main\nfunc main() {}",
			language: "golang",
			theme: "light"
		});

		expect(shikiMock.codeToTokens).toHaveBeenCalledWith(
			"package main\nfunc main() {}",
			expect.objectContaining({ lang: "go" })
		);
		expect(shikiMock.createFineGrainedHighlighter).toHaveBeenCalledWith(
			expect.objectContaining({ langs: ["go"] })
		);
	});

	it("falls back to plain code for unknown languages", async () => {
		const { highlightCode } = await import("./codeHighlighter");

		const result = await highlightCode({
			code: "hello",
			language: "unknown-language",
			theme: "light"
		});

		expect(result).toBeNull();
		expect(shikiMock.createBundledHighlighter).not.toHaveBeenCalled();
		expect(shikiMock.codeToTokens).not.toHaveBeenCalled();
	});

	it("falls back to plain code for very large code blocks", async () => {
		const { canHighlightCode, highlightCode } = await import("./codeHighlighter");
		const largeCode = "x".repeat(20_001);

		expect(canHighlightCode(largeCode, "ts")).toBe(false);

		const result = await highlightCode({
			code: largeCode,
			language: "ts",
			theme: "light"
		});

		expect(result).toBeNull();
		expect(shikiMock.createBundledHighlighter).not.toHaveBeenCalled();
		expect(shikiMock.codeToTokens).not.toHaveBeenCalled();
	});

	it("caches highlighted output by code, language, and theme", async () => {
		const { getCachedHighlightedCode, highlightCode } = await import("./codeHighlighter");

		expect(
			getCachedHighlightedCode({
				code: "const enabled = true;",
				language: "ts",
				theme: "light"
			})
		).toBeNull();

		await highlightCode({
			code: "const enabled = true;",
			language: "ts",
			theme: "light"
		});
		await highlightCode({
			code: "const enabled = true;",
			language: "ts",
			theme: "light"
		});

		expect(shikiMock.codeToTokens).toHaveBeenCalledTimes(1);
		expect(
			getCachedHighlightedCode({
				code: "const enabled = true;",
				language: "ts",
				theme: "light"
			})?.lines[0][0]
		).toEqual({ content: "const", color: "#cf222e" });
	});
});
