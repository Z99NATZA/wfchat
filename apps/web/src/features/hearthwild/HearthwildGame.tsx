import { isNightTime, lightingMinutes, type LightingPreview } from "./lighting";
import { useEffect, useRef, useState } from "react";
import {
	Backpack,
	Crosshair,
	Footprints,
	BookOpen,
	ChevronDown,
	Expand,
	Grid2X2,
	Hand,
	Heart,
	HelpCircle,
	Leaf,
	Minus,
	Moon,
	Pause,
	Play,
	Plus,
	Shovel,
	Sprout,
	Sun,
	Swords,
	TreePine,
	Undo2,
	Volume2,
	VolumeX,
	X
} from "lucide-react";
import { useI18n } from "@/i18n/i18nContext";
import { HearthwildEngine, nearestHint } from "./engine";
import { newGame, type GameState } from "./state";
import { PALETTE } from "./appearance";
import { MAPS, terrain, type Tool } from "./world";
import "./hearthwild.css";
const TOOLS: { id: Tool; icon: typeof Hand; cost?: number; sprite?: number }[] = [
	{ id: "hand", icon: Hand },
	{ id: "path", icon: Shovel, cost: 1 },
	{ id: "soil", icon: Sprout },
	{ id: "crop", icon: Leaf, sprite: 7 },
	{ id: "lantern", icon: Sun, cost: 3, sprite: 5 },
	{ id: "fence", icon: Grid2X2, cost: 2, sprite: 6 },
	{ id: "tree", icon: TreePine, cost: 4, sprite: 0 },
	{ id: "remove", icon: Undo2 }
];
function MiniMap({ state }: { state: GameState }) {
	const ref = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const canvas = ref.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d")!;
		const { width, height } = MAPS[state.map];
		ctx.fillStyle = state.map === "garden" ? PALETTE.grass[1] : "#484a43";
		ctx.fillRect(0, 0, 114, 84);
		const sx = 114 / width,
			sy = 84 / height;
		if (state.map === "garden") {
			for (let y = 0; y < height; y++)
				for (let x = 0; x < width; x++) {
					const t = terrain("garden", x, y);
					ctx.fillStyle =
						t === "water"
							? PALETTE.water
							: t === "path"
								? PALETTE.path
								: t === "wall"
									? PALETTE.forest
									: PALETTE.grass[1];
					ctx.fillRect(x * sx, y * sy, Math.ceil(sx), Math.ceil(sy));
				}
			ctx.fillStyle = "#b7754f";
			ctx.fillRect(11 * sx, 5 * sy, 7 * sx, 4 * sy);
		}
		for (const o of state.objects[state.map]) {
			ctx.fillStyle =
				o.kind === "tree" ? PALETTE.forest : o.kind === "crystal" ? "#68d6bf" : "#9d9167";
			ctx.fillRect(o.x * sx, o.y * sy, Math.max(2, sx), Math.max(2, sy));
		}
		ctx.fillStyle = "#ffe3a4";
		for (const p of MAPS[state.map].portals) ctx.fillRect(p.x * sx - 1, p.y * sy - 1, 4, 4);
		ctx.fillStyle = "#fff9df";
		ctx.beginPath();
		ctx.arc(state.x * sx, state.y * sy, 3, 0, Math.PI * 2);
		ctx.fill();
	}, [state]);
	return <canvas ref={ref} width={114} height={84} aria-hidden="true" />;
}
export default function HearthwildGame() {
	const { t } = useI18n();
	const tr = (key: string) => t(`hearthwild.${key}`);
	const root = useRef<HTMLDivElement>(null),
		canvas = useRef<HTMLCanvasElement>(null),
		engine = useRef<HearthwildEngine | null>(null);
	const [state, setState] = useState<GameState>(newGame),
		[tool, setTool] = useState<Tool>("hand"),
		[grid, setGrid] = useState(false),
		[paused, setPaused] = useState(false),
		[panel, setPanel] = useState<"help" | "bag" | null>(null),
		[journal, setJournal] = useState(false),
		[zoom, setZoom] = useState(1.2),
		[lightingPreview, setLightingPreview] = useState<LightingPreview>("auto"),
		[loading, setLoading] = useState(true),
		[error, setError] = useState(false),
		[retry, setRetry] = useState(0),
		[saved, setSaved] = useState(true),
		[muted, setMuted] = useState(true);
	const audio = useRef<AudioContext | null>(null);
	const blocked = paused || panel !== null;
	const previewNight = isNightTime(lightingMinutes(state.minutes, lightingPreview));
	useEffect(() => {
		if (!canvas.current || !root.current) return;
		const game = new HearthwildEngine(
			canvas.current,
			root.current,
			(s, ok) => {
				setState(s);
				setSaved(ok);
			},
			(failed) => {
				setLoading(false);
				setError(failed);
			}
		);
		engine.current = game;
		return () => {
			game.destroy();
			engine.current = null;
		};
	}, [retry]);
	useEffect(() => {
		engine.current?.configure({ tool, grid, paused: blocked, zoom, lightingPreview });
	}, [tool, grid, blocked, zoom, lightingPreview, retry]);
	useEffect(
		() => () => {
			void audio.current?.close();
		},
		[]
	);
	function act(action: "interact" | "attack" | "eat") {
		engine.current?.action(action);
		root.current?.focus({ preventScroll: true });
		if (!muted) {
			const ac = audio.current ?? new AudioContext();
			audio.current = ac;
			void ac.resume();
			const oscillator = ac.createOscillator(),
				gain = ac.createGain();
			oscillator.type = "sine";
			oscillator.frequency.setValueAtTime(action === "attack" ? 180 : 540, ac.currentTime);
			oscillator.frequency.exponentialRampToValueAtTime(90, ac.currentTime + 0.15);
			gain.gain.setValueAtTime(0.035, ac.currentTime);
			gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.2);
			oscillator.connect(gain);
			gain.connect(ac.destination);
			oscillator.start();
			oscillator.stop(ac.currentTime + 0.2);
		}
	}
	function choose(id: Tool) {
		setTool(id);
		root.current?.focus({ preventScroll: true });
	}
	const day = Math.floor(state.minutes / 1440) + 1,
		hour = Math.floor(state.minutes / 60) % 24,
		minute = Math.floor(state.minutes) % 60,
		remaining = `${Math.floor(state.awake / 60)
			.toString()
			.padStart(2, "0")}:${Math.floor(state.awake % 60)
			.toString()
			.padStart(2, "0")}`;
	const decorated = state.objects.garden.filter(
		(o) => o.id.startsWith("placed-") && ["tree", "fence", "lantern"].includes(o.kind)
	).length;
	return (
		<div
			ref={root}
			tabIndex={0}
			className="hearthwild"
			data-testid="hearthwild-stage"
			data-motion={state.motion}
			data-animation={state.attack > 0 ? state.weapon : state.motion}
			data-weapon={state.weapon}
			data-lighting-preview={lightingPreview}
			onKeyDown={(e) => {
				if (e.key === "Escape") {
					if (panel) setPanel(null);
					else setPaused((v) => !v);
				}
				if (/^[1-8]$/.test(e.key) && !blocked) choose(TOOLS[Number(e.key) - 1].id);
				if (e.key.toLowerCase() === "g" && !blocked) setGrid((v) => !v);
				if (e.key.toLowerCase() === "i") setPanel((v) => (v === "bag" ? null : "bag"));
			}}
		>
			<canvas
				ref={canvas}
				className="hw-world"
				aria-label={tr("canvas")}
				data-testid="hearthwild-canvas"
			/>
			<div className="hw-top-left">
				<div className="hw-place hw-panel">
					<span className="hw-location-icon">
						<TreePine size={22} />
					</span>
					<div>
						<span className="hw-eyebrow">HEARTHWILD</span>
						<h2>{tr(`map.${state.map}`)}</h2>
					</div>
					<span className="hw-season">
						<Leaf size={13} />
						{tr("spring")}
					</span>
				</div>
				<button
					className="hw-journal-toggle hw-panel"
					onClick={() => setJournal((v) => !v)}
					aria-expanded={journal}
				>
					<BookOpen size={15} />
					{tr("journal")}
					<span>
						{Number(state.harvested >= 3) +
							Number(state.gems >= 3) +
							Number(decorated >= 3)}
						/3
					</span>
					<ChevronDown size={14} />
				</button>
				<div
					className="hw-light-preview hw-panel"
					role="group"
					aria-label={tr("lighting.test")}
				>
					<button
						aria-label={tr("lighting.toggle")}
						title={tr("lighting.toggle")}
						aria-pressed={previewNight}
						disabled={loading || error || state.sleep > 0}
						onClick={() => {
							setLightingPreview((current) =>
								isNightTime(lightingMinutes(state.minutes, current))
									? "day"
									: "night"
							);
							root.current?.focus({ preventScroll: true });
						}}
					>
						{previewNight ? <Moon size={15} /> : <Sun size={15} />}
						<span>{tr(previewNight ? "lighting.night" : "lighting.day")}</span>
						<small>{tr("lighting.test")}</small>
					</button>
					{lightingPreview !== "auto" && (
						<button
							className="hw-light-auto"
							aria-label={tr("lighting.reset")}
							title={tr("lighting.reset")}
							onClick={() => {
								setLightingPreview("auto");
								root.current?.focus({ preventScroll: true });
							}}
						>
							{tr("lighting.auto")}
						</button>
					)}
				</div>
				{journal && (
					<div className="hw-journal hw-panel">
						<span className="hw-eyebrow">{tr("firstSteps")}</span>
						<h3>{tr("makeHome")}</h3>
						{[
							[state.harvested, 3, "questHarvest"],
							[state.gems, 3, "questGems"],
							[decorated, 3, "questBuild"]
						].map(([value, total, label]) => (
							<div key={label} className="hw-quest">
								<span
									className={
										Number(value) >= Number(total)
											? "hw-check done"
											: "hw-check"
									}
								>
									{Number(value) >= Number(total) ? "✓" : ""}
								</span>
								<span>{tr(String(label))}</span>
								<small>
									{Math.min(Number(value), Number(total))}/{total}
								</small>
							</div>
						))}
						<p>{tr("questNote")}</p>
					</div>
				)}
			</div>
			<div className="hw-top-right">
				<div className="hw-clock hw-panel">
					<Sun size={20} />
					<div>
						<b>
							{String(hour).padStart(2, "0")}:{String(minute).padStart(2, "0")}
						</b>
						<span>
							{tr("day")} {day} · {tr("spring")}
						</span>
					</div>
					<span className="hw-coins">◈ {state.coins}</span>
				</div>
				<div className="hw-vitals hw-panel">
					<div>
						<Heart size={14} />
						<span>{tr("health")}</span>
						<b>{state.hp}/100</b>
					</div>
					<div className="hw-bar">
						<i style={{ width: `${state.hp}%` }} />
					</div>
					<div className={state.awake < 60 ? "hw-tired" : ""}>
						<Moon size={14} />
						<span>{tr("awake")}</span>
						<b data-testid="awake-timer">{remaining}</b>
					</div>
					<div className="hw-bar hw-energy">
						<i style={{ width: `${state.awake / 6}%` }} />
					</div>
				</div>
				<div className="hw-minimap hw-panel">
					<MiniMap state={state} />
					<span>
						<span className="hw-dot" />
						{tr("youAreHere")}
					</span>
				</div>
			</div>
			<div className="hw-side-actions">
				<button title={tr("bag")} aria-label={tr("bag")} onClick={() => setPanel("bag")}>
					<Backpack size={20} />
				</button>
				<button title={tr("help")} aria-label={tr("help")} onClick={() => setPanel("help")}>
					<HelpCircle size={20} />
				</button>
				<button
					title={tr("pause")}
					aria-label={tr("pause")}
					onClick={() => setPaused((v) => !v)}
				>
					{paused ? <Play size={19} /> : <Pause size={19} />}
				</button>
				<button
					title={tr("sound")}
					aria-label={tr("sound")}
					aria-pressed={!muted}
					onClick={() => setMuted((v) => !v)}
				>
					{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
				</button>
				<button
					title={tr("fullscreen")}
					aria-label={tr("fullscreen")}
					onClick={() => {
						if (document.fullscreenElement) void document.exitFullscreen();
						else void root.current?.requestFullscreen().catch(() => {});
					}}
				>
					<Expand size={18} />
				</button>
			</div>
			{!blocked && state.sleep === 0 && (
				<div className="hw-toast" role="status" key={state.messageId}>
					{tr(`message.${state.message}`)}
				</div>
			)}
			<div className="hw-bottom">
				<div className="hw-context">
					<span className="hw-mode-label">
						{tool === "hand" ? (
							<>
								<span className="hw-dot" />
								{tr("exploreMode")}
							</>
						) : (
							<>
								<Grid2X2 size={13} />
								{tr("buildMode")} · {tr(`tool.${tool}`)}
							</>
						)}
					</span>
					<button onClick={() => act("interact")} disabled={blocked || state.sleep > 0}>
						<kbd>E</kbd>
						{tr(`hint.${nearestHint(state)}`)}
					</button>
				</div>
				<div className="hw-toolbar hw-panel">
					<div className="hw-tools">
						{TOOLS.map((item, i) => (
							<button
								key={item.id}
								className={tool === item.id ? "hw-tool active" : "hw-tool"}
								aria-label={tr(`tool.${item.id}`)}
								aria-pressed={tool === item.id}
								title={`${tr(`tool.${item.id}`)}${item.cost ? ` · ${item.cost} ${tr("wood")}` : ""} [${i + 1}]`}
								onClick={() => choose(item.id)}
							>
								<small>{i + 1}</small>
								<item.icon size={23} />
								{item.cost !== undefined && <em>{item.cost}</em>}
							</button>
						))}
					</div>
					<span className="hw-tool-divider" />
					<button
						className={grid ? "hw-grid active" : "hw-grid"}
						aria-label={tr("grid")}
						aria-pressed={grid}
						onClick={() => {
							setGrid((v) => !v);
							root.current?.focus();
						}}
					>
						<Grid2X2 size={19} />
						<small>G</small>
					</button>
					<button
						className="hw-grid hw-bag"
						aria-label={tr("bag")}
						onClick={() => setPanel("bag")}
					>
						<Backpack size={22} />
						<small>I</small>
					</button>
				</div>
				<div className="hw-footer">
					<span>
						<kbd>W A S D</kbd> {tr("move")}
						<i>·</i>
						<kbd>SHIFT</kbd> {tr("run")}
						<i>·</i>
						<kbd>SPACE</kbd> {tr("attack")}
						<i>·</i>
						{tr("clickWalk")}
					</span>
					<span className={saved ? "hw-save" : "hw-save hw-tired"}>
						<span className="hw-dot" />
						{tr(saved ? "autosave" : "saveFailed")}
					</span>
				</div>
			</div>
			<div className="hw-weapons hw-panel" role="group" aria-label={tr("weapons")}>
				<span className="hw-player-name">Aiko</span>
				{(["sword", "bow"] as const).map((weapon) => (
					<button
						key={weapon}
						aria-label={tr(`weapon.${weapon}`)}
						aria-pressed={state.weapon === weapon}
						disabled={blocked || state.sleep > 0 || state.attack > 0}
						onClick={() => {
							engine.current?.selectWeapon(weapon);
							root.current?.focus({ preventScroll: true });
						}}
					>
						{weapon === "sword" ? <Swords size={17} /> : <Crosshair size={17} />}
						<span>{tr(`weapon.${weapon}`)}</span>
					</button>
				))}
				<kbd>Q</kbd>
			</div>
			<div className="hw-zoom hw-panel">
				<button
					aria-label={tr("zoomOut")}
					onClick={() => setZoom((v) => Math.max(0.8, v - 0.2))}
				>
					<Minus size={15} />
				</button>
				<span>{Math.round((zoom / 1.2) * 100)}%</span>
				<button
					aria-label={tr("zoomIn")}
					onClick={() => setZoom((v) => Math.min(2.2, v + 0.2))}
				>
					<Plus size={15} />
				</button>
			</div>
			<div className="hw-touch">
				<div className="hw-dpad">
					{["w", "a", "s", "d"].map((key, i) => (
						<button
							key={key}
							className={`hw-dir-${key}`}
							aria-label={tr(`direction.${key}`)}
							onPointerDown={(e) => {
								e.currentTarget.setPointerCapture(e.pointerId);
								engine.current?.direction(key, true);
							}}
							onPointerUp={() => engine.current?.direction(key, false)}
							onPointerCancel={() => engine.current?.direction(key, false)}
							onLostPointerCapture={() => engine.current?.direction(key, false)}
						>
							{["↑", "←", "↓", "→"][i]}
						</button>
					))}
				</div>
				<button
					className="hw-run-hold"
					aria-label={tr("run")}
					onPointerDown={(e) => {
						e.currentTarget.setPointerCapture(e.pointerId);
						engine.current?.direction("shift", true);
					}}
					onPointerUp={() => engine.current?.direction("shift", false)}
					onPointerCancel={() => engine.current?.direction("shift", false)}
					onLostPointerCapture={() => engine.current?.direction("shift", false)}
				>
					<Footprints size={22} />
				</button>
				<button
					className="hw-attack"
					aria-label={tr("attack")}
					onClick={() => act("attack")}
				>
					{state.weapon === "sword" ? <Swords size={22} /> : <Crosshair size={22} />}
				</button>
			</div>
			{(loading || error) && (
				<div className="hw-overlay">
					<div className="hw-modal">
						<TreePine size={36} />
						<h2>{tr(error ? "loadError" : "loading")}</h2>
						{error && (
							<button
								className="hw-primary"
								onClick={() => {
									setLoading(true);
									setError(false);
									setRetry((v) => v + 1);
								}}
							>
								{tr("retry")}
							</button>
						)}
					</div>
				</div>
			)}
			{state.sleep > 0 && (
				<div className="hw-sleep" data-testid="sleep-overlay">
					<Moon size={38} />
					<h2>{tr("sleepTitle")}</h2>
					<p>{tr("sleepDetail")}</p>
					<b>{Math.ceil(state.sleep)}s</b>
					<span>{tr(`message.${state.message}`)}</span>
				</div>
			)}
			{blocked && (
				<div className="hw-overlay">
					<section
						className="hw-modal"
						role="dialog"
						aria-modal="true"
						aria-label={tr(panel ?? "paused")}
						onKeyDown={(e) => {
							if (e.key !== "Tab") return;
							const buttons = Array.from(
								e.currentTarget.querySelectorAll<HTMLButtonElement>(
									"button:not(:disabled)"
								)
							);
							const first = buttons[0],
								last = buttons[buttons.length - 1];
							if (e.shiftKey && document.activeElement === first) {
								e.preventDefault();
								last?.focus();
							} else if (!e.shiftKey && document.activeElement === last) {
								e.preventDefault();
								first?.focus();
							}
						}}
					>
						<button
							className="hw-close"
							aria-label={tr("close")}
							autoFocus
							onClick={() => {
								setPanel(null);
								setPaused(false);
								root.current?.focus();
							}}
						>
							<X size={20} />
						</button>
						{panel === "help" ? (
							<>
								<span className="hw-eyebrow">HEARTHWILD</span>
								<h2>{tr("welcomeTitle")}</h2>
								<p>{tr("intro")}</p>
								<div className="hw-help-list">
									{["walk", "interact", "build", "fight", "sleep"].map((key) => (
										<div key={key}>
											<b>{tr(`help.${key}.title`)}</b>
											<p>{tr(`help.${key}.body`)}</p>
										</div>
									))}
								</div>
								<button
									className="hw-primary"
									onClick={() => {
										setPanel(null);
										root.current?.focus();
									}}
								>
									{tr("letsGo")}
								</button>
							</>
						) : panel === "bag" ? (
							<>
								<Backpack size={30} />
								<h2>{tr("bag")}</h2>
								<div className="hw-inventory">
									{(["wood", "seeds", "food", "gems", "coins"] as const).map(
										(key) => (
											<div key={key}>
												<span>{tr(key)}</span>
												<b>{state[key]}</b>
											</div>
										)
									)}
								</div>
								<p>{tr("foodDetail")}</p>
								<button
									className="hw-primary"
									disabled={state.food === 0 || state.sleep > 0}
									onClick={() => {
										setPanel(null);
										setPaused(false);
										engine.current?.configure({
											tool,
											grid,
											paused: false,
											lightingPreview,
											zoom
										});
										act("eat");
									}}
								>
									{tr("eat")} (+25 HP)
								</button>
							</>
						) : (
							<>
								<Moon size={30} />
								<h2>{tr("paused")}</h2>
								<p>{tr("pauseDetail")}</p>
								<button
									className="hw-primary"
									onClick={() => {
										setPaused(false);
										root.current?.focus();
									}}
								>
									{tr("resume")}
								</button>
							</>
						)}
					</section>
				</div>
			)}
		</div>
	);
}
