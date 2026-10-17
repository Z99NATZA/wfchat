import { useEffect, useRef } from "react";
import Phaser from "phaser";
import MistwaterScene from "@/features/mistwater/game/MistwaterScene";
import type { MistwaterSnapshot } from "@/features/mistwater/game/mistwaterState";

type MistwaterGameProps = {
	ariaLabel: string;
	onSnapshot: (snapshot: MistwaterSnapshot) => void;
	resetSignal: number;
};

function MistwaterGame({ ariaLabel, onSnapshot, resetSignal }: MistwaterGameProps) {
	const hostRef = useRef<HTMLDivElement>(null);
	const gameRef = useRef<Phaser.Game | null>(null);
	const snapshotCallbackRef = useRef(onSnapshot);

	useEffect(() => {
		snapshotCallbackRef.current = onSnapshot;
	}, [onSnapshot]);

	useEffect(() => {
		const host = hostRef.current;
		if (!host) {
			return;
		}

		const game = new Phaser.Game({
			type: Phaser.AUTO,
			parent: host,
			backgroundColor: "#061d24",
			render: {
				antialias: true,
				pixelArt: false,
				roundPixels: false
			},
			scale: {
				mode: Phaser.Scale.RESIZE,
				width: Math.max(host.clientWidth, 320),
				height: Math.max(host.clientHeight, 320)
			},
			scene: [new MistwaterScene((snapshot) => snapshotCallbackRef.current(snapshot))]
		});
		gameRef.current = game;

		return () => {
			gameRef.current = null;
			game.destroy(true);
		};
	}, []);

	useEffect(() => {
		if (resetSignal > 0) {
			gameRef.current?.events.emit("mistwater:reset");
		}
	}, [resetSignal]);

	return (
		<div
			ref={hostRef}
			className="absolute inset-0 touch-none overflow-hidden bg-[#061d24] [&_canvas]:block"
			role="application"
			aria-label={ariaLabel}
			data-testid="mistwater-game"
		/>
	);
}

export default MistwaterGame;
