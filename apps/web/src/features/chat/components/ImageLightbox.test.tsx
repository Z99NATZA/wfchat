/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ImageLightbox from "@/features/chat/components/ImageLightbox";

vi.mock("@/i18n/i18nContext", () => ({
	useI18n: () => ({
		t: (key: string, params?: Record<string, string | number>) => {
			if (key === "chat.imageLightbox.position") {
				return `Image ${params?.current} of ${params?.total}`;
			}
			if (key === "chat.imageLightbox.previous") {
				return "Previous image";
			}
			if (key === "chat.imageLightbox.next") {
				return "Next image";
			}
			if (key === "chat.imageLightbox.close") {
				return "Close image preview";
			}
			if (key === "chat.imageLightbox.showImage") {
				return `Show image ${params?.index}`;
			}
			return key;
		}
	})
}));

describe("ImageLightbox", () => {
	afterEach(cleanup);

	it("navigates a bounded gallery with arrows and thumbnails", () => {
		render(<ImageLightbox initialIndex={1} items={items()} onClose={vi.fn()} />);

		expect(screen.getByText("Image 2 of 3")).toBeTruthy();
		expect(screen.getByRole("img", { name: "Image 2" })).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Next image" }));

		expect(screen.getByText("Image 3 of 3")).toBeTruthy();
		expect(screen.getByRole("img", { name: "Image 3" })).toBeTruthy();
		expect(
			(screen.getByRole("button", { name: "Next image" }) as HTMLButtonElement).disabled
		).toBe(true);

		fireEvent.click(screen.getByRole("button", { name: "Show image 1" }));

		expect(screen.getByText("Image 1 of 3")).toBeTruthy();
		expect(
			(
				screen.getByRole("button", { name: "Show image 1" }) as HTMLButtonElement
			).getAttribute("aria-current")
		).toBe("true");
	});

	it("supports left and right keyboard navigation", () => {
		render(<ImageLightbox initialIndex={1} items={items()} onClose={vi.fn()} />);

		fireEvent.keyDown(window, { key: "ArrowLeft" });
		expect(screen.getByText("Image 1 of 3")).toBeTruthy();

		fireEvent.keyDown(window, { key: "ArrowRight" });
		expect(screen.getByText("Image 2 of 3")).toBeTruthy();
	});

	it("supports horizontal touch swipe without wrapping", () => {
		render(<ImageLightbox initialIndex={0} items={items()} onClose={vi.fn()} />);
		const stage = screen.getByTestId("image-lightbox-stage");

		fireEvent.pointerDown(stage, {
			clientX: 240,
			pointerId: 1,
			pointerType: "touch"
		});
		fireEvent.pointerUp(stage, {
			clientX: 120,
			pointerId: 1,
			pointerType: "touch"
		});

		expect(screen.getByText("Image 2 of 3")).toBeTruthy();
	});

	it("keeps a single image uncluttered and exposes a compact close action", () => {
		const onClose = vi.fn();
		render(<ImageLightbox initialIndex={0} items={[items()[0]]} onClose={onClose} />);

		expect(screen.getByRole("img", { name: "Image 1" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Next image" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Show image 1" })).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "Close image preview" }));
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});

function items() {
	return [1, 2, 3].map((index) => ({
		alt: `Image ${index}`,
		id: `image-${index}`,
		url: `blob:image-${index}`
	}));
}
