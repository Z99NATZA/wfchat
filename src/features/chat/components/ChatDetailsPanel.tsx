import { Bot, Check, MoreHorizontal } from "lucide-react";
import IconButton from "@/components/ui/IconButton";
import {
	CHAT_MODES,
	MEMORY_ITEMS,
	RESPONSE_METRICS,
	SAFETY_SETTING
} from "@/features/chat/data/chatFixtures";
import type { ChatPersona } from "@/types/chat";
import { cn } from "@/utils/classNames";

type ChatDetailsPanelProps = {
	persona: ChatPersona;
};

function ChatDetailsPanel({ persona }: ChatDetailsPanelProps) {
	return (
		<aside className="hidden min-h-0 border-l border-app-border bg-app-panel xl:flex xl:flex-col">
			<div className="border-b border-app-border p-5">
				<div className="relative overflow-hidden rounded-lg bg-app-soft">
					<img className="aspect-[16/11] w-full object-cover" src={persona.avatarUrl} alt={`${persona.name} profile`} />
				</div>
				<div className="mt-4 flex items-start justify-between gap-3">
					<div>
						<h2 className="text-lg font-semibold">{persona.name}</h2>
						<p className="text-sm text-muted">Memory enabled - fast replies</p>
					</div>
					<IconButton aria-label="More options">
						<MoreHorizontal size={18} aria-hidden="true" />
					</IconButton>
				</div>
			</div>

			<div className="chat-scroll flex-1 space-y-5 overflow-y-auto p-5">
				<section>
					<h3 className="text-sm font-semibold">Chat modes</h3>
					<div className="mt-3 grid grid-cols-2 gap-2">
						{CHAT_MODES.map((mode) => (
							<button
								key={mode.id}
								type="button"
								className={cn(
									"rounded-lg border px-3 py-2 text-sm font-medium transition",
									mode.isActive
										? "border-primary bg-primary text-white"
										: "border-app-border bg-app-soft text-muted hover:border-primary hover:text-primary"
								)}
							>
								{mode.label}
							</button>
						))}
					</div>
				</section>

				<section>
					<h3 className="text-sm font-semibold">Memory</h3>
					<div className="mt-3 space-y-2">
						{MEMORY_ITEMS.map((memory) => (
							<div
								key={memory.id}
								className="flex items-center gap-3 rounded-lg border border-app-border bg-app-soft p-3"
							>
								<span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
									<Check size={15} aria-hidden="true" />
								</span>
								<span className="text-sm">{memory.label}</span>
							</div>
						))}
					</div>
				</section>

				<section>
					<h3 className="text-sm font-semibold">Response shape</h3>
					<div className="mt-3 rounded-lg border border-app-border bg-app-soft p-4">
						{RESPONSE_METRICS.map((metric, index) => (
							<div key={metric.id} className={cn(index > 0 && "mt-4")}>
								<div className="flex items-center justify-between text-sm">
									<span className="text-muted">{metric.label}</span>
									<span className="font-semibold text-primary">{metric.value}%</span>
								</div>
								<input
									className="mt-3 w-full accent-primary"
									type="range"
									min="0"
									max="100"
									defaultValue={metric.value}
									aria-label={metric.label}
								/>
							</div>
						))}
					</div>
				</section>

				<section>
					<h3 className="text-sm font-semibold">Safety</h3>
					<div className="mt-3 flex items-center justify-between rounded-lg border border-app-border bg-app-soft p-3">
						<div className="flex items-center gap-3">
							<div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
								<Bot size={18} aria-hidden="true" />
							</div>
							<div>
								<p className="text-sm font-medium">{SAFETY_SETTING.title}</p>
								<p className="text-xs text-muted">{SAFETY_SETTING.description}</p>
							</div>
						</div>
						<span className="h-6 w-11 rounded-full bg-primary p-1">
							<span className="block size-4 translate-x-5 rounded-full bg-white" />
						</span>
					</div>
				</section>
			</div>
		</aside>
	);
}

export default ChatDetailsPanel;
