import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Coffee, DoorOpen, Plus, RefreshCw, Star, Users } from "lucide-react";
import AppHeaderBar from "@/components/header/AppHeaderBar";
import {
	AppHeaderDesktopControls,
	AppHeaderMobileControls,
	type AppHeaderControlProps
} from "@/components/header/AppHeaderControls";
import Button from "@/components/ui/Button";
import AppLayout from "@/layouts/AppLayout";
import { useI18n } from "@/i18n/i18nContext";
import {
	cafeLobbyErrorCode,
	createCafeRoom,
	equipCafeCosmetic,
	getCafeProgress,
	joinCafeByCode,
	listCafeRooms,
	quickJoinCafe
} from "@/features/cafe/services/cafeApiService";
import type { CafeLobbyErrorCode } from "@/features/cafe/services/cafeApiService";
import {
	CAFE_PLAYER_NAME_MAX_LENGTH,
	readCafePlayerName,
	saveCafePlayerName
} from "@/features/cafe/services/cafePlayerName";
import type { CafeCosmetic, CafeProgress, CafeRoomSummary } from "@/features/cafe/types";

type CafePageProps = {
	activityBar: ReactNode;
	backgroundImageUrl: string;
	headerControls: AppHeaderControlProps;
};

function CafePage({ activityBar, backgroundImageUrl, headerControls }: CafePageProps) {
	const { t } = useI18n();
	const navigate = useNavigate();
	const [rooms, setRooms] = useState<CafeRoomSummary[]>([]);
	const [progress, setProgress] = useState<CafeProgress>({
		cafeStars: 0,
		unlockedCosmetics: [],
		equippedCosmetic: null,
		cosmetics: []
	});
	const [inviteCode, setInviteCode] = useState("");
	const [playerName, setPlayerName] = useState(readCafePlayerName);
	const [isLoading, setIsLoading] = useState(true);
	const [pendingAction, setPendingAction] = useState<string | null>(null);
	const [error, setError] = useState<CafeLobbyErrorCode | "load_failed" | null>(null);
	const [pendingCosmetic, setPendingCosmetic] = useState<string | null | undefined>();
	const [cosmeticError, setCosmeticError] = useState(false);

	const refresh = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const [nextRooms, nextProgress] = await Promise.all([
				listCafeRooms(),
				getCafeProgress()
			]);
			setRooms(nextRooms);
			setProgress(nextProgress);
		} catch {
			setError("load_failed");
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	async function openRoom(action: string, request: () => Promise<CafeRoomSummary>) {
		setPendingAction(action);
		setError(null);
		try {
			const room = await request();
			navigate(`/cafe/rooms/${room.id}`);
		} catch (requestError) {
			setError(cafeLobbyErrorCode(requestError));
		} finally {
			setPendingAction(null);
		}
	}

	function handleJoinCode(event: FormEvent) {
		event.preventDefault();
		const code = inviteCode.trim();
		if (code) {
			void openRoom("code", () => joinCafeByCode(code));
		}
	}

	function handlePlayerNameChange(value: string) {
		setPlayerName(value);
		saveCafePlayerName(value);
	}

	async function handleEquipCosmetic(cosmeticId: string | null) {
		setPendingCosmetic(cosmeticId);
		setCosmeticError(false);
		try {
			setProgress(await equipCafeCosmetic(cosmeticId));
		} catch {
			setCosmeticError(true);
		} finally {
			setPendingCosmetic(undefined);
		}
	}

	return (
		<AppLayout
			activityBar={activityBar}
			backgroundImageUrl={backgroundImageUrl}
			sidebar={<CafeLobbySidebar progress={progress} />}
			header={<CafeHeader controls={headerControls} />}
			details={<CafeLobbyDetails />}
		>
			<section
				className="chat-scroll min-h-0 flex-1 overflow-y-auto bg-app-bg/44 p-4 sm:p-6 lg:p-8"
				data-testid="cafe-lobby-scroll"
			>
				<div className="mx-auto max-w-5xl space-y-5">
					<div
						className="overflow-hidden rounded-2xl border border-app-border bg-app-panel/76 shadow-soft"
						data-testid="cafe-entry-panel"
					>
						<div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1.25fr_0.75fr] lg:items-center">
							<div>
								<h2 className="text-2xl font-semibold text-app-text sm:text-3xl">
									{t("cafe.lobby.heroTitle")}
								</h2>
								<p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
									{t("cafe.lobby.heroDescription")}
								</p>
								<div className="mt-6 flex max-w-xl flex-wrap items-end gap-3">
									<div className="min-w-[14rem] flex-1">
										<label
											className="text-xs font-semibold text-muted"
											htmlFor="cafe-player-name"
										>
											{t("cafe.lobby.playerName")}
										</label>
										<input
											id="cafe-player-name"
											type="text"
											autoComplete="nickname"
											className="mt-2 h-11 w-full rounded-lg border border-app-border bg-app-soft px-3 text-sm font-semibold text-app-text outline-none transition placeholder:font-normal placeholder:text-muted/70 focus:border-primary focus:ring-2 focus:ring-primary/25 dark:focus:border-action-border dark:focus:ring-action-ring/25"
											value={playerName}
											maxLength={CAFE_PLAYER_NAME_MAX_LENGTH}
											placeholder={t("cafe.lobby.playerNamePlaceholder")}
											onChange={(event) =>
												handlePlayerNameChange(event.target.value)
											}
										/>
									</div>
									<Button
										variant="primary"
										size="lg"
										disabled={pendingAction !== null}
										onClick={() => void openRoom("quick", quickJoinCafe)}
									>
										<DoorOpen size={18} aria-hidden="true" />
										{pendingAction === "quick"
											? t("cafe.lobby.joining")
											: t("cafe.lobby.quickJoin")}
									</Button>
									<Button
										size="lg"
										disabled={pendingAction !== null}
										onClick={() =>
											void openRoom("create", () => createCafeRoom(true))
										}
									>
										<Plus size={18} aria-hidden="true" />
										{t("cafe.lobby.createRoom")}
									</Button>
								</div>
								<form onSubmit={handleJoinCode} className="mt-5 max-w-xl">
									<label
										className="text-xs font-semibold text-muted"
										htmlFor="cafe-invite-code"
									>
										{t("cafe.lobby.joinCodeTitle")}
									</label>
									<div className="mt-2 flex flex-col gap-2 sm:flex-row">
										<input
											id="cafe-invite-code"
											className="h-11 min-w-0 flex-1 rounded-lg border border-app-border bg-app-soft px-3 text-sm font-semibold uppercase tracking-[0.2em] text-app-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25 dark:focus:border-action-border dark:focus:ring-action-ring/25"
											value={inviteCode}
											maxLength={6}
											placeholder={t("cafe.lobby.joinCodePlaceholder")}
											onChange={(event) =>
												setInviteCode(event.target.value.toUpperCase())
											}
										/>
										<Button
											type="submit"
											disabled={!inviteCode.trim() || pendingAction !== null}
										>
											{pendingAction === "code"
												? t("cafe.lobby.joining")
												: t("cafe.lobby.joinCode")}
										</Button>
									</div>
								</form>
								{error && (
									<p
										className="mt-4 rounded-lg border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-500"
										role="alert"
									>
										{t(lobbyErrorTranslationKey(error))}
									</p>
								)}
							</div>
							<img
								src="/images/aiko-cafe/aiko-host-v1.png"
								alt={t("cafe.lobby.aikoAlt")}
								className="mx-auto h-52 w-auto object-contain drop-shadow-xl sm:h-56"
							/>
						</div>
					</div>

					<CafeCosmeticWardrobe
						progress={progress}
						isLoading={isLoading}
						pendingCosmetic={pendingCosmetic}
						hasError={cosmeticError}
						onEquip={handleEquipCosmetic}
					/>

					<div>
						<div className="flex items-center justify-between gap-3">
							<h3 className="text-lg font-semibold text-app-text">
								{t("cafe.lobby.publicRooms")}
							</h3>
							<Button
								size="sm"
								variant="ghost"
								disabled={isLoading}
								onClick={() => void refresh()}
							>
								<RefreshCw size={15} aria-hidden="true" />
								{t("cafe.lobby.refresh")}
							</Button>
						</div>
						<div className="mt-4 grid gap-3 sm:grid-cols-2">
							{rooms.map((room) => (
								<Button
									key={room.id}
									align="start"
									fullWidth
									size="row"
									className="rounded-xl"
									disabled={pendingAction !== null}
									onClick={() => navigate(`/cafe/rooms/${room.id}`)}
								>
									<div className="w-full">
										<div className="flex items-center justify-between gap-3">
											<span className="flex items-center gap-2 font-semibold text-app-text">
												<Coffee
													size={17}
													className="text-muted"
													aria-hidden="true"
												/>
												{t("cafe.lobby.publicCafe")}
											</span>
											<span className="flex items-center gap-1 text-xs text-muted">
												<Users size={14} aria-hidden="true" />
												{room.playerCount}/{room.capacity}
											</span>
										</div>
										<p className="mt-3 font-mono text-xs tracking-widest text-muted">
											{room.inviteCode}
										</p>
									</div>
								</Button>
							))}
						</div>
						{!isLoading && rooms.length === 0 && (
							<div className="mt-4 rounded-xl border border-dashed border-app-border bg-app-soft/70 p-6 text-center text-sm text-muted">
								{t("cafe.lobby.noRooms")}
							</div>
						)}
					</div>
				</div>
			</section>
		</AppLayout>
	);
}

