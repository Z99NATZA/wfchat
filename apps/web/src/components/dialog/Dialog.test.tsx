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

		render(
			<Dialog
				isOpen
				title="Delete chat"
				actions={null}
				onClose={vi.fn()}
			/>
		);

		expect(screen.getByText("Delete chat").parentElement?.className).toContain("cursor-move");
	});

	it("keeps drag disabled on touch or narrow viewports", () => {
		mockMatchMedia(false);

		render(
			<Dialog
				isOpen
				title="Delete chat"
				actions={null}
				onClose={vi.fn()}
			/>
		);

		expect(screen.getByText("Delete chat").parentElement?.className).not.toContain("cursor-move");
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
