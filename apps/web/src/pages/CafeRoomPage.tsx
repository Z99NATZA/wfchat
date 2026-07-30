import { useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import {
	ArrowLeft,
	CircleHelp,
	Clock3,
	Coffee,
	Copy,
	Flame,
	Leaf,
	MessageCircle,
	SmilePlus,
	Star,
	Wifi,
	WifiOff
} from "lucide-react";
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
import CafeRoomChat from "@/features/cafe/components/CafeRoomChat";
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
	const [showChat, setShowChat] = useState(false);
	const [chatInputFocused, setChatInputFocused] = useState(false);
	const [unreadChatCount, setUnreadChatCount] = useState(0);
	const seenLatestChatIdRef = useRef<string | null>(null);
	const selfPlayer = cafe.room?.players.find((player) => player.id === cafe.selfPlayerId);
	const carriedTea = selfPlayer?.carriedTea ?? 0;
	const isTableService = cafe.room?.activity.id === "table_service";
	const isCafeRush = cafe.room?.activity.id === "cafe_rush";
	const carriedOrder = cafe.room?.activity.tableOrders.find(
		(order) => order.id === selfPlayer?.carriedOrderId
	);
	const carriedDrink = carriedOrder
		? t(`cafe.tableService.drink.${carriedOrder.drink}`)
		: t("cafe.tableService.drink.generic");
	const carriedTable = carriedOrder
		? t(`cafe.tableService.table.${carriedOrder.tableId}`)
		: t("cafe.tableService.table.generic");
	const inputEnabled = cafe.connectionState === "connected";
	const roundCountdown = useRoundCountdown(cafe.room?.activity.nextRoundAt ?? null);
	const rushCountdown = useRoundCountdown(cafe.room?.activity.endsAt ?? null);
	const comboCountdown = useRoundCountdown(cafe.room?.activity.comboExpiresAt ?? null);
	const rushCombo =
		cafe.room?.activity.comboExpiresAt && comboCountdown === 0
			? 0
			: (cafe.room?.activity.combo ?? 0);
	const isIntermission = cafe.room?.activity.phase === "intermission";

	useEffect(() => {
		const message = cafe.latestChatMessage;
		if (!message || seenLatestChatIdRef.current === message.id) {
			return;
		}
		seenLatestChatIdRef.current = message.id;
		if (message.playerId === cafe.selfPlayerId || showChat) return;
		setUnreadChatCount((current) => current + 1);
	}, [cafe.latestChatMessage, cafe.selfPlayerId, showChat]);

	function openChat() {
		setShowChat(true);
		setUnreadChatCount(0);
	}

	function closeChat() {
		setChatInputFocused(false);
		setShowChat(false);
	}

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
			<section
				className="relative min-h-0 flex-1 select-none overflow-hidden [-webkit-touch-callout:none]"
				data-testid="cafe-room-surface"
			>
				<CafeGameCanvas
					room={cafe.room}
					selfPlayerId={cafe.selfPlayerId}
					connectionEpoch={cafe.connectionEpoch}
					inputEnabled={inputEnabled && !chatInputFocused}
					emote={cafe.emote}
					chatMessage={cafe.latestChatMessage}
					onMovement={cafe.sendMovement}
					onInteract={cafe.interact}
					interactionLabels={{
						collectTea: t("cafe.room.collectTea"),
						deliverTea: t("cafe.room.deliverTea", { count: carriedTea }),
						talkToAiko: t("cafe.room.talkToAiko"),
						pickUpDrink: t("cafe.tableService.pickUp"),
						serveDrink: t("cafe.tableService.serve", { table: carriedTable }),
						findCounter: t("cafe.tableService.findCounter"),
						findTable: t("cafe.tableService.findTable", { table: carriedTable }),
						prepareOrder: t("cafe.rush.prepareOrder"),
						findIngredient: t("cafe.rush.findIngredient"),
						returnIngredient: t("cafe.rush.returnIngredient"),
						idle: t("cafe.room.moveCloser")
					}}
					loadingLabel={t("cafe.room.connecting")}
				/>
				{showChat && (
					<div
						id="cafe-room-chat-panel"
						className="absolute bottom-16 left-3 z-[65] h-[min(24rem,calc(100%-5rem))] w-[min(21rem,calc(100%-1.5rem))] max-sm:bottom-[calc(max(1rem,env(safe-area-inset-bottom))+13.5rem)] max-sm:right-3 max-sm:h-[min(22rem,calc(100%-15rem))] max-sm:w-auto"
						data-testid="cafe-chat-panel-position"
					>
						<CafeRoomChat
							events={cafe.chatEvents}
							selfPlayerId={cafe.selfPlayerId}
							connected={inputEnabled}
							error={cafe.chatError}
							onClose={closeChat}
							onInputFocusChange={setChatInputFocused}
							onSend={cafe.sendChat}
						/>
					</div>
				)}
				<button
					type="button"
					className={`cafe-chat-trigger absolute bottom-3 left-3 z-40 flex size-11 items-center justify-center rounded-full transition focus:outline-none max-sm:bottom-[calc(max(1rem,env(safe-area-inset-bottom))+9.5rem)] ${cafe.dialogue && !showChat ? "max-sm:hidden" : ""}`}
					onClick={showChat ? closeChat : openChat}
					aria-label={t(showChat ? "cafe.chat.close" : "cafe.chat.open")}
					aria-controls="cafe-room-chat-panel"
					aria-expanded={showChat}
					data-active={showChat}
					data-testid="cafe-chat-toggle"
				>
					<MessageCircle size={19} aria-hidden="true" />
					{unreadChatCount > 0 && (
						<span
							className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-5 text-white"
							data-testid="cafe-chat-unread"
						>
							{Math.min(unreadChatCount, 99)}
						</span>
					)}
				</button>
				{cafe.room && showGuide && (
					<CafeWelcomeGuide activityId={cafe.room.activity.id} onDismiss={dismissGuide} />
				)}
				<div className="pointer-events-none absolute left-3 right-3 top-3 z-30 flex items-start gap-2 sm:gap-3">
					<div
						className="cafe-world-overlay cafe-world-overlay-status min-w-0 max-w-96 flex-1 rounded-lg px-2 py-1.5 sm:rounded-xl sm:px-3 sm:py-2"
						data-testid="cafe-activity-hud"
					>
						<div className="flex items-center justify-between gap-1.5 sm:gap-3">
							<div className="flex min-w-0 items-center gap-1 sm:gap-2">
								<p className="cafe-world-muted truncate text-[10px] font-semibold uppercase leading-4 tracking-wide sm:text-[11px]">
									{t(activityTitleKey(cafe.room?.activity.id))}
								</p>
								{cafe.room && (
									<span
										className="cafe-world-panel shrink-0 rounded-full px-1.5 text-[9px] font-bold leading-4 sm:px-2 sm:py-0.5 sm:text-[10px] sm:leading-normal"
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
								className="cafe-world-control cafe-world-muted pointer-events-auto -mr-1 flex size-8 shrink-0 items-center justify-center rounded-full border transition focus:outline-none sm:-m-1 sm:size-auto sm:p-1"
								onClick={() => setShowGuide(true)}
								aria-label={t("cafe.guide.open")}
							>
								<CircleHelp className="size-[15px] sm:size-4" aria-hidden="true" />
							</button>
						</div>
						<p className="text-[13px] font-semibold leading-5 sm:mt-1 sm:text-sm">
							{isIntermission
								? t(
										isCafeRush
											? cafe.room?.activity.completed
												? "cafe.rush.complete"
												: "cafe.rush.timeUp"
											: isTableService
												? "cafe.tableService.complete"
												: "cafe.activity.complete"
									)
								: t(
										isCafeRush
											? "cafe.rush.progress"
											: isTableService
												? "cafe.tableService.progress"
												: "cafe.activity.progress",
										{
											current: cafe.room?.activity.delivered ?? 0,
											target: cafe.room?.activity.target ?? 3
										}
									)}
						</p>
						{isCafeRush && !isIntermission && (
							<div className="mt-1 flex flex-wrap gap-1 sm:mt-2 sm:gap-2">
								<span
									className="cafe-world-panel inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold sm:gap-1.5 sm:px-2 sm:py-1 sm:text-xs"
									data-testid="cafe-rush-timer"
								>
									<Clock3 className="size-3 sm:size-[13px]" aria-hidden="true" />
									{t("cafe.rush.timer", { seconds: rushCountdown })}
								</span>
								<span
									className="cafe-world-panel inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold sm:gap-1.5 sm:px-2 sm:py-1 sm:text-xs"
									data-testid="cafe-rush-combo"
								>
									<Flame className="size-3 sm:size-[13px]" aria-hidden="true" />
									{t("cafe.rush.combo", {
										combo: rushCombo
									})}
								</span>
							</div>
						)}
						{!isIntermission && carriedTea > 0 && (
							<p
								className="cafe-world-panel mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold sm:mt-2 sm:gap-1.5 sm:px-2 sm:py-1 sm:text-xs"
								data-testid="cafe-carried-tea"
							>
								<Leaf className="size-3 sm:size-[13px]" aria-hidden="true" />
								{t(
									isCafeRush
										? "cafe.rush.carryingIngredient"
										: "cafe.activity.carried",
									{ count: carriedTea }
								)}
							</p>
						)}
						{!isIntermission && carriedOrder && (
							<p
								className="cafe-world-panel mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold sm:mt-2 sm:gap-1.5 sm:px-2 sm:py-1 sm:text-xs"
								data-testid="cafe-carried-order"
							>
								<Coffee className="size-3 sm:size-[13px]" aria-hidden="true" />
								{t("cafe.tableService.carrying", {
									drink: carriedDrink,
									table: carriedTable
								})}
							</p>
						)}
						<p
							className={
								isIntermission
									? "cafe-world-divider cafe-world-muted mt-1 border-t pt-1 text-[10px] leading-4 sm:mt-2 sm:pt-2 sm:text-xs sm:leading-5"
									: "cafe-world-divider cafe-world-muted hidden border-t text-xs leading-5 sm:mt-2 sm:block sm:pt-2"
							}
							data-testid="cafe-quest-hint"
						>
							{isIntermission ? (
								roundCountdown > 0 ? (
									t("cafe.activity.nextRound", { seconds: roundCountdown })
								) : (
									t("cafe.activity.startingRound")
								)
							) : (
								<span data-testid="cafe-quest-hint-desktop">
									{t(
										cafeQuestHintKey(
											cafe.room,
											carriedTea,
											Boolean(carriedOrder)
										),
										{ table: carriedTable }
									)}
								</span>
							)}
						</p>
					</div>
					<div
						className="pointer-events-auto ml-auto flex shrink-0 flex-col items-end gap-2"
						data-testid="cafe-room-status"
					>
						<div
							className="cafe-world-overlay cafe-world-overlay-status rounded-xl px-3 py-2"
							data-testid="cafe-stars"
						>
							<p className="flex items-center gap-2 text-sm font-semibold">
								<Star size={16} className="text-amber-300" aria-hidden="true" />
								{cafe.cafeStars}
							</p>
						</div>
						{cafe.room && (
							<button
								type="button"
								className="cafe-world-button rounded-lg px-3 py-2 text-xs font-semibold transition focus:outline-none"
								onClick={() => void copyInviteCode()}
								data-testid="cafe-invite-code"
							>
								<span className="flex items-center gap-2">
									<Copy size={14} aria-hidden="true" />
									{copied ? t("cafe.room.copied") : cafe.room.inviteCode}
								</span>
							</button>
						)}
					</div>
				</div>
				<CafeEmoteControls
					disabled={!inputEnabled}
					hideMobile={showChat || Boolean(cafe.dialogue)}
					onEmote={cafe.sendEmote}
				/>
				{cafe.dialogue && (
					<div
						className="cafe-world-overlay cafe-world-overlay-strong absolute bottom-28 left-1/2 z-40 flex w-[min(92%,34rem)] -translate-x-1/2 items-center gap-3 rounded-2xl p-3 max-sm:bottom-44"
						data-testid="aiko-dialogue"
						role="status"
						aria-live="polite"
					>
						<div className="cafe-world-panel flex size-16 shrink-0 items-end justify-center overflow-hidden rounded-xl">
							<img
								src={`/images/aiko-pngtuber/aiko-${cafe.dialogue.expression}.png`}
								alt="Aiko"
								draggable={false}
								className="h-16 w-14 object-contain object-bottom"
							/>
						</div>
						<div className="min-w-0 py-1">
							<p className="text-xs font-bold uppercase tracking-[0.12em]">Aiko</p>
							<p className="mt-1 text-sm font-medium leading-5">
								{t(cafe.dialogue.messageKey)}
							</p>
						</div>
					</div>
				)}
				{cafe.connectionState === "reconnecting" && (
					<div className="absolute inset-x-0 top-0 z-50 border-b border-dialog-border bg-dialog-soft px-3 py-1.5 text-center text-xs font-semibold text-app-text">
						{t("cafe.room.reconnecting")}
					</div>
				)}
				{cafe.connectionState === "offline" && (
					<div
						className="absolute inset-x-0 top-0 z-50 border-b border-dialog-border bg-dialog-soft px-3 py-2 text-center text-xs font-semibold text-app-text"
						data-testid="cafe-offline-status"
						role="status"
					>
						{t("cafe.room.offlineMessage")}
					</div>
				)}
				{cafe.error && cafe.connectionState !== "closed" && (
					<div
						className="absolute left-1/2 top-20 z-50 -translate-x-1/2 rounded-lg border border-red-400/30 bg-dialog-soft px-4 py-2 text-sm text-red-500"
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
			</section>
		</AppLayout>
	);
}

const CAFE_EMOTES = [
	{ value: "wave", glyph: "👋" },
	{ value: "heart", glyph: "💗" },
	{ value: "happy", glyph: "✨" },
	{ value: "tea", glyph: "🍵" }
] as const;

function CafeEmoteControls({
	disabled,
	hideMobile,
	onEmote
}: {
	disabled: boolean;
	hideMobile: boolean;
	onEmote: (value: string) => void;
}) {
	const { t } = useI18n();
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

	useEffect(() => {
		if (disabled || hideMobile) {
			setMobileMenuOpen(false);
		}
	}, [disabled, hideMobile]);

	function sendEmote(value: string) {
		onEmote(value);
		setMobileMenuOpen(false);
	}

	return (
		<>
			<div
				className="cafe-world-overlay absolute bottom-3 left-1/2 z-30 hidden -translate-x-1/2 gap-1 rounded-full p-1.5 sm:flex"
				data-testid="cafe-emotes"
			>
				{CAFE_EMOTES.map(({ value, glyph }) => (
					<button
						key={value}
						type="button"
						className="cafe-world-control flex size-9 items-center justify-center rounded-full border text-lg transition focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
						aria-label={t(`cafe.emote.${value}`)}
						onClick={() => sendEmote(value)}
						disabled={disabled}
					>
						{glyph}
					</button>
				))}
			</div>
			<div
				className={`absolute bottom-[calc(max(1rem,env(safe-area-inset-bottom))+4rem)] right-4 z-40 flex flex-col items-end gap-1 sm:hidden ${hideMobile ? "max-sm:hidden" : ""}`}
				data-testid="cafe-mobile-emotes"
			>
				{mobileMenuOpen && (
					<div
						className="cafe-world-overlay flex w-12 flex-col items-center gap-1 rounded-2xl p-[3px]"
						data-testid="cafe-mobile-emote-menu"
					>
						{CAFE_EMOTES.map(({ value, glyph }) => (
							<button
								key={value}
								type="button"
								className="cafe-world-control flex size-10 items-center justify-center rounded-xl border text-lg transition focus:outline-none"
								aria-label={t(`cafe.emote.${value}`)}
								onClick={() => sendEmote(value)}
							>
								{glyph}
							</button>
						))}
					</div>
				)}
				<button
					type="button"
					className="cafe-world-overlay cafe-world-toggle flex size-12 items-center justify-center rounded-full transition focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
					aria-label={t(mobileMenuOpen ? "cafe.emote.close" : "cafe.emote.open")}
					aria-expanded={mobileMenuOpen}
					data-active={mobileMenuOpen}
					onClick={() => setMobileMenuOpen((current) => !current)}
					disabled={disabled}
					data-testid="cafe-mobile-emote-toggle"
				>
					<SmilePlus size={19} aria-hidden="true" />
				</button>
			</div>
		</>
	);
}

function CafeWelcomeGuide({
	activityId,
	onDismiss
}: {
	activityId: CafeRoomState["activity"]["id"];
	onDismiss: () => void;
}) {
	const { t } = useI18n();
	const tableService = activityId === "table_service";
	const cafeRush = activityId === "cafe_rush";
	const guidePrefix = cafeRush ? "cafe.rush" : tableService ? "cafe.tableService" : "cafe.guide";
	return (
		<div className="absolute inset-0 z-[70] flex items-center justify-center bg-app-bg/72 p-4 backdrop-blur-[3px]">
			<div
				className="w-full max-w-md rounded-3xl border border-dialog-border bg-dialog-panel p-5 text-center text-app-text sm:p-6"
				role="dialog"
				aria-modal="true"
				aria-labelledby="cafe-guide-title"
			>
				<div className="mx-auto flex size-12 items-center justify-center rounded-full border border-dialog-border bg-dialog-soft text-2xl">
					{cafeRush ? "⏱️" : tableService ? "☕" : "🍃"}
				</div>
				<h2 id="cafe-guide-title" className="mt-3 text-xl font-bold">
					{t(`${guidePrefix}.${cafeRush || tableService ? "guideTitle" : "title"}`)}
				</h2>
				<p className="mt-2 text-sm leading-6 text-muted">
					{t(
						`${guidePrefix}.${cafeRush || tableService ? "guideDescription" : "description"}`
					)}
				</p>
				<div className="mt-4 rounded-2xl border border-dialog-border bg-dialog-soft px-4 py-3 text-sm font-semibold leading-6 text-app-text">
					<span className="hidden sm:inline">
						{t(
							`${guidePrefix}.${cafeRush || tableService ? "guideDesktopControls" : "desktopControls"}`
						)}
					</span>
					<span className="sm:hidden">
						{t(
							`${guidePrefix}.${cafeRush || tableService ? "guideMobileControls" : "mobileControls"}`
						)}
					</span>
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
		<aside
			className="hidden h-full w-[18.5rem] shrink-0 border-r border-app-border bg-app-panel/62 lg:flex lg:flex-col"
			data-testid="cafe-room-sidebar"
		>
			<div className="flex h-16 items-center border-b border-app-border px-5">
				<div>
					<p className="font-semibold text-app-text">{t("cafe.room.members")}</p>
					<p className="text-xs text-muted">
						{room?.players.length ?? 0}/{room?.capacity ?? 8}
					</p>
				</div>
			</div>
			<div className="chat-scroll flex-1 overflow-y-auto">
				<CafeRoomActivityDetails room={room} compact />
				<div className="space-y-2 p-3">
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
							{player.carriedOrderId && (
								<span
									className="text-xs text-muted"
									aria-label={t("cafe.tableService.memberCarrying")}
								>
									☕
								</span>
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
			</div>
		</aside>
	);
}

function CafeRoomActivityDetails({
	room,
	compact = false
}: {
	room: CafeRoomState | null;
	compact?: boolean;
}) {
	const { t } = useI18n();
	return (
		<section data-testid="cafe-room-activity-details">
			<div className={`border-b border-app-border ${compact ? "p-3" : "p-4"}`}>
				<p className="font-semibold text-app-text">
					{t(activityTitleKey(room?.activity.id))}
				</p>
				{room && (
					<p className="mt-1 text-xs text-muted">
						{t("cafe.activity.round", { round: room.activity.roundNumber })}
					</p>
				)}
			</div>
			<div className={`space-y-4 ${compact ? "p-3" : "p-4"}`}>
				<div className="rounded-xl border border-app-border bg-app-soft p-4">
					<div className="flex items-center justify-between text-sm">
						<span className="text-muted">
							{t(
								room?.activity.id === "table_service" ||
									room?.activity.id === "cafe_rush"
									? "cafe.tableService.ordersServed"
									: "cafe.activity.teaLeaves"
							)}
						</span>
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
		</section>
	);
}

export function CafeRoomDetails({ room }: { room: CafeRoomState | null }) {
	return (
		<aside
			className="hidden min-h-0 w-14 shrink-0 border-l border-app-border bg-app-panel/62 xl:flex xl:flex-col"
			data-testid="cafe-room-details"
			data-room-id={room?.id}
		/>
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
				className="w-full max-w-md rounded-2xl border border-dialog-border bg-dialog-soft p-5 text-center sm:p-6"
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

function activityTitleKey(activityId: CafeRoomState["activity"]["id"] | undefined) {
	switch (activityId) {
		case "table_service":
			return "cafe.tableService.title";
		case "cafe_rush":
			return "cafe.rush.title";
		default:
			return "cafe.activity.title";
	}
}

function cafeQuestHintKey(
	room: CafeRoomState | null,
	carriedTea: number,
	hasCarriedOrder: boolean
) {
	if (room?.activity.id === "table_service") {
		return hasCarriedOrder
			? "cafe.tableService.deliverHintDesktop"
			: "cafe.tableService.pickupHintDesktop";
	}
	if (room?.activity.id === "cafe_rush") {
		if (hasCarriedOrder) return "cafe.rush.deliverHintDesktop";
		if (carriedTea > 0) return "cafe.rush.prepareHintDesktop";
		if (room.activity.tableOrders.some((order) => order.status === "available")) {
			return "cafe.rush.pickupHintDesktop";
		}
		return "cafe.rush.findHintDesktop";
	}
	return carriedTea > 0 ? "cafe.activity.returnHintDesktop" : "cafe.activity.findHintDesktop";
}

function cosmeticGlyph(cosmeticId: string) {
	return (
		{
			sakura_pin: "✿",
			mint_scarf: "〰",
			tea_hat: "🍵",
			cafe_apron: "🎀"
		}[cosmeticId] ?? "✦"
	);
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
