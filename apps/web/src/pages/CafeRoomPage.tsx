import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CircleHelp, Copy, Leaf, Star, Wifi, WifiOff } from "lucide-react";
import AppHeaderBar from "@/components/header/AppHeaderBar";
import {
	AppHeaderDesktopControls,
	AppHeaderMobileControls,
	type AppHeaderControlProps
} from "@/components/header/AppHeaderControls";
import IconButton from "@/components/ui/IconButton";
import Button from "@/components/ui/Button";
import AppLayout from "@/layouts/AppLayout";
import { useI18n } from "@/i18n/i18nContext";
import CafeGameCanvas from "@/features/cafe/components/CafeGameCanvas";
import { useCafeRoom } from "@/features/cafe/hooks/useCafeRoom";
import type { CafeConnectionState, CafeRoomErrorCode, CafeRoomState } from "@/features/cafe/types";

type CafeRoomPageProps = {
	activityBar: ReactNode;
	backgroundImageUrl: string;
	headerControls: AppHeaderControlProps;
};

function CafeRoomPage(props: CafeRoomPageProps) {
	const { roomId } = useParams();
	if (!roomId || !isUuid(roomId)) {
		return <Navigate to="/cafe" replace />;
	}
	return <CafeRoomContent {...props} roomId={roomId} />;
}

