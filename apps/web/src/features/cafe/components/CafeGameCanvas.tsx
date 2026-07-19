import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { CafeScene } from "@/features/cafe/engine/CafeScene";
import type { CafeDirection, CafeEmote, CafeRoomState } from "@/features/cafe/types";

const AIKO_INTERACTION_DISTANCE = 134;

type CafeGameCanvasProps = {
	room: CafeRoomState | null;
	selfPlayerId: string | null;
	emote: CafeEmote | null;
	onMovement: (
		x: number,
		y: number,
		direction: CafeDirection,
		moving: boolean,
		sequence: number
	) => void;
	onInteract: (targetId: string) => void;
	interactionLabels: {
		collectTea: string;
		deliverTea: string;
		talkToAiko: string;
		idle: string;
	};
	loadingLabel: string;
};

function CafeGameCanvas({
	room,
	selfPlayerId,
	emote,
	onMovement,
	onInteract,
	interactionLabels,
	loadingLabel
}: CafeGameCanvasProps) {
	const parentRef = useRef<HTMLDivElement>(null);
	const sceneRef = useRef<CafeScene | null>(null);
	const movementRef = useRef(onMovement);
	const interactRef = useRef(onInteract);
	const [interactionTarget, setInteractionTarget] = useState<string | null>(null);
	const selfPlayer = room?.players.find((player) => player.id === selfPlayerId);
	const carriedTea = selfPlayer?.carriedTea ?? 0;
	const staleTeaTarget =
		interactionTarget?.startsWith("tea-") === true &&
		!room?.activity.teaLeaves.some((leaf) => leaf.id === interactionTarget && leaf.available);
	const isNearAiko =
		room !== null &&
		selfPlayer !== undefined &&
		Math.hypot(selfPlayer.x - room.aiko.x, selfPlayer.y - room.aiko.y) <=
			AIKO_INTERACTION_DISTANCE;
	const effectiveInteractionTarget = staleTeaTarget
		? carriedTea > 0 && isNearAiko
			? "aiko"
			: null
		: interactionTarget;
	const interactionLabel = effectiveInteractionTarget
		? effectiveInteractionTarget === "aiko"
			? carriedTea > 0
				? interactionLabels.deliverTea
				: interactionLabels.talkToAiko
			: interactionLabels.collectTea
		: interactionLabels.idle;
	movementRef.current = onMovement;
	interactRef.current = onInteract;

	useEffect(() => {
		if (!parentRef.current) {
			return;
		}
		const scene = new CafeScene({
			onMovement: (...args) => movementRef.current(...args),
			onInteract: (targetId) => interactRef.current(targetId),
			onInteractionTargetChange: setInteractionTarget
		});
		sceneRef.current = scene;
		const game = new Phaser.Game({
			type: Phaser.AUTO,
			parent: parentRef.current,
			backgroundColor: "#ead6bc",
			width: 1000,
			height: 640,
			scene,
			render: { antialias: true, pixelArt: false },
			scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH }
		});

		return () => {
			sceneRef.current = null;
			game.destroy(true);
		};
	}, []);

	useEffect(() => {
		if (room) {
			sceneRef.current?.applyRoomState(room, selfPlayerId);
		}
	}, [room, selfPlayerId]);

	useEffect(() => {
		if (!room || !interactionTarget?.startsWith("tea-")) {
			return;
		}
		const targetIsAvailable = room.activity.teaLeaves.some(
			(leaf) => leaf.id === interactionTarget && leaf.available
		);
		if (targetIsAvailable) {
			return;
		}
		const selfPlayer = room.players.find((player) => player.id === selfPlayerId);
		const isNearAiko =
			selfPlayer !== undefined &&
			Math.hypot(selfPlayer.x - room.aiko.x, selfPlayer.y - room.aiko.y) <=
				AIKO_INTERACTION_DISTANCE;
		sceneRef.current?.setInteractionTarget(isNearAiko ? "aiko" : null);
	}, [interactionTarget, room, selfPlayerId]);

	useEffect(() => {
		function interactWithKeyboard(event: KeyboardEvent) {
			if (
				event.repeat ||
				event.key.toLowerCase() !== "e" ||
				!effectiveInteractionTarget ||
				isEditableElement(event.target)
			) {
				return;
			}
			event.preventDefault();
			interactRef.current(effectiveInteractionTarget);
		}
		window.addEventListener("keydown", interactWithKeyboard);
		return () => window.removeEventListener("keydown", interactWithKeyboard);
	}, [effectiveInteractionTarget]);

	useEffect(() => {
		if (emote) {
			sceneRef.current?.showEmote(emote);
		}
	}, [emote]);

	function setDirection(x: number, y: number) {
		sceneRef.current?.setVirtualInput({ x, y });
	}

	return (
		<div
			className="relative h-full min-h-0 overflow-hidden bg-[#ead6bc]"
			data-testid="cafe-game"
		>
			<div ref={parentRef} className="absolute inset-0" />
			{!room && (
				<div className="absolute inset-0 z-20 flex items-center justify-center bg-app-bg/70 text-sm font-semibold text-app-text backdrop-blur-sm">
					{loadingLabel}
				</div>
			)}
			<div className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-30 grid grid-cols-3 grid-rows-3 gap-1 sm:hidden">
				<DirectionButton
					className="col-start-2"
					label="Up"
					onPress={() => setDirection(0, -1)}
					onRelease={() => setDirection(0, 0)}
				>
					▲
				</DirectionButton>
				<DirectionButton
					className="row-start-2"
					label="Left"
					onPress={() => setDirection(-1, 0)}
					onRelease={() => setDirection(0, 0)}
				>
					◀
				</DirectionButton>
				<DirectionButton
					className="col-start-3 row-start-2"
					label="Right"
					onPress={() => setDirection(1, 0)}
					onRelease={() => setDirection(0, 0)}
				>
					▶
				</DirectionButton>
				<DirectionButton
					className="col-start-2 row-start-3"
					label="Down"
					onPress={() => setDirection(0, 1)}
					onRelease={() => setDirection(0, 0)}
				>
					▼
				</DirectionButton>
			</div>
			<button
				type="button"
				className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 z-40 flex h-16 min-w-20 max-w-28 items-center justify-center rounded-2xl border border-action-border bg-action px-3 text-center text-xs font-bold leading-4 text-action-text shadow-soft transition hover:bg-action-hover focus:outline-none focus:ring-4 focus:ring-action-ring/25 disabled:border-app-border disabled:bg-app-soft disabled:text-muted sm:hidden"
				disabled={!effectiveInteractionTarget}
				onClick={() => {
					if (effectiveInteractionTarget) {
						interactRef.current(effectiveInteractionTarget);
					}
				}}
				aria-live="polite"
			>
				{interactionLabel}
			</button>
			{effectiveInteractionTarget && (
				<div
					className="absolute bottom-16 left-1/2 z-50 hidden -translate-x-1/2 items-center gap-2 rounded-xl border border-dialog-border bg-dialog-soft px-4 py-2.5 text-sm font-semibold text-app-text shadow-soft sm:flex"
					data-testid="cafe-interaction-prompt"
					role="status"
					aria-live="polite"
				>
					<kbd className="rounded-md border border-dialog-border bg-dialog-panel px-2 py-0.5 font-mono text-xs text-app-text">
						E
					</kbd>
					{interactionLabel}
				</div>
			)}
		</div>
	);
}

