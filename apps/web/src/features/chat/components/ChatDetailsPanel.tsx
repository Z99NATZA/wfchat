import { Languages, Sparkles } from "lucide-react";
import { useI18n } from "@/i18n";
import type { ChatPersona } from "@/types/chat";

type ChatDetailsPanelProps = {
	persona: ChatPersona;
};

const toneItems = ["Calm", "Warm", "Lightly playful", "Respectful"];

function ChatDetailsPanel({ persona }: ChatDetailsPanelProps) {
	const { locale, t } = useI18n();
	const toneItemsByLocale = locale === "th" ? ["สุขุม", "อบอุ่น", "ขี้เล่นเล็กน้อย", "ให้เกียรติ"] : toneItems;

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
			</div>
		</aside>
	);
}

export default ChatDetailsPanel;
