import { useEffect, useRef, useState } from "react";
import {
	BookOpen,
	Droplets,
	Fence,
	Flower2,
	Grid2X2,
	Hammer,
	Hand,
	Lamp,
	Leaf,
	Minus,
	Pause,
	Play,
	Plus,
	Shovel,
	Sprout,
	Wheat,
	TreePine,
	X,
	ArrowUp,
	ArrowDown,
	ArrowLeft,
	ArrowRight
} from "lucide-react";
import { useI18n } from "@/i18n/i18nContext";
import { Game, type Snapshot } from "./Game";
import { TOOLS, type Tool } from "./world";
import "./cozy-farm.css";
const icons = {
	hand: Hand,
	hoe: Shovel,
	turnip: Sprout,
	water: Droplets,
	berry: Leaf,
	rice: Wheat,
	lamp: Lamp,
	fence: Fence,
	tree: TreePine,
	remove: Hammer,
	path: Grid2X2,
	grass: Leaf,
	flowers: Flower2
};
const initial: Snapshot = {
	seeds: 24,
	harvest: 0,
	elapsed: 0,
	tool: "hand",
	grid: false,
	paused: false,
	hint: "use",
	message: "welcome",
	hover: ""
};
export default function CozyFarmGame() {
	const { t } = useI18n();
	const host = useRef<HTMLDivElement>(null),
		game = useRef<Game | null>(null);
	const [state, setState] = useState(initial),
		[ready, setReady] = useState(false),
		[error, setError] = useState(false),
		[help, setHelp] = useState(false),
		[build, setBuild] = useState(false);
	useEffect(() => {
		const node = host.current;
		if (!node) return;
		let active = true;
		const instance = new Game(node, (s) => {
			if (active) setState(s);
		});
		game.current = instance;
		instance
			.start()
			.then(() => {
				if (active) {
					setReady(true);
					node.focus({ preventScroll: true });
				}
			})
			.catch((cause: unknown) => {
				if (active) {
					console.error("Cozy Farm initialization failed", cause);
					setError(true);
				}
			});
		return () => {
			active = false;
			instance.destroy();
			game.current = null;
		};
	}, []);
	const select = (tool: Tool) => {
		game.current?.select(tool);
		host.current?.focus({ preventScroll: true });
	};
	const button = (tool: Tool, i: number) => {
		const Icon = icons[tool];
		return (
			<button
				key={tool}
				type="button"
				className={state.tool === tool ? "selected" : ""}
				aria-pressed={state.tool === tool}
				aria-label={t(`cozy.tool.${tool}`)}
				title={t(`cozy.tool.${tool}`)}
				onClick={() => select(tool)}
			>
				<small>{i < 8 ? i + 1 : ""}</small>
				<Icon size={23} />
			</button>
		);
	};
	return (
		<section className="cozy-farm" aria-label="Cozy Fantasy Farm">
			<div ref={host} className="cozy-canvas" tabIndex={0} />
			{!ready && !error && <div className="cozy-loading">{t("cozy.loading")}</div>}
			{error && (
				<div className="cozy-loading" role="alert">
					{t("cozy.error")}
				</div>
			)}
			<div className="cozy-heading cozy-panel">
				<span className="cozy-eyebrow">WILLOWMERE</span>
				<h1>Cozy Fantasy Farm</h1>
				<p>
					{t("cozy.spring")} ·{" "}
					{Math.floor(state.elapsed / 60)
						.toString()
						.padStart(2, "0")}
					:
					{Math.floor(state.elapsed % 60)
						.toString()
						.padStart(2, "0")}
				</p>
			</div>
			<div className="cozy-top-actions cozy-panel">
				<span>
					<Sprout size={16} />
					{state.seeds}
					<span className="cozy-sr">{t("cozy.seeds")}</span>
				</span>
				<span>
					<Leaf size={16} />
					{state.harvest}
					<span className="cozy-sr">{t("cozy.harvest")}</span>
				</span>
				<button
					type="button"
					aria-label={t("cozy.zoomOut")}
					onClick={() => game.current?.setZoom(-0.25)}
				>
					<Minus size={17} />
				</button>
				<button
					type="button"
					aria-label={t("cozy.zoomIn")}
					onClick={() => game.current?.setZoom(0.25)}
				>
					<Plus size={17} />
				</button>
				<button
					type="button"
					aria-label={t("cozy.grid")}
					aria-pressed={state.grid}
					onClick={() => game.current?.toggleGrid()}
				>
					<Grid2X2 size={17} />
				</button>
				<button
					type="button"
					aria-label={t("cozy.help")}
					aria-expanded={help}
					onClick={() => {
						setHelp(!help);
						if (!help && !state.paused) game.current?.togglePause();
					}}
				>
					<BookOpen size={17} />
				</button>
				<button
					type="button"
					aria-label={t(state.paused ? "cozy.resume" : "cozy.pause")}
					onClick={() => game.current?.togglePause()}
				>
					{state.paused ? <Play size={17} /> : <Pause size={17} />}
				</button>
			</div>
			<div className="cozy-notice cozy-panel" role="status">
				{t(`cozy.message.${state.message}`)}
			</div>
			{state.paused && !help && (
				<div className="cozy-pause cozy-panel">
					<p>{t("cozy.paused")}</p>
					<button
						type="button"
						onClick={() => {
							game.current?.togglePause();
							host.current?.focus();
						}}
					>
						{t("cozy.resume")}
					</button>
				</div>
			)}
			{help && (
				<div className="cozy-help cozy-panel">
					<button
						className="cozy-close"
						type="button"
						aria-label={t("cozy.close")}
						onClick={() => {
							setHelp(false);
							if (state.paused) game.current?.togglePause();
							host.current?.focus();
						}}
					>
						<X size={18} />
					</button>
					<h2>{t("cozy.help")}</h2>
					<p>{t("cozy.help.move")}</p>
					<p>{t("cozy.help.farm")}</p>
					<p>{t("cozy.help.build")}</p>
					<p>{t("cozy.help.save")}</p>
					<p className="cozy-muted">{t("cozy.help.art")}</p>
				</div>
			)}
			<div className="cozy-bottom">
				<button
					type="button"
					className="cozy-prompt cozy-panel"
					onClick={() => game.current?.interact()}
				>
					<kbd>E</kbd> {t(`cozy.hint.${state.hint}`)}
				</button>
				<div className="cozy-toolbar cozy-panel">
					{TOOLS.slice(0, 8).map(button)}
					<button
						type="button"
						aria-label={t("cozy.build")}
						aria-expanded={build}
						className={build ? "selected" : ""}
						onClick={() => setBuild(!build)}
					>
						<Hammer size={21} />
					</button>
				</div>
				{build && (
					<div className="cozy-build cozy-panel">
						{TOOLS.slice(8).map((tool, i) => button(tool, i + 8))}
					</div>
				)}
				<div className="cozy-caption">
					{t(`cozy.tool.${state.tool}`)}{" "}
					<span>· {state.grid && state.hover ? state.hover : t("cozy.controls")}</span>
				</div>
			</div>
			<div className="cozy-touch">
				{[
					["w", ArrowUp],
					["a", ArrowLeft],
					["s", ArrowDown],
					["d", ArrowRight]
				].map(([key, Icon]) => {
					const DirectionIcon = Icon as typeof ArrowUp;
					return (
						<button
							key={key as string}
							type="button"
							aria-label={t(`cozy.direction.${key}`)}
							onPointerDown={(e) => {
								e.currentTarget.setPointerCapture(e.pointerId);
								game.current?.setDirection(key as string, true);
							}}
							onPointerUp={() => game.current?.setDirection(key as string, false)}
							onPointerCancel={() => game.current?.setDirection(key as string, false)}
							onLostPointerCapture={() =>
								game.current?.setDirection(key as string, false)
							}
						>
							<DirectionIcon size={20} />
						</button>
					);
				})}
			</div>
		</section>
	);
}