function CafeCosmeticWardrobe({
	progress,
	isLoading,
	pendingCosmetic,
	hasError,
	onEquip
}: {
	progress: CafeProgress;
	isLoading: boolean;
	pendingCosmetic: string | null | undefined;
	hasError: boolean;
	onEquip: (cosmeticId: string | null) => void;
}) {
	const { t } = useI18n();
	const isSaving = pendingCosmetic !== undefined;
	return (
		<section
			className="rounded-2xl border border-app-border bg-app-panel/76 p-4 shadow-soft sm:p-5"
			aria-labelledby="cafe-cosmetics-title"
			data-testid="cafe-cosmetic-wardrobe"
		>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-3">
					<p id="cafe-cosmetics-title" className="text-lg font-semibold text-app-text">
						{t("cafe.cosmetics.title")}
					</p>
					<span
						className="inline-flex items-center gap-1 rounded-full bg-app-soft px-2.5 py-1 text-xs font-semibold text-muted"
						aria-label={`${t("cafe.stars")}: ${progress.cafeStars}`}
					>
						<Star size={13} aria-hidden="true" />
						{progress.cafeStars}
					</span>
				</div>
				<Button
					size="sm"
					variant="ghost"
					disabled={isSaving || progress.equippedCosmetic === null}
					onClick={() => onEquip(null)}
				>
					{pendingCosmetic === null
						? t("cafe.cosmetics.saving")
						: t("cafe.cosmetics.classic")}
				</Button>
			</div>
			{hasError && (
				<p
					className="mt-3 rounded-lg border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-500"
					role="alert"
				>
					{t("cafe.cosmetics.equipError")}
				</p>
			)}
			<div className="mt-4 grid gap-3 sm:grid-cols-3">
				{progress.cosmetics.map((cosmetic) => (
					<CafeCosmeticCard
						key={cosmetic.id}
						cosmetic={cosmetic}
						equipped={progress.equippedCosmetic === cosmetic.id}
						isSaving={isSaving}
						pending={pendingCosmetic === cosmetic.id}
						onEquip={() => onEquip(cosmetic.id)}
					/>
				))}
			</div>
			{isLoading && progress.cosmetics.length === 0 && (
				<p
					className="mt-4 rounded-xl border border-app-border bg-app-soft/70 p-5 text-center text-sm text-muted"
					role="status"
				>
					{t("cafe.cosmetics.loading")}
				</p>
			)}
			{!isLoading && progress.cosmetics.length === 0 && (
				<p className="mt-4 rounded-xl border border-dashed border-app-border bg-app-soft/70 p-5 text-center text-sm text-muted">
					{t("cafe.cosmetics.empty")}
				</p>
			)}
		</section>
	);
}

