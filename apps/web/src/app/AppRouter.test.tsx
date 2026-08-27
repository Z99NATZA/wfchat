/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import AppRouter from "@/app/AppRouter";
import { I18nProvider } from "@/i18n";

const appMocks = vi.hoisted(() => ({ moduleLoaded: vi.fn() }));

vi.mock("@/app/App", () => {
	appMocks.moduleLoaded();
	return { default: () => <div>Authenticated application</div> };
});

describe("AppRouter privacy route", () => {
	beforeEach(() => {
		localStorage.clear();
		appMocks.moduleLoaded.mockClear();
	});

	afterEach(() => {
		cleanup();
	});

	it("renders publicly without loading the session application or Google SDK", () => {
		render(
			<MemoryRouter initialEntries={["/privacy"]}>
				<I18nProvider>
					<AppRouter />
				</I18nProvider>
			</MemoryRouter>
		);

		expect(screen.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeTruthy();
		expect(screen.getByRole("link", { name: "Back to WFChat" }).getAttribute("href")).toBe(
			"/chat"
		);
		expect(appMocks.moduleLoaded).not.toHaveBeenCalled();
		expect(
			document.querySelector('script[src="https://accounts.google.com/gsi/client"]')
		).toBeNull();

		fireEvent.change(screen.getByRole("combobox", { name: "Policy language" }), {
			target: { value: "th" }
		});
		expect(
			screen.getByRole("heading", { level: 1, name: "นโยบายความเป็นส่วนตัว" })
		).toBeTruthy();
		expect(screen.getByText("z99natza@gmail.com").getAttribute("href")).toBe(
			"mailto:z99natza@gmail.com"
		);
	});

	it("lazy-loads the interactive application for non-public routes", async () => {
		render(
			<MemoryRouter initialEntries={["/chat"]}>
				<I18nProvider>
					<AppRouter />
				</I18nProvider>
			</MemoryRouter>
		);

		expect(await screen.findByText("Authenticated application")).toBeTruthy();
		expect(appMocks.moduleLoaded).toHaveBeenCalledTimes(1);
	});
});
