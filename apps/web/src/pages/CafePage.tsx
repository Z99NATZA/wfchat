import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Coffee, DoorOpen, KeyRound, Plus, RefreshCw, Sparkles, Star, Users } from "lucide-react";
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
	getCafeProgress,
	joinCafeByCode,
	listCafeRooms,
	quickJoinCafe
} from "@/features/cafe/services/cafeApiService";
import type { CafeLobbyErrorCode } from "@/features/cafe/services/cafeApiService";
import type { CafeProgress, CafeRoomSummary } from "@/features/cafe/types";

type CafePageProps = {
	activityBar: ReactNode;
	backgroundImageUrl: string;
	headerControls: AppHeaderControlProps;
};

function CafePage({ activityBar, backgroundImageUrl, headerControls }: CafePageProps) {
	const { t } = useI18n();
	const navigate = useNavigate();
	const [rooms, setRooms] = useState<CafeRoomSummary[]>([]);
	const [progress, setProgress] = useState<CafeProgress>({ cafeStars: 0, unlockedCosmetics: [] });
	const [inviteCode, setInviteCode] = useState("");
	const [isLoading, setIsLoading] = useState(true);
	const [pendingAction, setPendingAction] = useState<string | null>(null);
	const [error, setError] = useState<CafeLobbyErrorCode | "load_failed" | null>(null);

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

	return (
		<AppLayout
			activityBar={activityBar}
			backgroundImageUrl={backgroundImageUrl}
			sidebar={<CafeLobbySidebar progress={progress} />}
			header={<CafeHeader controls={headerControls} />}
			details={<CafeLobbyDetails />}
		>
			<section className="min-h-0 flex-1 overflow-y-auto bg-app-bg/44 p-4 sm:p-6 lg:p-8">
				<div className="mx-auto max-w-5xl space-y-6">
					<div className="overflow-hidden rounded-2xl border border-app-border bg-app-panel/76 shadow-soft">
						<div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1.25fr_0.75fr] lg:items-center">
							<div>
								<span className="inline-flex items-center gap-2 rounded-full border border-app-border bg-app-soft px-3 py-1 text-xs font-semibold text-app-text">
									<Sparkles size={14} aria-hidden="true" />
									{t("cafe.lobby.guestFriendly")}
								</span>
								<h2 className="mt-4 text-2xl font-semibold text-app-text sm:text-3xl">
									{t("cafe.lobby.heroTitle")}
								</h2>
								<p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
									{t("cafe.lobby.heroDescription")}
								</p>
								<div className="mt-6 flex flex-wrap gap-3">
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
							</div>
							<img
								src="/images/aiko-cafe/aiko-host-v1.png"
								alt={t("cafe.lobby.aikoAlt")}
								className="mx-auto h-56 w-auto object-contain drop-shadow-xl sm:h-64"
							/>
						</div>
					</div>

					<form
						onSubmit={handleJoinCode}
						className="rounded-2xl border border-app-border bg-app-panel/76 p-4 shadow-soft sm:p-5"
					>
						<label
							className="text-sm font-semibold text-app-text"
							htmlFor="cafe-invite-code"
						>
							{t("cafe.lobby.joinCodeTitle")}
						</label>
						<div className="mt-3 flex flex-col gap-2 sm:flex-row">
							<div className="relative min-w-0 flex-1">
								<KeyRound
									className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
									size={17}
									aria-hidden="true"
								/>
								<input
									id="cafe-invite-code"
									className="h-11 w-full rounded-lg border border-app-border bg-app-soft pl-10 pr-3 text-sm font-semibold uppercase tracking-[0.2em] text-app-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25 dark:focus:border-action-border dark:focus:ring-action-ring/25"
									value={inviteCode}
									maxLength={6}
									placeholder={t("cafe.lobby.joinCodePlaceholder")}
									onChange={(event) =>
										setInviteCode(event.target.value.toUpperCase())
									}
								/>
							</div>
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

					<div>
						<div className="flex items-center justify-between gap-3">
							<div>
								<h3 className="text-lg font-semibold text-app-text">
									{t("cafe.lobby.publicRooms")}
								</h3>
								<p className="mt-1 text-xs text-muted">
									{t("cafe.lobby.publicRoomsDescription")}
								</p>
							</div>
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
						{error && (
							<p
								className="mt-4 rounded-lg border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-500"
								role="alert"
							>
								{t(lobbyErrorTranslationKey(error))}
							</p>
						)}
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
			subtitle={t("cafe.header.subtitle")}
			titleAccessory={
				<Sparkles
					size={15}
					className="text-primary dark:text-app-text"
					data-testid="cafe-header-sparkles"
					aria-hidden="true"
				/>
			}
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
				<div className="rounded-xl border border-app-border bg-app-soft p-4">
					<p className="flex items-center gap-2 font-semibold text-app-text">
						<Users size={16} aria-hidden="true" />
						{t("cafe.details.capacity")}
					</p>
					<p className="mt-2 text-sm text-muted">{t("cafe.details.capacityValue")}</p>
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
