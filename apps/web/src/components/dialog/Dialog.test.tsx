/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Dialog from "@/components/dialog/Dialog";

describe("Dialog", () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it("enables drag affordance on desktop fine-pointer viewports", () => {
		mockMatchMedia(true);

		render(<Dialog isOpen title="Delete chat" actions={null} onClose={vi.fn()} />);

		expect(screen.getByText("Delete chat").parentElement?.className).toContain("cursor-move");
	});

	it("keeps drag disabled on touch or narrow viewports", () => {
		mockMatchMedia(false);

		render(<Dialog isOpen title="Delete chat" actions={null} onClose={vi.fn()} />);

		expect(screen.getByText("Delete chat").parentElement?.className).not.toContain(
			"cursor-move"
		);
	});

	it("renders the lightbox variant without generic dialog chrome or padding", () => {
		mockMatchMedia(false);
		const { container } = render(
			<Dialog
				isOpen
				title="Image preview"
				variant="lightbox"
				content={<div>Media viewer</div>}
				actions={null}
				onClose={vi.fn()}
			/>
		);

		const dialog = screen.getByRole("dialog");
		const contentShell = screen.getByText("Media viewer").parentElement;

		expect(dialog.className).toContain("h-full");
		expect(dialog.className).toContain("bg-app-bg/95");
		expect(screen.getByText("Image preview").className).toContain("sr-only");
		expect(contentShell?.className).toContain("min-h-0");
		expect(contentShell?.className).not.toContain("px-5");
		expect(container.querySelector(".cursor-move")).toBeNull();
	});
});

function mockMatchMedia(matches: boolean) {
	Object.defineProperty(window, "matchMedia", {
		configurable: true,
		writable: true,
		value: vi.fn().mockImplementation((query: string) => ({
			matches,
			media: query,
			onchange: null,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			addListener: vi.fn(),
			removeListener: vi.fn(),
			dispatchEvent: vi.fn()
		}))
	});
}