function CafeRoomContent({
	activityBar,
	backgroundImageUrl,
	headerControls,
	roomId
}: CafeRoomPageProps & { roomId: string }) {
	const { t } = useI18n();
	const navigate = useNavigate();
	const cafe = useCafeRoom(roomId);
	const [copied, setCopied] = useState(false);
	const [showGuide, setShowGuide] = useState(shouldShowCafeGuide);
	const selfPlayer = cafe.room?.players.find((player) => player.id === cafe.selfPlayerId);
	const carriedTea = selfPlayer?.carriedTea ?? 0;
	const inputEnabled = cafe.connectionState === "connected";
	const roundCountdown = useRoundCountdown(cafe.room?.activity.nextRoundAt ?? null);
	const isIntermission = cafe.room?.activity.phase === "intermission";

	function dismissGuide() {
		setShowGuide(false);
		try {
			window.localStorage.setItem(CAFE_GUIDE_STORAGE_KEY, "seen");
		} catch {
			// The guide still works when browser storage is unavailable.
		}
	}

	async function copyInviteCode() {
		if (!cafe.room) return;
		try {
			await navigator.clipboard.writeText(cafe.room.inviteCode);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1600);
		} catch {
			setCopied(false);
		}
	}

	return (
		<AppLayout
			activityBar={activityBar}
			backgroundImageUrl={backgroundImageUrl}
			sidebar={<CafeRoomSidebar room={cafe.room} />}
			header={
				<AppHeaderBar
					onOpenSidebar={undefined}
					leading={
						<IconButton
							aria-label={t("cafe.room.leave")}
							onClick={() => navigate("/cafe")}
						>
							<ArrowLeft size={18} aria-hidden="true" />
						</IconButton>
					}
					title={t("cafe.room.title")}
					titleAccessory={<ConnectionBadge state={cafe.connectionState} />}
					desktopActions={<AppHeaderDesktopControls {...headerControls} />}
					mobileMenuContent={<AppHeaderMobileControls {...headerControls} />}
				/>
			}
			details={<CafeRoomDetails room={cafe.room} />}
		>
			<section className="relative min-h-0 flex-1 overflow-hidden">
				<CafeGameCanvas
					room={cafe.room}
					selfPlayerId={cafe.selfPlayerId}
					connectionEpoch={cafe.connectionEpoch}
					inputEnabled={inputEnabled}
					emote={cafe.emote}
					onMovement={cafe.sendMovement}
					onInteract={cafe.interact}
					interactionLabels={{
						collectTea: t("cafe.room.collectTea"),
						deliverTea: t("cafe.room.deliverTea", { count: carriedTea }),
						talkToAiko: t("cafe.room.talkToAiko"),
						idle: t("cafe.room.moveCloser")
					}}
					loadingLabel={t("cafe.room.connecting")}
				/>
				{cafe.room && showGuide && <CafeWelcomeGuide onDismiss={dismissGuide} />}
				<div className="pointer-events-none absolute left-3 right-3 top-3 z-30 flex items-start justify-between gap-3">
					<div
						className="max-w-[min(75%,24rem)] rounded-xl border border-dialog-border bg-dialog-soft px-3 py-2 text-app-text shadow-soft"
						data-testid="cafe-activity-hud"
					>
						<div className="flex items-center justify-between gap-3">
							<div className="flex items-center gap-2">
								<p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
									{t("cafe.activity.title")}
								</p>
								{cafe.room && (
									<span
										className="rounded-full border border-dialog-border bg-dialog-panel px-2 py-0.5 text-[10px] font-bold text-app-text"
										data-testid="cafe-round-number"
									>
										{t("cafe.activity.round", {
											round: cafe.room.activity.roundNumber
										})}
									</span>
								)}
							</div>
							<button
								type="button"
								className="pointer-events-auto -m-1 rounded-full p-1 text-muted transition hover:bg-dialog-panel hover:text-app-text focus:outline-none focus:ring-2 focus:ring-primary/35 dark:focus:ring-action-ring/25"
								onClick={() => setShowGuide(true)}
								aria-label={t("cafe.guide.open")}
							>
								<CircleHelp size={16} aria-hidden="true" />
							</button>
						</div>
						<p className="mt-1 text-sm font-semibold">
							{isIntermission
								? t("cafe.activity.complete")
								: t("cafe.activity.progress", {
										current: cafe.room?.activity.delivered ?? 0,
										target: cafe.room?.activity.target ?? 3
									})}
						</p>
						{!isIntermission && carriedTea > 0 && (
							<p
								className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-dialog-border bg-dialog-panel px-2 py-1 text-xs font-semibold text-app-text"
								data-testid="cafe-carried-tea"
							>
								<Leaf size={13} aria-hidden="true" />
								{t("cafe.activity.carried", { count: carriedTea })}
							</p>
						)}
						<p
							className="mt-2 border-t border-dialog-border pt-2 text-xs leading-5 text-muted"
							data-testid="cafe-quest-hint"
						>
							{isIntermission
								? roundCountdown > 0
									? t("cafe.activity.nextRound", { seconds: roundCountdown })
									: t("cafe.activity.startingRound")
								: carriedTea > 0
									? t("cafe.activity.returnHint")
									: t("cafe.activity.findHint")}
						</p>
					</div>
					<div
						className="rounded-xl border border-dialog-border bg-dialog-soft px-3 py-2 text-app-text shadow-soft"
						data-testid="cafe-stars"
					>
						<p className="flex items-center gap-2 text-sm font-semibold">
							<Star size={16} className="text-amber-300" aria-hidden="true" />
							{cafe.cafeStars}
						</p>
					</div>
				</div>
				<div
					className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 gap-1 rounded-full border border-dialog-border bg-dialog-soft p-1.5 text-app-text shadow-soft max-sm:bottom-24"
					data-testid="cafe-emotes"
				>
					{["wave", "heart", "happy", "tea"].map((value) => (
						<button
							key={value}
							type="button"
							className="flex size-9 items-center justify-center rounded-full text-lg transition hover:bg-dialog-panel focus:outline-none focus:ring-2 focus:ring-primary/35 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-action-ring/25"
							aria-label={t(`cafe.emote.${value}`)}
							onClick={() => cafe.sendEmote(value)}
							disabled={!inputEnabled}
						>
							{{ wave: "👋", heart: "💗", happy: "✨", tea: "🍵" }[value]}
						</button>
					))}
				</div>
				{cafe.dialogue && (
					<div
						className="absolute bottom-28 left-1/2 z-40 flex w-[min(92%,34rem)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-dialog-border bg-dialog-soft p-3 text-app-text shadow-soft max-sm:bottom-44"
						data-testid="aiko-dialogue"
						role="status"
						aria-live="polite"
					>
						<div className="flex size-16 shrink-0 items-end justify-center overflow-hidden rounded-xl border border-dialog-border bg-dialog-panel">
							<img
								src={`/images/aiko-pngtuber/aiko-${cafe.dialogue.expression}.png`}
								alt="Aiko"
								className="h-16 w-14 object-contain object-bottom"
							/>
						</div>
						<div className="min-w-0 py-1">
							<p className="text-xs font-bold uppercase tracking-[0.12em] text-app-text">
								Aiko
							</p>
							<p className="mt-1 text-sm font-medium leading-5 text-app-text">
								{cafe.dialogue.message}
							</p>
						</div>
					</div>
				)}
				{cafe.connectionState === "reconnecting" && (
					<div className="absolute inset-x-0 top-0 z-50 border-b border-dialog-border bg-dialog-soft px-3 py-1.5 text-center text-xs font-semibold text-app-text shadow-soft">
						{t("cafe.room.reconnecting")}
					</div>
				)}
				{cafe.connectionState === "offline" && (
					<div
						className="absolute inset-x-0 top-0 z-50 border-b border-dialog-border bg-dialog-soft px-3 py-2 text-center text-xs font-semibold text-app-text shadow-soft"
						data-testid="cafe-offline-status"
						role="status"
					>
						{t("cafe.room.offlineMessage")}
					</div>
				)}
				{cafe.error && cafe.connectionState !== "closed" && (
					<div
						className="absolute left-1/2 top-20 z-50 -translate-x-1/2 rounded-lg border border-red-400/30 bg-dialog-soft px-4 py-2 text-sm text-red-500 shadow-soft"
						role="status"
					>
						{t(roomErrorTranslationKey(cafe.error))}
					</div>
				)}
				{cafe.error && cafe.connectionState === "closed" && (
					<CafeRoomRecovery
						error={cafe.error}
						onBack={() => navigate("/cafe")}
						onRetry={cafe.retryConnection}
					/>
				)}
				{cafe.room && (
					<button
						type="button"
						className="absolute right-3 top-20 z-30 rounded-lg border border-dialog-border bg-dialog-soft px-3 py-2 text-xs font-semibold text-app-text shadow-soft transition hover:bg-dialog-panel focus:outline-none focus:ring-2 focus:ring-primary/35 dark:focus:ring-action-ring/25"
						onClick={() => void copyInviteCode()}
						data-testid="cafe-invite-code"
					>
						<span className="flex items-center gap-2">
							<Copy size={14} aria-hidden="true" />
							{copied ? t("cafe.room.copied") : cafe.room.inviteCode}
						</span>
					</button>
				)}
			</section>
		</AppLayout>
	);
}

