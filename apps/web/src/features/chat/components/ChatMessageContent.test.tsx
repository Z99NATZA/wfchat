/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChatMessageContent from "@/features/chat/components/ChatMessageContent";

const highlighterMock = vi.hoisted(() => ({
	canHighlightCode: vi.fn(),
	getCachedHighlightedCode: vi.fn(),
	getHighlightDebounceMs: vi.fn(),
	highlightCode: vi.fn()
}));

vi.mock("@/features/chat/components/codeHighlighter", () => highlighterMock);

describe("ChatMessageContent", () => {
	beforeEach(() => {
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: {
				writeText: vi.fn().mockResolvedValue(undefined)
			}
		});
		highlighterMock.canHighlightCode.mockReturnValue(true);
		highlighterMock.getCachedHighlightedCode.mockReturnValue(null);
		highlighterMock.getHighlightDebounceMs.mockReturnValue(0);
		highlighterMock.highlightCode.mockResolvedValue({
			lines: [
				[
					{ content: "const", color: "#cf222e" },
					{ content: ' value = "hello";', color: "#24292f" }
				],
				[{ content: "console.log(value);", color: "#0550ae" }]
			]
		});
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("keeps user markdown-like text as plain text", () => {
		const { container } = render(
			<ChatMessageContent
				author="user"
				text={"## Not a heading\n\n- Not a list item\n\n**Not bold**"}
			/>
		);

		expect(screen.getByText(/## Not a heading/)).toBeTruthy();
		expect(container.querySelector("h2")).toBeNull();
		expect(container.querySelector("ul")).toBeNull();
		expect(container.querySelector("strong")).toBeNull();
	});

	it("renders assistant paragraphs and emphasis", () => {
		const { container } = render(
			<ChatMessageContent
				author="companion"
				text={"First paragraph.\n\nSecond paragraph with **bold text** and *italic text*."}
			/>
		);

		expect(screen.getByText("First paragraph.")).toBeTruthy();
		expect(screen.getByText("bold text").tagName).toBe("STRONG");
		expect(screen.getByText("italic text").tagName).toBe("EM");
		expect(container.querySelectorAll("p")).toHaveLength(2);
	});

	it("renders assistant headings with compact heading elements", () => {
		render(
			<ChatMessageContent author="companion" text={"## Plan\n\nShort detail.\n\n### Notes"} />
		);

		expect(screen.getByRole("heading", { level: 2, name: "Plan" })).toBeTruthy();
		expect(screen.getByRole("heading", { level: 3, name: "Notes" })).toBeTruthy();
	});

	it("renders ordered and unordered assistant lists", () => {
		const { container } = render(
			<ChatMessageContent
				author="companion"
				text={"Steps:\n\n1. First item\n2. Second item\n\nOptions:\n\n- Alpha\n- Beta"}
			/>
		);

		expect(container.querySelector("ol")).toBeTruthy();
		expect(container.querySelector("ul")).toBeTruthy();
		expect(screen.getByText("First item")).toBeTruthy();
		expect(screen.getByText("Alpha")).toBeTruthy();
	});

	it("renders assistant blockquotes", () => {
		const { container } = render(
			<ChatMessageContent
				author="companion"
				text={"> Important note\n> with a second line.\n\nNormal text."}
			/>
		);

		const quote = container.querySelector("blockquote");
		expect(quote).toBeTruthy();
		expect(within(quote as HTMLElement).getByText(/Important note/)).toBeTruthy();
		expect(screen.getByText("Normal text.")).toBeTruthy();
	});

	it("renders safe assistant links", () => {
		render(
			<ChatMessageContent
				author="companion"
				text={"Read [the docs](https://example.com/docs) before continuing."}
			/>
		);

		const link = screen.getByRole("link", { name: "the docs" });
		expect(link.getAttribute("href")).toBe("https://example.com/docs");
		expect(link.getAttribute("target")).toBe("_blank");
		expect(link.getAttribute("rel")).toContain("noreferrer");
		expect(link.getAttribute("rel")).toContain("noopener");
	});

	it("does not turn raw HTML into live DOM", () => {
		const { container } = render(
			<ChatMessageContent
				author="companion"
				text={
					'<script>alert("xss")</script>\n\n<img src=x onerror=alert(1)>\n\n<strong>raw strong</strong>'
				}
			/>
		);

		expect(container.querySelector("script")).toBeNull();
		expect(container.querySelector("img")).toBeNull();
		expect(container.querySelector("strong")).toBeNull();
	});

	it("renders inline code without a code block surface", () => {
		const { container } = render(
			<ChatMessageContent author="companion" text={"Use `npm test` before merging."} />
		);

		expect(screen.getByText("npm test").tagName).toBe("CODE");
		expect(container.querySelector("[data-markdown-code-block]")).toBeNull();
	});

	it("renders fenced code blocks with a language label and copy action", () => {
		const { container } = render(
			<ChatMessageContent
				author="companion"
				text={'```ts\nconst value = "hello";\nconsole.log(value);\n```'}
			/>
		);

		expect(screen.getByText("ts")).toBeTruthy();
		expect(container.querySelector("[data-markdown-code-block]")).toBeTruthy();
		expect(screen.getByText(/const value/)).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Copy code" }));

		expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
			'const value = "hello";\nconsole.log(value);'
		);
	});

	it("renders plain code immediately before async syntax highlighting completes", async () => {
		highlighterMock.highlightCode.mockReturnValue(new Promise(() => undefined));
		const { container } = render(
			<ChatMessageContent
				author="companion"
				text={'```ts\nconst value = "hello";\nconsole.log(value);\n```'}
			/>
		);

		expect(screen.getByText(/const value/)).toBeTruthy();
		expect(
			container.querySelector("code")?.getAttribute("data-markdown-code-highlighted")
		).toBe("false");
	});

	it("enhances fenced code blocks with async syntax highlighting", async () => {
		const { container } = render(
			<ChatMessageContent
				author="companion"
				text={'```ts\nconst value = "hello";\nconsole.log(value);\n```'}
				theme="light"
			/>
		);

		await waitFor(() =>
			expect(
				container.querySelector("code")?.getAttribute("data-markdown-code-highlighted")
			).toBe("true")
		);

		expect(highlighterMock.highlightCode).toHaveBeenCalledWith({
			code: 'const value = "hello";\nconsole.log(value);',
			language: "ts",
			theme: "light"
		});
		expect(
			container.querySelector("code")?.getAttribute("data-markdown-code-highlighted")
		).toBe("true");
		expect(container.querySelector("code span")?.getAttribute("style")).toContain("color");
	});

	it("renders cached syntax highlighting immediately after remount", async () => {
		highlighterMock.getCachedHighlightedCode.mockReturnValue({
			lines: [
				[
					{ content: "const", color: "#cf222e" },
					{ content: " cached = true;", color: "#24292f" }
				]
			]
		});
		const { container } = render(
			<ChatMessageContent
				author="companion"
				text={"```ts\nconst cached = true;\n```"}
				theme="light"
			/>
		);

		expect(
			container.querySelector("code")?.getAttribute("data-markdown-code-highlighted")
		).toBe("true");
		expect(container.querySelector("code span")?.getAttribute("style")).toContain("color");
		await new Promise((resolve) => window.setTimeout(resolve, 0));
		expect(highlighterMock.highlightCode).not.toHaveBeenCalled();
	});

	it("keeps actively streaming fenced code plain", async () => {
		render(
			<ChatMessageContent
				author="companion"
				isStreaming
				text={'```ts\nconst value = "hello";\n```'}
			/>
		);

		await new Promise((resolve) => window.setTimeout(resolve, 0));

		expect(screen.getByText(/const value/)).toBeTruthy();
		expect(highlighterMock.highlightCode).not.toHaveBeenCalled();
	});

	it("keeps code plain when syntax highlighting is not eligible", async () => {
		highlighterMock.canHighlightCode.mockReturnValue(false);
		const { container } = render(
			<ChatMessageContent author="companion" text={"```unknown-language\nhello\n```"} />
		);

		await new Promise((resolve) => window.setTimeout(resolve, 0));

		expect(screen.getByText("hello")).toBeTruthy();
		expect(highlighterMock.highlightCode).not.toHaveBeenCalled();
		expect(
			container.querySelector("code")?.getAttribute("data-markdown-code-highlighted")
		).toBe("false");
	});

	it("renders GFM tables inside a scroll container", () => {
		const { container } = render(
			<ChatMessageContent
				author="companion"
				text={
					"| Feature | Status |\n| --- | --- |\n| Markdown | Ready |\n| Attachments | Later |"
				}
			/>
		);

		expect(screen.getByRole("table")).toBeTruthy();
		expect(container.querySelector("[data-markdown-table-scroll]")).toBeTruthy();
		expect(screen.getByText("Markdown")).toBeTruthy();
	});

	it("renders task-list syntax as disabled task controls", () => {
		render(
			<ChatMessageContent author="companion" text={"- [x] Done item\n- [ ] Pending item"} />
		);

		expect((screen.getByLabelText("Completed task") as HTMLInputElement).disabled).toBe(true);
		expect((screen.getByLabelText("Pending task") as HTMLInputElement).disabled).toBe(true);
		expect(screen.getByText("Done item")).toBeTruthy();
	});

	it("renders partial streaming markdown without throwing", () => {
		render(<ChatMessageContent author="companion" text={"## Pla"} />);

		expect(screen.getByRole("heading", { level: 2, name: "Pla" })).toBeTruthy();
	});

	it("renders a partial code fence inside a code block surface", () => {
		const { container } = render(
			<ChatMessageContent author="companion" text={"```ts\nconst value ="} />
		);

		expect(container.querySelector("[data-markdown-code-block]")).toBeTruthy();
		expect(screen.getByText(/const value =/)).toBeTruthy();
	});

	it("renders mixed assistant content together", () => {
		const { container } = render(
			<ChatMessageContent
				author="companion"
				text={
					"## Summary\n\nUse this order:\n\n1. Install dependencies.\n2. Run tests.\n\n```bash\nnpm test\n```\n\n| Check | Result |\n| --- | --- |\n| Tests | Passing |\n\n> Keep the change scoped."
				}
			/>
		);

		expect(screen.getByRole("heading", { level: 2, name: "Summary" })).toBeTruthy();
		expect(container.querySelector("ol")).toBeTruthy();
		expect(container.querySelector("[data-markdown-code-block]")).toBeTruthy();
		expect(screen.getByRole("table")).toBeTruthy();
		expect(container.querySelector("blockquote")).toBeTruthy();
	});
});
