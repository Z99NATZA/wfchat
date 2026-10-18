import { useEffect, useRef } from "react";
import Phaser from "phaser";
import MistwaterScene from "@/features/mistwater/game/MistwaterScene";

type MistwaterGameProps = {
	ariaLabel: string;
};

function MistwaterGame({ ariaLabel }: MistwaterGameProps) {
	const hostRef = useRef<HTMLDivElement>(null);

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
			scene: [new MistwaterScene()]
		});

		return () => game.destroy(true);
	}, []);

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