function CafeWelcomeGuide({ onDismiss }: { onDismiss: () => void }) {
	const { t } = useI18n();
	return (
		<div className="absolute inset-0 z-[70] flex items-center justify-center bg-app-bg/72 p-4 backdrop-blur-[3px]">
			<div
				className="w-full max-w-md rounded-3xl border border-dialog-border bg-dialog-panel p-5 text-center text-app-text shadow-soft sm:p-6"
				role="dialog"
				aria-modal="true"
				aria-labelledby="cafe-guide-title"
			>
				<div className="mx-auto flex size-12 items-center justify-center rounded-full border border-dialog-border bg-dialog-soft text-2xl shadow-inner">
					🍃
				</div>
				<h2 id="cafe-guide-title" className="mt-3 text-xl font-bold">
					{t("cafe.guide.title")}
				</h2>
				<p className="mt-2 text-sm leading-6 text-muted">{t("cafe.guide.description")}</p>
				<div className="mt-4 rounded-2xl border border-dialog-border bg-dialog-soft px-4 py-3 text-sm font-semibold leading-6 text-app-text">
					<span className="hidden sm:inline">{t("cafe.guide.desktopControls")}</span>
					<span className="sm:hidden">{t("cafe.guide.mobileControls")}</span>
				</div>
				<Button className="mt-5" size="lg" variant="action" onClick={onDismiss}>
					{t("cafe.guide.start")}
				</Button>
			</div>
		</div>
	);
}

function CafeRoomSidebar({ room }: { room: CafeRoomState | null }) {
	const { t } = useI18n();
	return (
		<aside className="hidden h-full w-[18.5rem] shrink-0 border-r border-app-border bg-app-panel/62 lg:flex lg:flex-col">
			<div className="flex h-16 items-center border-b border-app-border px-5">
				<div>
					<p className="font-semibold text-app-text">{t("cafe.room.members")}</p>
					<p className="text-xs text-muted">
						{room?.players.length ?? 0}/{room?.capacity ?? 8}
					</p>
				</div>
			</div>
			<div className="space-y-2 overflow-y-auto p-3">
				{room?.players.map((player) => (
					<div
						key={player.id}
						className="flex items-center gap-3 rounded-lg border border-app-border bg-app-soft p-3"
					>
						<span
							className="size-3 rounded-full"
							style={{ backgroundColor: player.color }}
						/>
						<span className="min-w-0 flex-1 truncate text-sm font-semibold text-app-text">
							{player.name}
						</span>
						{player.carriedTea > 0 && (
							<span className="text-xs text-muted">🍃 {player.carriedTea}</span>
						)}
						{player.equippedCosmetic && (
							<span
								className="flex size-7 items-center justify-center rounded-full border border-app-border bg-app-panel text-sm text-app-text"
								aria-label={t("cafe.cosmetics.wearing", {
									name: t(`cafe.cosmetics.${player.equippedCosmetic}.name`)
								})}
								data-testid={`cafe-member-cosmetic-${player.id}`}
							>
								{cosmeticGlyph(player.equippedCosmetic)}
							</span>
						)}
					</div>
				))}
			</div>
		</aside>
	);
}