function CafeCosmeticCard({
	cosmetic,
	equipped,
	isSaving,
	pending,
	onEquip
}: {
	cosmetic: CafeCosmetic;
	equipped: boolean;
	isSaving: boolean;
	pending: boolean;
	onEquip: () => void;
}) {
	const { t } = useI18n();
	return (
		<article
			className={`rounded-xl border p-3 ${
				equipped
					? "border-primary/30 bg-primary/10 dark:border-action-border dark:bg-action-hover"
					: "border-transparent bg-app-soft/70"
			}`}
		>
			<div className="relative">
				<CosmeticPreview cosmeticId={cosmetic.id} />
				{!cosmetic.unlocked && (
					<span
						className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-app-border bg-app-panel/92 px-2 py-1 text-xs font-semibold text-app-text shadow-soft"
						aria-label={t("cafe.cosmetics.needStars", {
							count: cosmetic.requiredStars
						})}
					>
						<Star size={12} aria-hidden="true" />
						{cosmetic.requiredStars}
					</span>
				)}
			</div>
			<p className="mt-3 font-semibold text-app-text">
				{t(`cafe.cosmetics.${cosmetic.id}.name`)}
			</p>
			<Button
				className="mt-2"
				fullWidth
				size="sm"
				variant={equipped ? "selected" : "secondary"}
				disabled={!cosmetic.unlocked || equipped || isSaving}
				onClick={onEquip}
			>
				{pending
					? t("cafe.cosmetics.saving")
					: equipped
						? t("cafe.cosmetics.equipped")
						: cosmetic.unlocked
							? t("cafe.cosmetics.equip")
							: t("cafe.cosmetics.locked")}
			</Button>
		</article>
	);
}

