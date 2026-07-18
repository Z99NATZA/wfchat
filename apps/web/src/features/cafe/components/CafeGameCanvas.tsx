import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { CafeScene } from "@/features/cafe/engine/CafeScene";
import type { CafeDirection, CafeEmote, CafeRoomState } from "@/features/cafe/types";

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
	interactionLabel: string;
	loadingLabel: string;
};

function CafeGameCanvas({
	room,
	selfPlayerId,
	emote,
	onMovement,
	onInteract,
	interactionLabel,
	loadingLabel
}: CafeGameCanvasProps) {
	const parentRef = useRef<HTMLDivElement>(null);
	const sceneRef = useRef<CafeScene | null>(null);
	const movementRef = useRef(onMovement);
	const interactRef = useRef(onInteract);
	const [interactionTarget, setInteractionTarget] = useState<string | null>(null);
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
				className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 z-30 flex size-16 items-center justify-center rounded-full border-2 border-white/80 bg-primary text-sm font-bold text-white shadow-lg disabled:opacity-45 sm:hidden"
				disabled={!interactionTarget}
				onClick={() => sceneRef.current?.interactNearest()}
			>
				{interactionLabel}
			</button>
			{interactionTarget && (
				<div className="absolute bottom-5 left-1/2 z-20 hidden -translate-x-1/2 rounded-full border border-white/80 bg-slate-950/72 px-4 py-2 text-xs font-semibold text-white shadow-lg sm:block">
					E · {interactionLabel}
				</div>
			)}
		</div>
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
			className={`flex size-12 touch-none select-none items-center justify-center rounded-xl border border-white/75 bg-slate-950/68 text-lg text-white shadow-lg ${className ?? ""}`}
			aria-label={label}
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