function CafeRoomDetails({ room }: { room: CafeRoomState | null }) {
	const { t } = useI18n();
	return (
		<aside className="hidden min-h-0 border-l border-app-border bg-app-panel/62 xl:flex xl:flex-col">
			<div className="border-b border-app-border p-4">
				<p className="font-semibold text-app-text">{t("cafe.activity.title")}</p>
				{room && (
					<p className="mt-1 text-xs text-muted">
						{t("cafe.activity.round", { round: room.activity.roundNumber })}
					</p>
				)}
			</div>
			<div className="space-y-4 p-4">
				<div className="rounded-xl border border-app-border bg-app-soft p-4">
					<div className="flex items-center justify-between text-sm">
						<span className="text-muted">{t("cafe.activity.teaLeaves")}</span>
						<span className="font-semibold text-app-text">
							{room?.activity.delivered ?? 0}/{room?.activity.target ?? 3}
						</span>
					</div>
					<div className="mt-3 h-2 overflow-hidden rounded-full bg-app-border">
						<div
							className="h-full rounded-full bg-app-text/70 transition-all"
							style={{
								width: `${Math.min(100, ((room?.activity.delivered ?? 0) / (room?.activity.target ?? 3)) * 100)}%`
							}}
						/>
					</div>
				</div>
				<div className="rounded-xl border border-app-border bg-app-soft p-4 text-sm leading-6 text-muted">
					{t("cafe.room.controls")}
				</div>
			</div>
		</aside>
	);
}

function ConnectionBadge({ state }: { state: CafeConnectionState }) {
	const { t } = useI18n();
	const connected = state === "connected";
	const offline = state === "offline";
	return (
		<span
			className={connected ? "text-emerald-500" : offline ? "text-red-500" : "text-amber-500"}
		>
			{connected ? (
				<Wifi size={15} aria-label={t("cafe.room.connected")} />
			) : (
				<WifiOff
					size={15}
					aria-label={offline ? t("cafe.room.offline") : t("cafe.room.connectingStatus")}
				/>
			)}
		</span>
	);
}

function CafeRoomRecovery({
	error,
	onBack,
	onRetry
}: {
	error: CafeRoomErrorCode;
	onBack: () => void;
	onRetry: () => void;
}) {
	const { t } = useI18n();
	return (
		<div className="absolute inset-0 z-60 flex items-center justify-center bg-app-bg/72 p-4">
			<div
				className="w-full max-w-md rounded-2xl border border-dialog-border bg-dialog-soft p-5 text-center shadow-soft sm:p-6"
				role="alert"
			>
				<WifiOff className="mx-auto text-muted" size={30} aria-hidden="true" />
				<h2 className="mt-3 text-lg font-semibold text-app-text">
					{t("cafe.room.connectionProblem")}
				</h2>
				<p className="mt-2 text-sm leading-6 text-muted">
					{t(roomErrorTranslationKey(error))}
				</p>
				<div className="mt-5 flex flex-col-reverse justify-center gap-2 sm:flex-row">
					<Button onClick={onBack}>{t("cafe.room.backToLobby")}</Button>
					<Button variant="primary" onClick={onRetry}>
						{t("cafe.room.retry")}
					</Button>
				</div>
			</div>
		</div>
	);
}

function roomErrorTranslationKey(error: CafeRoomErrorCode): string {
	switch (error) {
		case "room_not_found":
			return "cafe.room.errorNotFound";
		case "room_full":
			return "cafe.room.errorFull";
		case "rate_limited":
			return "cafe.room.errorRateLimited";
		case "unreadable_update":
			return "cafe.room.errorUnreadable";
		case "connection_interrupted":
			return "cafe.room.errorInterrupted";
		default:
			return "cafe.room.errorUnavailable";
	}
}

function useRoundCountdown(nextRoundAt: number | null): number {
	const [seconds, setSeconds] = useState(() => secondsUntilRound(nextRoundAt));

	useEffect(() => {
		setSeconds(secondsUntilRound(nextRoundAt));
		if (nextRoundAt === null) return;
		const timer = window.setInterval(() => setSeconds(secondsUntilRound(nextRoundAt)), 250);
		return () => window.clearInterval(timer);
	}, [nextRoundAt]);

	return seconds;
}

function secondsUntilRound(nextRoundAt: number | null): number {
	return nextRoundAt === null ? 0 : Math.max(0, Math.ceil((nextRoundAt - Date.now()) / 1000));
}

function isUuid(value: string) {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function cosmeticGlyph(cosmeticId: string) {
	return { sakura_pin: "✿", mint_scarf: "〰", tea_hat: "🍵" }[cosmeticId] ?? "✦";
}

const CAFE_GUIDE_STORAGE_KEY = "wfchat_cafe_guide_seen_v1";

function shouldShowCafeGuide() {
	try {
		return window.localStorage.getItem(CAFE_GUIDE_STORAGE_KEY) !== "seen";
	} catch {
		return true;
	}
}

export default CafeRoomPage;