function isEditableElement(target: EventTarget | null) {
	return (
		target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		(target instanceof HTMLElement && target.isContentEditable)
	);
}

type DirectionButtonProps = {
	className?: string;
	label: string;
	children: string;
	onPress: () => void;
	onRelease: () => void;
};

function DirectionButton({ className, label, children, onPress, onRelease }: DirectionButtonProps) {
	return (
		<button
			type="button"
			className={`flex size-12 touch-none select-none items-center justify-center rounded-xl border border-dialog-border bg-dialog-soft text-lg text-app-text shadow-soft transition hover:bg-dialog-panel focus:outline-none focus:ring-2 focus:ring-primary/35 dark:focus:ring-action-ring/25 ${className ?? ""}`}
			aria-label={label}
			onKeyDown={(event) => {
				if ((event.key === " " || event.key === "Enter") && !event.repeat) {
					event.preventDefault();
					onPress();
				}
			}}
			onKeyUp={(event) => {
				if (event.key === " " || event.key === "Enter") {
					event.preventDefault();
					onRelease();
				}
			}}
			onBlur={onRelease}
			onPointerDown={(event) => {
				event.currentTarget.setPointerCapture(event.pointerId);
				onPress();
			}}
			onPointerUp={onRelease}
			onPointerCancel={onRelease}
		>
			{children}
		</button>
	);
}

export default CafeGameCanvas;
