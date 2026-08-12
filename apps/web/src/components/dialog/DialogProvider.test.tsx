/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDialog } from "@/components/dialog/DialogContext";
import DialogProvider from "@/components/dialog/DialogProvider";

vi.mock("@/i18n/i18nContext", () => ({
	useI18n: () => ({ t: (key: string) => key })
}));

describe("DialogProvider", () => {
	afterEach(cleanup);

	it("omits generic custom-dialog actions for a lightbox", () => {
		render(
			<DialogProvider>
				<LightboxOpener />
			</DialogProvider>
		);

		fireEvent.click(screen.getByRole("button", { name: "Open lightbox" }));

		expect(screen.getByText("Lightbox media")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "common.done" })).toBeNull();
		expect(screen.queryByRole("button", { name: "common.cancel" })).toBeNull();
	});

	it("omits generic custom-dialog actions for a responsive sheet", () => {
		render(
			<DialogProvider>
				<SheetOpener />
			</DialogProvider>
		);

		fireEvent.click(screen.getByRole("button", { name: "Open sheet" }));

		expect(screen.getByText("Sheet content")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "common.done" })).toBeNull();
		expect(screen.queryByRole("button", { name: "common.cancel" })).toBeNull();
	});
});

function LightboxOpener() {
	const { openCustom } = useDialog();

	return (
		<button
			type="button"
			onClick={() =>
				void openCustom({
					title: "Image preview",
					isDraggable: false,
					variant: "lightbox",
					render: () => <div>Lightbox media</div>
				})
			}
		>
			Open lightbox
		</button>
	);
}

function SheetOpener() {
	const { openCustom } = useDialog();

	return (
		<button
			type="button"
			onClick={() =>
				void openCustom({
					title: "Wardrobe",
					isDraggable: false,
					variant: "sheet",
					render: () => <div>Sheet content</div>
				})
			}
		>
			Open sheet
		</button>
	);
}
