import { Languages, Sparkles } from "lucide-react";
import type { ChatPersona } from "@/types/chat";

type ChatDetailsPanelProps = {
	persona: ChatPersona;
};

const toneItems = ["Calm", "Warm", "Lightly playful", "Respectful"];

function ChatDetailsPanel({ persona }: ChatDetailsPanelProps) {
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
					<h3 className="text-sm font-semibold">About Aiko</h3>
					<p className="mt-3 rounded-lg border border-app-border bg-app-soft p-4 text-sm leading-6 text-muted">
						Aiko is calm, warm, and quietly affectionate. She keeps the conversation gentle,
						grounded, and lightly playful.
					</p>
				</section>

				<section>
					<h3 className="text-sm font-semibold">Tone</h3>
					<div className="mt-3 flex flex-wrap gap-2">
						{toneItems.map((tone) => (
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
					<h3 className="text-sm font-semibold">Conversation</h3>
					<div className="mt-3 space-y-2">
						<div className="flex items-center gap-3 rounded-lg border border-app-border bg-app-soft p-3">
							<div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
								<Languages size={18} aria-hidden="true" />
							</div>
							<div>
								<p className="text-sm font-medium">Replies in your language</p>
								<p className="text-xs text-muted">Aiko follows the language you use.</p>
							</div>
						</div>
						<div className="flex items-center gap-3 rounded-lg border border-app-border bg-app-soft p-3">
							<div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
								<Sparkles size={18} aria-hidden="true" />
							</div>
							<div>
								<p className="text-sm font-medium">Gentle companion mode</p>
								<p className="text-xs text-muted">Soft humor, calm replies, and clear boundaries.</p>
							</div>
						</div>
					</div>
				</section>
			</div>
		</aside>
	);
}

export default ChatDetailsPanel;
