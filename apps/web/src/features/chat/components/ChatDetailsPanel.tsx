import { FormEvent, useEffect, useRef, useState } from "react";
import { Ellipsis, Languages, Pencil, Sparkles, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import { useI18n } from "@/i18n";
import type { ChatPersona, MemoryFact, MemorySummary } from "@/types/chat";

type ChatDetailsPanelProps = {
	persona: ChatPersona;
	memoryFacts: MemoryFact[];
	memorySummaries: MemorySummary[];
	isSavingMemoryFact?: boolean;
	isSavingMemorySummary?: boolean;
	onSaveMemoryFact: (content: string) => Promise<boolean>;
	onSaveMemorySummary: (summary: string) => Promise<boolean>;
	onDeleteMemoryFact: (factId: string) => Promise<void>;
	onDeleteMemorySummary: (summaryId: string) => Promise<void>;
	onEditMemoryFact: (factId: string, content: string) => Promise<boolean>;
	onEditMemorySummary: (summaryId: string, summary: string) => Promise<boolean>;
};

const toneItems = ["Calm", "Warm", "Lightly playful", "Respectful"];

function ChatDetailsPanel({
	persona,
	memoryFacts,
	memorySummaries,
	isSavingMemoryFact = false,
	isSavingMemorySummary = false,
	onSaveMemoryFact,
	onSaveMemorySummary,
	onDeleteMemoryFact,
	onDeleteMemorySummary,
	onEditMemoryFact,
	onEditMemorySummary
}: ChatDetailsPanelProps) {
	const { locale, t } = useI18n();
	const [memoryDraft, setMemoryDraft] = useState("");
	const [summaryDraft, setSummaryDraft] = useState("");
	const [openFactMenuId, setOpenFactMenuId] = useState<string | null>(null);
	const [openSummaryMenuId, setOpenSummaryMenuId] = useState<string | null>(null);
	const [editingFactId, setEditingFactId] = useState<string | null>(null);
	const [editingSummaryId, setEditingSummaryId] = useState<string | null>(null);
	const [editingFactDraft, setEditingFactDraft] = useState("");
	const [editingSummaryDraft, setEditingSummaryDraft] = useState("");
	const actionMenuRootRef = useRef<HTMLDivElement>(null);
	const toneItemsByLocale =
		locale === "th" ? ["สุขุม", "อบอุ่น", "ขี้เล่นเล็กน้อย", "ให้เกียรติ"] : toneItems;

	useEffect(() => {
		if (!openFactMenuId && !openSummaryMenuId) {
			return;
		}

		function handlePointerDown(event: MouseEvent) {
			const menuRoot = actionMenuRootRef.current;
			if (!menuRoot) {
				return;
			}
			if (!menuRoot.contains(event.target as Node)) {
				setOpenFactMenuId(null);
				setOpenSummaryMenuId(null);
			}
		}

		window.addEventListener("mousedown", handlePointerDown);
		return () => window.removeEventListener("mousedown", handlePointerDown);
	}, [openFactMenuId, openSummaryMenuId]);

	async function handleSaveMemory(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const isSaved = await onSaveMemoryFact(memoryDraft);
		if (isSaved) {
			setMemoryDraft("");
		}
	}

	async function handleSaveSummary(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const isSaved = await onSaveMemorySummary(summaryDraft);
		if (isSaved) {
			setSummaryDraft("");
		}
	}

	async function handleSaveFactEdit(factId: string) {
		const ok = await onEditMemoryFact(factId, editingFactDraft);
		if (ok) {
			setEditingFactId(null);
			setEditingFactDraft("");
		}
	}

	async function handleSaveSummaryEdit(summaryId: string) {
		const ok = await onEditMemorySummary(summaryId, editingSummaryDraft);
		if (ok) {
			setEditingSummaryId(null);
			setEditingSummaryDraft("");
		}
	}

	return (
		<aside className="hidden min-h-0 border-l border-app-border bg-app-panel/62 xl:flex xl:flex-col">
			<div className="border-b border-app-border p-5">
				<div className="relative overflow-hidden rounded-lg bg-app-soft">
					<img
						className="aspect-[16/11] w-full object-cover"
						src={persona.avatarUrl}
						alt={`${persona.name} profile`}
					/>
				</div>
				<div className="mt-4">
					<h2 className="text-lg font-semibold">{persona.name}</h2>
					<p className="text-sm text-muted">{persona.title}</p>
				</div>
			</div>

			<div
				ref={actionMenuRootRef}
				className="chat-scroll flex-1 space-y-5 overflow-y-auto p-5"
			>
				<section>
					<h3 className="text-sm font-semibold">
						{t("chat.details.about", { name: persona.name })}
					</h3>
					<p className="mt-3 rounded-lg border border-app-border bg-app-soft p-4 text-sm leading-6 text-muted">
						{t("chat.details.aboutText", { name: persona.name })}
					</p>
				</section>

				<section>
					<h3 className="text-sm font-semibold">{t("chat.details.tone")}</h3>
					<div className="mt-3 flex flex-wrap gap-2">
						{toneItemsByLocale.map((tone) => (
							<span
								key={tone}
								className="rounded-lg border border-app-border bg-app-soft px-3 py-2 text-xs font-medium text-muted"
							>
								{tone}
							</span>
						))}
					</div>
				</section>

				<section>
					<h3 className="text-sm font-semibold">{t("chat.details.conversation")}</h3>
					<div className="mt-3 space-y-2">
						<div className="flex items-center gap-3 rounded-lg border border-app-border bg-app-soft p-3">
							<div className="flex size-9 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:bg-sky-300/15 dark:text-sky-200">
								<Languages size={18} aria-hidden="true" />
							</div>
							<div>
								<p className="text-sm font-medium">
									{t("chat.details.repliesInLanguage")}
								</p>
								<p className="text-xs text-muted">
									{t("chat.details.repliesInLanguageDesc", {
										name: persona.name
									})}
								</p>
							</div>
						</div>
						<div className="flex items-center gap-3 rounded-lg border border-app-border bg-app-soft p-3">
							<div className="flex size-9 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:bg-sky-300/15 dark:text-sky-200">
								<Sparkles size={18} aria-hidden="true" />
							</div>
							<div>
								<p className="text-sm font-medium">
									{t("chat.details.gentleMode")}
								</p>
								<p className="text-xs text-muted">
									{t("chat.details.gentleModeDesc")}
								</p>
							</div>
						</div>
					</div>
				</section>

				<section>
					<div className="flex items-center justify-between gap-2">
						<h3 className="text-sm font-semibold">{t("chat.details.memoryFacts")}</h3>
						<span className="text-xs text-muted">{memoryFacts.length}</span>
					</div>
					<form className="mt-3 flex gap-2" onSubmit={handleSaveMemory}>
						<input
							value={memoryDraft}
							onChange={(event) => setMemoryDraft(event.target.value)}
							placeholder={t("chat.details.memoryPlaceholder", {
								name: persona.name
							})}
							className="h-9 min-w-0 flex-1 rounded-lg border border-app-border bg-app-soft px-3 text-sm text-app-text outline-none focus:border-primary"
						/>
						<Button
							type="submit"
							disabled={!memoryDraft.trim() || isSavingMemoryFact}
							variant="primary"
							size="sm"
						>
							{t("chat.details.memorySave")}
						</Button>
					</form>
					<div className="mt-3 space-y-2">
						{memoryFacts.slice(0, 8).map((fact) => (
							<div
								key={fact.id}
								className="relative flex items-start gap-2 rounded-lg border border-app-border bg-app-soft p-3"
							>
								<div className="min-w-0 flex-1">
									{editingFactId === fact.id ? (
										<div className="space-y-2">
											<input
												value={editingFactDraft}
												onChange={(event) =>
													setEditingFactDraft(event.target.value)
												}
												className="h-8 w-full rounded-md border border-app-border bg-app-panel px-2 text-xs text-app-text outline-none focus:border-primary"
											/>
											<div className="flex gap-2">
												<Button
													onClick={() => void handleSaveFactEdit(fact.id)}
													variant="primary"
													size="xs"
												>
													{t("chat.details.memorySave")}
												</Button>
												<Button
													onClick={() => setEditingFactId(null)}
													variant="secondary"
													size="xs"
												>
													{t("common.cancel")}
												</Button>
											</div>
										</div>
									) : (
										<p className="text-xs leading-5 text-app-text">
											{fact.content}
										</p>
									)}
								</div>
								<IconButton
									size="xs"
									variant="ghost"
									onClick={() =>
										setOpenFactMenuId((current) =>
											current === fact.id ? null : fact.id
										)
									}
									aria-label={t("chat.details.memoryActions")}
								>
									<Ellipsis size={14} aria-hidden="true" />
								</IconButton>
								{openFactMenuId === fact.id && (
									<div className="absolute right-2 top-10 z-10 min-w-32 rounded-md border border-app-border bg-app-panel/82 p-1 shadow-soft">
										<Button
											onClick={() => {
												setOpenFactMenuId(null);
												setEditingFactId(fact.id);
												setEditingFactDraft(fact.content);
											}}
											variant="ghost"
											size="xs"
											align="start"
											fullWidth
										>
											<Pencil size={12} aria-hidden="true" />
											{t("chat.details.memoryEdit")}
										</Button>
										<Button
											onClick={async () => {
												setOpenFactMenuId(null);
												await onDeleteMemoryFact(fact.id);
											}}
											variant="ghostDestructive"
											size="xs"
											align="start"
											fullWidth
										>
											<Trash2 size={12} aria-hidden="true" />
											{t("chat.details.memoryDelete")}
										</Button>
									</div>
								)}
							</div>
						))}
						{memoryFacts.length === 0 && (
							<p className="rounded-lg border border-dashed border-app-border px-3 py-2 text-xs text-muted">
								{t("chat.details.memoryEmpty")}
							</p>
						)}
					</div>
				</section>

				<section>
					<div className="flex items-center justify-between gap-2">
						<h3 className="text-sm font-semibold">
							{t("chat.details.memorySummaries")}
						</h3>
						<span className="text-xs text-muted">{memorySummaries.length}</span>
					</div>
					<form className="mt-3 flex gap-2" onSubmit={handleSaveSummary}>
						<input
							value={summaryDraft}
							onChange={(event) => setSummaryDraft(event.target.value)}
							placeholder={t("chat.details.memorySummaryPlaceholder")}
							className="h-9 min-w-0 flex-1 rounded-lg border border-app-border bg-app-soft px-3 text-sm text-app-text outline-none focus:border-primary"
						/>
						<Button
							type="submit"
							disabled={!summaryDraft.trim() || isSavingMemorySummary}
							variant="primary"
							size="sm"
						>
							{t("chat.details.memorySave")}
						</Button>
					</form>
					<div className="mt-3 space-y-2">
						{memorySummaries.slice(0, 6).map((summary) => (
							<div
								key={summary.id}
								className="relative flex items-start gap-2 rounded-lg border border-app-border bg-app-soft p-3"
							>
								<div className="min-w-0 flex-1">
									{editingSummaryId === summary.id ? (
										<div className="space-y-2">
											<input
												value={editingSummaryDraft}
												onChange={(event) =>
													setEditingSummaryDraft(event.target.value)
												}
												className="h-8 w-full rounded-md border border-app-border bg-app-panel px-2 text-xs text-app-text outline-none focus:border-primary"
											/>
											<div className="flex gap-2">
												<Button
													onClick={() =>
														void handleSaveSummaryEdit(summary.id)
													}
													variant="primary"
													size="xs"
												>
													{t("chat.details.memorySave")}
												</Button>
												<Button
													onClick={() => setEditingSummaryId(null)}
													variant="secondary"
													size="xs"
												>
													{t("common.cancel")}
												</Button>
											</div>
										</div>
									) : (
										<p className="text-xs leading-5 text-app-text">
											{summary.summary}
										</p>
									)}
								</div>
								<IconButton
									size="xs"
									variant="ghost"
									onClick={() =>
										setOpenSummaryMenuId((current) =>
											current === summary.id ? null : summary.id
										)
									}
									aria-label={t("chat.details.memoryActions")}
								>
									<Ellipsis size={14} aria-hidden="true" />
								</IconButton>
								{openSummaryMenuId === summary.id && (
									<div className="absolute right-2 top-10 z-10 min-w-32 rounded-md border border-app-border bg-app-panel/82 p-1 shadow-soft">
										<Button
											onClick={() => {
												setOpenSummaryMenuId(null);
												setEditingSummaryId(summary.id);
												setEditingSummaryDraft(summary.summary);
											}}
											variant="ghost"
											size="xs"
											align="start"
											fullWidth
										>
											<Pencil size={12} aria-hidden="true" />
											{t("chat.details.memoryEdit")}
										</Button>
										<Button
											onClick={async () => {
												setOpenSummaryMenuId(null);
												await onDeleteMemorySummary(summary.id);
											}}
											variant="ghostDestructive"
											size="xs"
											align="start"
											fullWidth
										>
											<Trash2 size={12} aria-hidden="true" />
											{t("chat.details.memorySummaryDelete")}
										</Button>
									</div>
								)}
							</div>
						))}
						{memorySummaries.length === 0 && (
							<p className="rounded-lg border border-dashed border-app-border px-3 py-2 text-xs text-muted">
								{t("chat.details.memorySummaryEmpty")}
							</p>
						)}
					</div>
				</section>
			</div>
		</aside>
	);
}

export default ChatDetailsPanel;
