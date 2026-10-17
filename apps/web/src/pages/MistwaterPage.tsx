import { useCallback, useState, type ReactNode } from "react";
import { Droplets, Flower2, MousePointer2, RotateCcw, Sparkles, Wind } from "lucide-react";
import AppHeaderBar from "@/components/header/AppHeaderBar";
import {
	AppHeaderDesktopControls,
	AppHeaderMobileControls,
	type AppHeaderControlProps
} from "@/components/header/AppHeaderControls";
import Button from "@/components/ui/Button";
import MistwaterGame from "@/features/mistwater/components/MistwaterGame";
import {
	initialMistwaterSnapshot,
	type MistwaterSnapshot
} from "@/features/mistwater/game/mistwaterState";
import { useI18n } from "@/i18n/i18nContext";
import AppLayout from "@/layouts/AppLayout";

type MistwaterPageProps = {
	activityBar: ReactNode;
	backgroundImageUrl: string;
	headerControls: AppHeaderControlProps;
};

function MistwaterPage({ activityBar, backgroundImageUrl, headerControls }: MistwaterPageProps) {
	const { t } = useI18n();
	const [snapshot, setSnapshot] = useState<MistwaterSnapshot>(initialMistwaterSnapshot);
	const [resetSignal, setResetSignal] = useState(0);
	const resetRun = useCallback(() => {
		setSnapshot(initialMistwaterSnapshot());
		setResetSignal((current) => current + 1);
	}, []);

	return (
		<AppLayout
			activityBar={activityBar}
			backgroundImageUrl={backgroundImageUrl}
			sidebar={<MistwaterSidebar snapshot={snapshot} onReset={resetRun} />}
			header={<MistwaterHeader controls={headerControls} />}
		>
			<section
				className="relative min-h-0 flex-1 select-none overflow-hidden bg-[#061d24] [-webkit-touch-callout:none]"
				data-testid="mistwater-stage"
			>
				<MistwaterGame
					ariaLabel={t("mistwater.game.ariaLabel")}
					onSnapshot={setSnapshot}
					resetSignal={resetSignal}
				/>
				<div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-3 lg:hidden">
					<div className="rounded-xl border border-emerald-100/20 bg-[#092b2c]/88 px-3 py-2 text-emerald-50 shadow-lg">
						<p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">
							{t("mistwater.stats.blooms")}
						</p>
						<p className="mt-0.5 text-xl font-semibold tabular-nums">
							{snapshot.blooms}
						</p>
					</div>
					<div className="rounded-xl border border-emerald-100/20 bg-[#092b2c]/88 px-3 py-2 text-right text-emerald-50 shadow-lg">
						<p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">
							{t("mistwater.stats.flow")}
						</p>
						<p className="mt-0.5 text-xl font-semibold tabular-nums">
							×{snapshot.streak}
						</p>
					</div>
				</div>
				<div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-3 sm:p-4">
					<p className="max-w-lg rounded-full border border-emerald-100/20 bg-[#092b2c]/88 px-4 py-2 text-center text-xs font-medium text-emerald-50 shadow-lg sm:text-sm">
						{t("mistwater.game.hint")}
					</p>
				</div>
			</section>
		</AppLayout>
	);
}

type MistwaterSidebarProps = {
	snapshot: MistwaterSnapshot;
	onReset: () => void;
};

function MistwaterSidebar({ snapshot, onReset }: MistwaterSidebarProps) {
	const { t } = useI18n();

	return (
		<aside
			className="hidden h-full w-[18.5rem] shrink-0 border-r border-app-border bg-app-panel/62 lg:flex lg:flex-col"
			data-testid="mistwater-sidebar"
		>
			<div className="flex h-16 items-center border-b border-app-border px-5">
				<div className="min-w-0">
					<p className="truncate text-base font-semibold text-app-text">
						{t("mistwater.sidebar.title")}
					</p>
					<p className="truncate text-xs text-muted">{t("mistwater.sidebar.subtitle")}</p>
				</div>
			</div>

			<div className="chat-scroll min-h-0 flex-1 overflow-y-auto p-4">
				<div className="grid grid-cols-2 gap-2">
					<MistwaterStat
						icon={Flower2}
						label={t("mistwater.stats.blooms")}
						value={String(snapshot.blooms)}
					/>
					<MistwaterStat
						icon={Wind}
						label={t("mistwater.stats.flow")}
						value={`×${snapshot.streak}`}
					/>
				</div>
				<div className="mt-2 rounded-xl border border-app-border bg-app-soft/70 p-3">
					<div className="flex items-center justify-between gap-3">
						<span className="text-xs text-muted">{t("mistwater.stats.bestFlow")}</span>
						<span className="text-sm font-semibold tabular-nums text-app-text">
							×{snapshot.bestStreak}
						</span>
					</div>
				</div>

				<div className="mt-5">
					<p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
						{t("mistwater.controls.title")}
					</p>
					<div className="mt-3 space-y-3 text-sm leading-6 text-app-text">
						<div className="flex gap-3">
							<span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-app-border bg-app-soft text-muted">
								<Wind size={16} aria-hidden="true" />
							</span>
							<p>{t("mistwater.controls.keyboard")}</p>
						</div>
						<div className="flex gap-3">
							<span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-app-border bg-app-soft text-muted">
								<MousePointer2 size={16} aria-hidden="true" />
							</span>
							<p>{t("mistwater.controls.pointer")}</p>
						</div>
						<div className="flex gap-3">
							<span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-app-border bg-app-soft text-muted">
								<Sparkles size={16} aria-hidden="true" />
							</span>
							<p>{t("mistwater.controls.blooms")}</p>
						</div>
					</div>
				</div>
			</div>

			<div className="border-t border-app-border p-4">
				<Button variant="secondary" fullWidth onClick={onReset}>
					<RotateCcw size={16} aria-hidden="true" />
					{t("mistwater.actions.reset")}
				</Button>
			</div>
		</aside>
	);
}

type MistwaterStatProps = {
	icon: typeof Flower2;
	label: string;
	value: string;
};

function MistwaterStat({ icon: Icon, label, value }: MistwaterStatProps) {
	return (
		<div className="rounded-xl border border-app-border bg-app-soft/70 p-3">
			<div className="flex items-center gap-2 text-muted">
				<Icon size={15} aria-hidden="true" />
				<span className="truncate text-xs">{label}</span>
			</div>
			<p className="mt-3 text-2xl font-semibold tabular-nums text-app-text">{value}</p>
		</div>
	);
}

function MistwaterHeader({ controls }: { controls: AppHeaderControlProps }) {
	const { t } = useI18n();

	return (
		<AppHeaderBar
			leading={
				<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#123e40] text-emerald-100 sm:size-11">
					<Droplets size={21} aria-hidden="true" />
				</span>
			}
			title={t("mistwater.header.title")}
			titleAccessory={
				<span className="hidden rounded-full border border-app-border bg-app-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted sm:inline-flex">
					{t("mistwater.header.mode")}
				</span>
			}
			desktopActions={<AppHeaderDesktopControls {...controls} />}
			mobileMenuContent={<AppHeaderMobileControls {...controls} />}
		/>
	);
}

export default MistwaterPage;
