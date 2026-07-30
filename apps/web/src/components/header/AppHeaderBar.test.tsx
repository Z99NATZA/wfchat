/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppHeaderBar from "@/components/header/AppHeaderBar";

vi.mock("@/i18n/i18nContext", () => ({
	useI18n: () => ({ t: (key: string) => key })
}));

describe("AppHeaderBar", () => {
	afterEach(() => {
		cleanup();
	});

	it("rises above feature overlays only while the mobile menu is open", () => {
		render(
			<AppHeaderBar
				title="Cafe"
				mobileMenuContent={<button type="button">Menu action</button>}
			/>
		);

		const header = screen.getByTestId("app-header");
		const menuButton = screen.getByRole("button", {
			name: "chat.header.moreActions"
		});
		expect(header.className).toContain("z-20");
		expect(header.className).not.toContain("z-[80]");
		expect(menuButton.getAttribute("aria-expanded")).toBe("false");

		fireEvent.click(menuButton);

		expect(header.className).toContain("z-[80]");
		expect(header.className).toContain("sm:z-20");
		expect(header.className.split(" ")).not.toContain("z-20");
		expect(menuButton.getAttribute("aria-expanded")).toBe("true");
		expect(menuButton.getAttribute("aria-controls")).toBe("app-header-mobile-menu");
		expect(screen.getByText("Menu action")).toBeTruthy();

		fireEvent.mouseDown(document.body);

		expect(header.className).toContain("z-20");
		expect(header.className).not.toContain("z-[80]");
		expect(menuButton.getAttribute("aria-expanded")).toBe("false");
	});
});
