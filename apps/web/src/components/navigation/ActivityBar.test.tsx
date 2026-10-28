/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import ActivityBar from "@/components/navigation/ActivityBar";

vi.mock("@/i18n/i18nContext", () => ({
	useI18n: () => ({ t: (key: string) => key })
}));

describe("ActivityBar", () => {
	afterEach(cleanup);

	it("links directly to the standalone Mistwater route", () => {
		render(
			<MemoryRouter initialEntries={["/mistwater"]}>
				<ActivityBar />
			</MemoryRouter>
		);

		const link = screen.getByRole("link", { name: "navigation.mistwater" });
		expect(link.getAttribute("href")).toBe("/mistwater");
		expect(link.getAttribute("aria-current")).toBe("page");
	});
	it("links to Cozy Fantasy Farm", () => {
		render(
			<MemoryRouter initialEntries={["/cozy-farm"]}>
				<ActivityBar />
			</MemoryRouter>
		);
		const link = screen.getByRole("link", { name: "navigation.cozyFarm" });
		expect(link.getAttribute("href")).toBe("/cozy-farm");
		expect(link.getAttribute("aria-current")).toBe("page");
	});
});
