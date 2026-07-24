import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { CafeScene } from "@/features/cafe/engine/CafeScene";
import type { CafeDirection, CafeEmote, CafeRoomState } from "@/features/cafe/types";

type CafeGameCanvasProps = {
	room: CafeRoomState | null;
	selfPlayerId: string | null;
	connectionEpoch: number;
	inputEnabled: boolean;
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
		pickUpDrink: string;
		serveDrink: string;
		findCounter: string;
		findTable: string;
		idle: string;
	};
	loadingLabel: string;
};

function CafeGameCanvas({
	room,
	selfPlayerId,
	connectionEpoch,
	inputEnabled,
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
	const appliedConnectionEpochRef = useRef<number | null>(null);
	const [interactionTarget, setInteractionTarget] = useState<string | null>(null);
	const selfPlayer = room?.players.find((player) => player.id === selfPlayerId);
	const carriedTea = selfPlayer?.carriedTea ?? 0;
	const carriedOrder = room?.activity.tableOrders.find(
		(order) =>
			order.id === selfPlayer?.carriedOrderId &&
			order.status === "claimed" &&
			order.claimedBy === selfPlayerId
	);
	const staleTeaTarget =
		interactionTarget?.startsWith("tea-") === true &&
		!room?.activity.teaLeaves.some((leaf) => leaf.id === interactionTarget && leaf.available);
	const isNearAiko =
		room !== null &&
		selfPlayer !== undefined &&
		Math.hypot(selfPlayer.x - room.aiko.x, selfPlayer.y - room.aiko.y) <=
			room.mapLayout.hostInteractionRadius;
	const effectiveInteractionTarget = staleTeaTarget
		? carriedTea > 0 && isNearAiko
			? "aiko"
			: null
		: interactionTarget;
	const tableTargetIsStale =
		room?.activity.id === "table_service" &&
		effectiveInteractionTarget !== null &&
		(effectiveInteractionTarget === "service-counter"
			? Boolean(selfPlayer?.carriedOrderId) ||
				!room.activity.tableOrders.some((order) => order.status === "available")
			: effectiveInteractionTarget.startsWith("order-") &&
				effectiveInteractionTarget !== carriedOrder?.id);
	const currentInteractionTarget = tableTargetIsStale ? null : effectiveInteractionTarget;
	const interactionLabel =
		room?.activity.id === "table_service"
			? currentInteractionTarget === "service-counter"
				? interactionLabels.pickUpDrink
				: currentInteractionTarget?.startsWith("order-")
					? interactionLabels.serveDrink
					: carriedOrder
						? interactionLabels.findTable
						: interactionLabels.findCounter
			: currentInteractionTarget
				? currentInteractionTarget === "aiko"
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
		const scene = new CafeScene(
			{
				onMovement: (...args) => movementRef.current(...args),
				onInteract: (targetId) => interactRef.current(targetId),
				onInteractionTargetChange: setInteractionTarget
			},
			shouldShowCollisionDebug()
		);
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
			const resetLocalPosition = appliedConnectionEpochRef.current !== connectionEpoch;
			appliedConnectionEpochRef.current = connectionEpoch;
			sceneRef.current?.applyRoomState(room, selfPlayerId, resetLocalPosition);
		}
	}, [connectionEpoch, room, selfPlayerId]);

	useEffect(() => {
		sceneRef.current?.setInputEnabled(inputEnabled);
		if (!inputEnabled) {
			setInteractionTarget(null);
		}
	}, [inputEnabled]);

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
				room.mapLayout.hostInteractionRadius;
		sceneRef.current?.setInteractionTarget(isNearAiko ? "aiko" : null);
	}, [interactionTarget, room, selfPlayerId]);

	useEffect(() => {
		function interactWithKeyboard(event: KeyboardEvent) {
			if (
				!inputEnabled ||
				event.repeat ||
				event.key.toLowerCase() !== "e" ||
				!currentInteractionTarget ||
				isEditableElement(event.target)
			) {
				return;
			}
			event.preventDefault();
			interactRef.current(currentInteractionTarget);
		}
		window.addEventListener("keydown", interactWithKeyboard);
		return () => window.removeEventListener("keydown", interactWithKeyboard);
	}, [currentInteractionTarget, inputEnabled]);

	useEffect(() => {
		if (emote) {
			sceneRef.current?.showEmote(emote);
		}
	}, [emote]);

	function setDirection(x: number, y: number) {
		if (inputEnabled) {
			sceneRef.current?.setVirtualInput({ x, y });
		}
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
					disabled={!inputEnabled}
					label="Up"
					onPress={() => setDirection(0, -1)}
					onRelease={() => setDirection(0, 0)}
				>
					▲
				</DirectionButton>
				<DirectionButton
					className="row-start-2"
					disabled={!inputEnabled}
					label="Left"
					onPress={() => setDirection(-1, 0)}
					onRelease={() => setDirection(0, 0)}
				>
					◀
				</DirectionButton>
				<DirectionButton
					className="col-start-3 row-start-2"
					disabled={!inputEnabled}
					label="Right"
					onPress={() => setDirection(1, 0)}
					onRelease={() => setDirection(0, 0)}
				>
					▶
				</DirectionButton>
				<DirectionButton
					className="col-start-2 row-start-3"
					disabled={!inputEnabled}
					label="Down"
					onPress={() => setDirection(0, 1)}
					onRelease={() => setDirection(0, 0)}
				>
					▼
				</DirectionButton>
			</div>
			<button
				type="button"
				className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 z-40 flex h-16 min-w-20 max-w-28 items-center justify-center rounded-2xl border border-action-border bg-action px-3 text-center text-xs font-bold leading-4 text-action-text transition hover:bg-action-hover focus:outline-none focus:ring-4 focus:ring-action-ring/25 disabled:border-app-border disabled:bg-app-soft disabled:text-muted sm:hidden"
				disabled={!inputEnabled || !currentInteractionTarget}
				onClick={() => {
					if (currentInteractionTarget) {
						interactRef.current(currentInteractionTarget);
					}
				}}
				aria-live="polite"
			>
				{interactionLabel}
			</button>
			{inputEnabled && currentInteractionTarget && (
				<div
					className="absolute bottom-16 left-1/2 z-50 hidden -translate-x-1/2 items-center gap-2 rounded-xl border border-dialog-border bg-dialog-soft px-4 py-2.5 text-sm font-semibold text-app-text sm:flex"
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

function shouldShowCollisionDebug() {
	return (
		import.meta.env.DEV &&
		new URLSearchParams(window.location.search).get("debugCollision") === "1"
	);
}

type DirectionButtonProps = {
	className?: string;
	disabled: boolean;
	label: string;
	children: string;
	onPress: () => void;
	onRelease: () => void;
};

function DirectionButton({
	className,
	disabled,
	label,
	children,
	onPress,
	onRelease
}: DirectionButtonProps) {
	return (
		<button
			type="button"
			className={`flex size-12 touch-none select-none items-center justify-center rounded-xl border border-dialog-border bg-dialog-soft text-lg text-app-text transition hover:bg-dialog-panel focus:outline-none focus:ring-2 focus:ring-primary/35 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-action-ring/25 ${className ?? ""}`}
			disabled={disabled}
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
