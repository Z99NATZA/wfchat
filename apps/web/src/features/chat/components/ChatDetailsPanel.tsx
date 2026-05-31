import { FormEvent, useState } from "react";
import { Languages, Sparkles, Trash2 } from "lucide-react";
import { useI18n } from "@/i18n";
import type { ChatPersona, MemoryFact } from "@/types/chat";

type ChatDetailsPanelProps = {
	persona: ChatPersona;
	memoryFacts: MemoryFact[];
	isSavingMemoryFact?: boolean;
	onSaveMemoryFact: (content: string) => Promise<boolean>;
	onDeleteMemoryFact: (factId: string) => Promise<void>;
};

const toneItems = ["Calm", "Warm", "Lightly playful", "Respectful"];

function ChatDetailsPanel({
	persona,
	memoryFacts,
	isSavingMemoryFact = false,
	onSaveMemoryFact,
	onDeleteMemoryFact
}: ChatDetailsPanelProps) {
	const { locale, t } = useI18n();
	const [memoryDraft, setMemoryDraft] = useState("");
	const toneItemsByLocale = locale === "th" ? ["สุขุม", "อบอุ่น", "ขี้เล่นเล็กน้อย", "ให้เกียรติ"] : toneItems;

	async function handleSaveMemory(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const isSaved = await onSaveMemoryFact(memoryDraft);
		if (isSaved) {
			setMemoryDraft("");
		}
	}

	return (
		<aside className="hidden min-h-0 border-l border-app-border bg-app-panel xl:flex xl:flex-col">
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

			<div className="chat-scroll flex-1 space-y-5 overflow-y-auto p-5">
				<section>
					<h3 className="text-sm font-semibold">{t("chat.details.about")}</h3>
					<p className="mt-3 rounded-lg border border-app-border bg-app-soft p-4 text-sm leading-6 text-muted">
						{t("chat.details.aboutText")}
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
							<div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
								<Languages size={18} aria-hidden="true" />
							</div>
							<div>
								<p className="text-sm font-medium">{t("chat.details.repliesInLanguage")}</p>
								<p className="text-xs text-muted">{t("chat.details.repliesInLanguageDesc")}</p>
							</div>
						</div>
						<div className="flex items-center gap-3 rounded-lg border border-app-border bg-app-soft p-3">
							<div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
								<Sparkles size={18} aria-hidden="true" />
							</div>
							<div>
								<p className="text-sm font-medium">{t("chat.details.gentleMode")}</p>
								<p className="text-xs text-muted">{t("chat.details.gentleModeDesc")}</p>
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
							placeholder={t("chat.details.memoryPlaceholder")}
							className="h-9 min-w-0 flex-1 rounded-lg border border-app-border bg-app-soft px-3 text-sm text-app-text outline-none focus:border-primary"
						/>
						<button
							type="submit"
							disabled={!memoryDraft.trim() || isSavingMemoryFact}
							className="h-9 shrink-0 rounded-lg bg-primary px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
						>
							{t("chat.details.memorySave")}
						</button>
					</form>
					<div className="mt-3 space-y-2">
						{memoryFacts.slice(0, 8).map((fact) => (
							<div key={fact.id} className="flex items-start gap-2 rounded-lg border border-app-border bg-app-soft p-3">
								<p className="min-w-0 flex-1 text-xs leading-5 text-app-text">{fact.content}</p>
								<button
									type="button"
									onClick={() => onDeleteMemoryFact(fact.id)}
									className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-app-panel hover:text-red-500"
									aria-label={t("chat.details.memoryDelete")}
								>
									<Trash2 size={14} aria-hidden="true" />
								</button>
							</div>
						))}
						{memoryFacts.length === 0 && (
							<p className="rounded-lg border border-dashed border-app-border px-3 py-2 text-xs text-muted">
								{t("chat.details.memoryEmpty")}
							</p>
						)}
					</div>
				</section>
			</div>
		</aside>
	);
}

export default ChatDetailsPanel;
