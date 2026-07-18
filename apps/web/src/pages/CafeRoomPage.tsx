import { useState, type ReactNode } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Copy, Star, Wifi, WifiOff } from "lucide-react";
import AppHeaderBar from "@/components/header/AppHeaderBar";
import {
	AppHeaderDesktopControls,
	AppHeaderMobileControls,
	type AppHeaderControlProps
} from "@/components/header/AppHeaderControls";
import IconButton from "@/components/ui/IconButton";
import AppLayout from "@/layouts/AppLayout";
import { useI18n } from "@/i18n/i18nContext";
import CafeGameCanvas from "@/features/cafe/components/CafeGameCanvas";
import { useCafeRoom } from "@/features/cafe/hooks/useCafeRoom";
import type { CafeConnectionState, CafeRoomState } from "@/features/cafe/types";

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
					subtitle={
						cafe.room
							? `${t("cafe.room.code")}: ${cafe.room.inviteCode}`
							: t("cafe.room.connecting")
					}
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
					emote={cafe.emote}
					onMovement={cafe.sendMovement}
					onInteract={cafe.interact}
					interactionLabel={t("cafe.room.interact")}
					loadingLabel={t("cafe.room.connecting")}
				/>
				<div className="pointer-events-none absolute left-3 right-3 top-3 z-30 flex items-start justify-between gap-3">
					<div className="rounded-xl border border-white/70 bg-slate-950/68 px-3 py-2 text-white shadow-lg backdrop-blur-sm">
						<p className="text-[11px] font-semibold uppercase tracking-wide text-white/65">
							{t("cafe.activity.title")}
						</p>
						<p className="mt-1 text-sm font-semibold">
							{cafe.room?.activity.completed
								? t("cafe.activity.complete")
								: t("cafe.activity.progress", {
										current: cafe.room?.activity.delivered ?? 0,
										target: cafe.room?.activity.target ?? 3
									})}
						</p>
					</div>
					<div className="rounded-xl border border-white/70 bg-slate-950/68 px-3 py-2 text-white shadow-lg backdrop-blur-sm">
						<p className="flex items-center gap-2 text-sm font-semibold">
							<Star size={16} className="text-amber-300" aria-hidden="true" />
							{cafe.cafeStars}
						</p>
					</div>
				</div>
				<div className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 gap-1 rounded-full border border-white/70 bg-slate-950/68 p-1.5 shadow-lg backdrop-blur-sm max-sm:bottom-24">
					{["wave", "heart", "happy", "tea"].map((value) => (
						<button
							key={value}
							type="button"
							className="flex size-9 items-center justify-center rounded-full text-lg transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/50"
							aria-label={t(`cafe.emote.${value}`)}
							onClick={() => cafe.sendEmote(value)}
						>
							{{ wave: "👋", heart: "💗", happy: "✨", tea: "🍵" }[value]}
						</button>
					))}
				</div>
				{cafe.dialogue && (
					<div className="absolute bottom-16 left-1/2 z-40 flex w-[min(92%,42rem)] -translate-x-1/2 items-end gap-3 rounded-2xl border border-white/80 bg-app-panel/94 p-3 shadow-xl backdrop-blur-md max-sm:bottom-40">
						<img
							src={`/images/aiko-pngtuber/aiko-${cafe.dialogue.expression}.png`}
							alt="Aiko"
							className="h-20 w-16 shrink-0 object-contain object-bottom sm:h-24 sm:w-20"
						/>
						<div className="min-w-0 pb-1">
							<p className="text-xs font-semibold uppercase tracking-wide text-primary">
								Aiko
							</p>
							<p className="mt-1 text-sm leading-6 text-app-text">
								{cafe.dialogue.message}
							</p>
						</div>
					</div>
				)}
				{cafe.connectionState === "reconnecting" && (
					<div className="absolute inset-x-0 top-0 z-50 bg-amber-500 px-3 py-1.5 text-center text-xs font-semibold text-slate-950">
						{t("cafe.room.reconnecting")}
					</div>
				)}
				{cafe.error && (
					<div className="absolute left-1/2 top-20 z-50 -translate-x-1/2 rounded-lg border border-danger/30 bg-app-panel/95 px-4 py-2 text-sm text-danger shadow-lg">
						{cafe.error}
					</div>
				)}
				{cafe.room && (
					<button
						type="button"
						className="absolute right-3 top-20 z-30 rounded-lg border border-white/70 bg-slate-950/68 px-3 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur-sm"
						onClick={() => void copyInviteCode()}
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
							className="h-full rounded-full bg-primary transition-all"
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
	const connected = state === "connected";
	return (
		<span className={connected ? "text-emerald-500" : "text-amber-500"}>
			{connected ? (
				<Wifi size={15} aria-label="Connected" />
			) : (
				<WifiOff size={15} aria-label="Connecting" />
			)}
		</span>
	);
}

function isUuid(value: string) {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export default CafeRoomPage;
