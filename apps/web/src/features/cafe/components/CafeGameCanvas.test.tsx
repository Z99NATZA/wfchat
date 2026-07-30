/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CafeGameCanvas from "@/features/cafe/components/CafeGameCanvas";

const cafeScene = vi.hoisted(() => ({
	setVirtualInput: vi.fn(),
	setInputEnabled: vi.fn(),
	setInteractionTarget: vi.fn(),
	applyRoomState: vi.fn(),
	showEmote: vi.fn(),
	showChatMessage: vi.fn()
}));

vi.mock("phaser", () => ({
	default: {
		AUTO: 0,
		Scale: {
			RESIZE: 0,
			CENTER_BOTH: 0
		},
		Game: vi.fn(() => ({
			destroy: vi.fn()
		}))
	}
}));

vi.mock("@/features/cafe/engine/CafeScene", () => ({
	CafeScene: vi.fn(function () {
		return cafeScene;
	})
}));

const interactionLabels = {
	collectTea: "Collect tea",
	deliverTea: "Deliver tea",
	talkToAiko: "Talk to Aiko",
	pickUpDrink: "Pick up drink",
	serveDrink: "Serve drink",
	findCounter: "Find counter",
	findTable: "Find table",
	prepareOrder: "Prepare order",
	findIngredient: "Find ingredient",
	returnIngredient: "Return ingredient",
	idle: "Move closer"
};

describe("CafeGameCanvas mobile direction controls", () => {
	beforeEach(() => {
		HTMLButtonElement.prototype.setPointerCapture = vi.fn();
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("ignores stale release events after another direction becomes active", () => {
		render(
			<CafeGameCanvas
				room={null}
				selfPlayerId={null}
				connectionEpoch={0}
				inputEnabled
				emote={null}
				chatMessage={null}
				onMovement={vi.fn()}
				onInteract={vi.fn()}
				interactionLabels={interactionLabels}
				loadingLabel="Loading"
			/>
		);

		const leftButton = screen.getByRole("button", { name: "Left" });
		const downButton = screen.getByRole("button", { name: "Down" });

		fireEvent.pointerDown(leftButton, { pointerId: 1 });
		fireEvent.pointerUp(leftButton, { pointerId: 1 });
		fireEvent.pointerDown(downButton, { pointerId: 2 });
		fireEvent.blur(leftButton);
		fireEvent.pointerUp(leftButton, { pointerId: 1 });

		expect(cafeScene.setVirtualInput).toHaveBeenLastCalledWith({ x: 0, y: 1 });

		fireEvent.pointerUp(downButton, { pointerId: 2 });

		expect(cafeScene.setVirtualInput).toHaveBeenLastCalledWith({ x: 0, y: 0 });
	});

	it("still releases the active direction on blur or pointer cancellation", () => {
		render(
			<CafeGameCanvas
				room={null}
				selfPlayerId={null}
				connectionEpoch={0}
				inputEnabled
				emote={null}
				chatMessage={null}
				onMovement={vi.fn()}
				onInteract={vi.fn()}
				interactionLabels={interactionLabels}
				loadingLabel="Loading"
			/>
		);

		const leftButton = screen.getByRole("button", { name: "Left" });
		const rightButton = screen.getByRole("button", { name: "Right" });

		fireEvent.keyDown(leftButton, { key: " " });
		fireEvent.blur(leftButton);
		expect(cafeScene.setVirtualInput).toHaveBeenLastCalledWith({ x: 0, y: 0 });

		fireEvent.pointerDown(rightButton, { pointerId: 3 });
		fireEvent.pointerCancel(rightButton, { pointerId: 3 });
		expect(cafeScene.setVirtualInput).toHaveBeenLastCalledWith({ x: 0, y: 0 });
	});
});
