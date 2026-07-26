import { useI18n } from "@/i18n/i18nContext";
import type { ChatPersona } from "@/types/chat";

type ChatDetailsPanelProps = {
	persona: ChatPersona;
};

type ChatPersonaDetailsProps = {
	persona: ChatPersona;
	compact?: boolean;
};

const AIKO_PROFILE = {
	birthday: "2000-05-27",
	height: "175 cm",
	weight: "58 kg"
} as const;

function ChatDetailsPanel({ persona }: ChatDetailsPanelProps) {
	return (
		<aside
			className="hidden min-h-0 w-14 shrink-0 border-l border-app-border bg-app-panel/62 xl:flex xl:flex-col"
			data-testid="chat-details-panel"
			data-persona-id={persona.id}
		/>
	);
}

export function ChatPersonaDetails({ persona, compact = false }: ChatPersonaDetailsProps) {
	const { t } = useI18n();
	const profileRows: Array<{
		label: string;
		value: string;
	}> = [
		{
			label: t("chat.details.birthday"),
			value: AIKO_PROFILE.birthday
		},
		{
			label: t("chat.details.height"),
			value: AIKO_PROFILE.height
		},
		{
			label: t("chat.details.weight"),
			value: AIKO_PROFILE.weight
		}
	];

	return (
		<div
			className={compact ? "" : "flex min-h-0 flex-1 flex-col"}
			data-testid="chat-persona-details"
		>
			<div className={compact ? "p-4 pb-0" : "p-5 pb-0"}>
				<div className="relative overflow-hidden rounded-lg bg-app-soft">
					<img
						className={`${compact ? "aspect-[16/9]" : "aspect-[16/11]"} w-full object-cover`}
						src={persona.avatarUrl}
						alt={`${persona.name} profile`}
					/>
				</div>
			</div>

			<div
				className={
					compact ? "space-y-5 p-4" : "chat-scroll flex-1 space-y-5 overflow-y-auto p-5"
				}
			>
				<section>
					<h3 className="text-sm font-semibold">{t("chat.details.profile")}</h3>
					<dl className="mt-3 space-y-3" data-testid="chat-persona-profile-facts">
						{profileRows.map((row) => (
							<div key={row.label}>
								<dt className="text-xs font-medium text-muted">{row.label}</dt>
								<dd className="mt-0.5 text-sm font-semibold text-app-text">
									{row.value}
								</dd>
							</div>
						))}
					</dl>
				</section>
			</div>
		</div>
	);
}

export default ChatDetailsPanel;