function CosmeticPreview({ cosmeticId }: { cosmeticId: string }) {
	const glyph = { sakura_pin: "✿", mint_scarf: "〰", tea_hat: "🍵" }[cosmeticId] ?? "✦";
	const background = {
		sakura_pin: "#f7a6b8",
		mint_scarf: "#79c9a4",
		tea_hat: "#88b978"
	}[cosmeticId];
	return (
		<div
			className="flex h-20 items-center justify-center rounded-lg text-3xl text-[#533b35] shadow-inner"
			style={{ backgroundColor: background ?? "#ead6bc" }}
			data-testid={`cafe-cosmetic-preview-${cosmeticId}`}
			aria-hidden="true"
		>
			{glyph}
		</div>
	);
}

function CafeHeader({ controls }: { controls: AppHeaderControlProps }) {
	const { t } = useI18n();
	return (
		<AppHeaderBar
			leading={
				<span className="flex size-9 items-center justify-center rounded-lg border border-app-border bg-app-soft text-app-text sm:size-11">
					<Coffee size={21} aria-hidden="true" />
				</span>
			}
			title={t("cafe.header.title")}
			desktopActions={<AppHeaderDesktopControls {...controls} />}
			mobileMenuContent={<AppHeaderMobileControls {...controls} />}
		/>
	);
}

function CafeLobbySidebar({ progress }: { progress: CafeProgress }) {
	const { t } = useI18n();
	return (
		<aside className="hidden h-full w-[18.5rem] shrink-0 border-r border-app-border bg-app-panel/62 lg:flex lg:flex-col">
			<div className="flex h-16 items-center border-b border-app-border px-5">
				<div>
					<p className="font-semibold text-app-text">{t("cafe.sidebar.title")}</p>
					<p className="text-xs text-muted">{t("cafe.sidebar.subtitle")}</p>
				</div>
			</div>
			<div className="space-y-3 p-4">
				<div className="rounded-xl border border-app-border bg-app-soft p-4">
					<div className="flex items-center gap-2 text-sm font-semibold text-app-text">
						<Star size={17} className="text-muted" aria-hidden="true" />
						{t("cafe.stars")}
					</div>
					<p className="mt-2 text-3xl font-semibold text-app-text">
						{progress.cafeStars}
					</p>
				</div>
				<div className="rounded-xl border border-app-border bg-app-soft p-4 text-sm leading-6 text-muted">
					{t("cafe.sidebar.guestNote")}
				</div>
			</div>
		</aside>
	);
}

function CafeLobbyDetails() {
	const { t } = useI18n();
	return (
		<aside className="hidden min-h-0 border-l border-app-border bg-app-panel/62 xl:flex xl:flex-col">
			<div className="border-b border-app-border p-4">
				<p className="font-semibold text-app-text">{t("cafe.details.today")}</p>
			</div>
			<div className="space-y-3 p-4">
				<div className="rounded-xl border border-app-border bg-app-soft p-4">
					<p className="font-semibold text-app-text">{t("cafe.activity.title")}</p>
					<p className="mt-2 text-sm leading-6 text-muted">
						{t("cafe.activity.description")}
					</p>
				</div>
			</div>
		</aside>
	);
}

function lobbyErrorTranslationKey(error: CafeLobbyErrorCode | "load_failed"): string {
	switch (error) {
		case "room_not_found":
			return "cafe.lobby.roomNotFound";
		case "room_full":
			return "cafe.lobby.roomFull";
		case "load_failed":
			return "cafe.lobby.loadError";
		default:
			return "cafe.lobby.actionError";
	}
}

export default CafePage;
