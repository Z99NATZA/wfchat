import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/i18nContext";
import WillowWorld from "../game/WillowWorld";

function WillowGame() {
	const hostRef = useRef<HTMLDivElement>(null);
	const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
	const [attempt, setAttempt] = useState(0);
	const { t } = useI18n();

	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;
		let world: WillowWorld | undefined;
		const frame = window.requestAnimationFrame(() => {
			try {
				world = new WillowWorld(host, {
					onError: () => setStatus("error"),
					onMove: (point) => {
						host.dataset.playerX = point.x.toFixed(2);
						host.dataset.playerY = point.y.toFixed(2);
					},
					reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches
				});
				setStatus("ready");
			} catch {
				setStatus("error");
			}
		});
		return () => {
			window.cancelAnimationFrame(frame);
			world?.dispose();
		};
	}, [attempt]);

	return (
		<>
			<div
				ref={hostRef}
				role="application"
				tabIndex={0}
				aria-label={t("willow.game.ariaLabel")}
				aria-describedby="willow-hint"
				data-testid="willow-game"
				data-status={status}
				data-renderer="webgl-3d"
				className="absolute inset-0 touch-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#efe5b9] [&_canvas]:block"
			/>
			{status !== "ready" && (
				<div
					className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[#344b38] px-6 text-center text-[#eee9d3]"
					role={status === "error" ? "alert" : "status"}
				>
					<p>{t(status === "error" ? "willow.game.error" : "willow.game.loading")}</p>
					{status === "error" && (
						<button
							type="button"
							className="rounded-full border border-[#eee9d3]/40 px-5 py-2 focus-visible:outline-2"
							onClick={() => {
								setStatus("loading");
								setAttempt((value) => value + 1);
							}}
						>
							{t("willow.game.retry")}
						</button>
					)}
				</div>
			)}
		</>
	);
}

export default WillowGame;
