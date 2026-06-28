import { Check, Clipboard } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import IconButton from "@/components/ui/IconButton";
import {
	canHighlightCode,
	getCachedHighlightedCode,
	getHighlightDebounceMs,
	highlightCode,
	type HighlightedCode
} from "@/features/chat/components/codeHighlighter";
import type { ChatMessageAuthor } from "@/types/chat";
import type { Theme } from "@/types/theme";
import { cn } from "@/utils/classNames";

type ChatMessageContentProps = {
	author: ChatMessageAuthor;
	isStreaming?: boolean;
	text: string;
	theme?: Theme;
};

function createMarkdownComponents({ isStreaming, theme }: { isStreaming: boolean; theme: Theme }): Components {
	return {
		a({ children, href, ...props }) {
			return (
				<a
					{...props}
					href={href}
					target="_blank"
					rel="noreferrer noopener"
					className="break-words font-medium text-primary underline decoration-primary/35 underline-offset-2 transition hover:decoration-primary"
				>
					{children}
				</a>
			);
		},
		blockquote({ children }) {
			return (
				<blockquote className="border-l-2 border-app-border pl-3 text-muted">
					{children}
				</blockquote>
			);
		},
		code({ children, className, ...props }) {
			const codeText = String(children).replace(/\n$/, "");
			const language = /language-(\S+)/.exec(className ?? "")?.[1];
			const isBlockCode = Boolean(language) || String(children).includes("\n");

			if (!isBlockCode) {
				return (
					<code
						{...props}
						className="rounded-md border border-app-border bg-app-soft px-1 py-0.5 font-mono text-[0.88em] text-app-text"
					>
						{children}
					</code>
				);
			}

			return <CodeBlock code={codeText} isStreaming={isStreaming} language={language} theme={theme} />;
		},
		h1({ children }) {
			return <h2 className="text-base font-semibold leading-6 text-app-text">{children}</h2>;
		},
		h2({ children }) {
			return <h2 className="text-base font-semibold leading-6 text-app-text">{children}</h2>;
		},
		h3({ children }) {
			return <h3 className="text-sm font-semibold leading-6 text-app-text">{children}</h3>;
		},
		h4({ children }) {
			return <h4 className="text-sm font-semibold leading-6 text-app-text">{children}</h4>;
		},
		hr() {
			return <hr className="border-app-border" />;
		},
		input({ checked, type }) {
			if (type !== "checkbox") {
				return <input type={type} checked={checked} readOnly />;
			}

			return (
				<input
					type="checkbox"
					checked={checked}
					disabled
					readOnly
					className="mr-2 translate-y-[1px] accent-primary"
					aria-label={checked ? "Completed task" : "Pending task"}
				/>
			);
		},
		li({ children, className }) {
			return (
				<li className={cn("pl-1", className?.includes("task-list-item") && "list-none pl-0")}>
					{children}
				</li>
			);
		},
		ol({ children }) {
			return <ol className="list-decimal space-y-1 pl-5">{children}</ol>;
		},
		p({ children }) {
			return <p>{children}</p>;
		},
		pre({ children }) {
			return <>{children}</>;
		},
		table({ children }) {
			return (
				<div className="max-w-full overflow-x-auto rounded-lg border border-app-border" data-markdown-table-scroll>
					<table className="min-w-full border-collapse text-left text-xs">{children}</table>
				</div>
			);
		},
		tbody({ children }) {
			return <tbody className="divide-y divide-app-border">{children}</tbody>;
		},
		td({ children }) {
			return <td className="border-app-border px-3 py-2 align-top">{children}</td>;
		},
		th({ children }) {
			return <th className="border-b border-app-border bg-app-soft px-3 py-2 font-semibold">{children}</th>;
		},
		thead({ children }) {
			return <thead>{children}</thead>;
		},
		ul({ children, className }) {
			return (
				<ul className={cn("list-disc space-y-1 pl-5", className?.includes("contains-task-list") && "list-none pl-0")}>
					{children}
				</ul>
			);
		}
	};
}

function ChatMessageContent({ author, isStreaming = false, text, theme = "light" }: ChatMessageContentProps) {
	if (author === "user") {
		return <PlainMessageContent text={text} />;
	}

	return <AssistantMarkdownContent isStreaming={isStreaming} text={text} theme={theme} />;
}

function AssistantMarkdownContent({ isStreaming, text, theme }: { isStreaming: boolean; text: string; theme: Theme }) {
	const markdownComponents = createMarkdownComponents({ isStreaming, theme });

	return (
		<div className="chat-markdown space-y-3 text-sm leading-6 text-app-text">
			<ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
				{text}
			</ReactMarkdown>
		</div>
	);
}

function PlainMessageContent({ text }: { text: string }) {
	return <p className="whitespace-pre-wrap text-sm leading-6">{text}</p>;
}

function CodeBlock({
	code,
	isStreaming,
	language,
	theme
}: {
	code: string;
	isStreaming: boolean;
	language?: string;
	theme: Theme;
}) {
	const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
	const [highlightedCode, setHighlightedCode] = useState<HighlightedCode | null>(() =>
		isStreaming ? null : getCachedHighlightedCode({ code, language, theme })
	);
	const copyResetTimeoutRef = useRef<number | null>(null);

	useEffect(() => {
		if (isStreaming || !canHighlightCode(code, language)) {
			setHighlightedCode(null);
			return;
		}

		const cachedHighlightedCode = getCachedHighlightedCode({ code, language, theme });

		if (cachedHighlightedCode) {
			setHighlightedCode(cachedHighlightedCode);
			return;
		}

		setHighlightedCode(null);

		let isCanceled = false;
		const highlightTimeoutId = window.setTimeout(() => {
			void highlightCode({ code, language, theme })
				.then((result) => {
					if (!isCanceled) {
						setHighlightedCode(result);
					}
				})
				.catch(() => {
					if (!isCanceled) {
						setHighlightedCode(null);
					}
				});
		}, getHighlightDebounceMs());

		return () => {
			isCanceled = true;
			window.clearTimeout(highlightTimeoutId);
		};
	}, [code, isStreaming, language, theme]);

	useEffect(() => {
		return () => {
			if (copyResetTimeoutRef.current !== null) {
				window.clearTimeout(copyResetTimeoutRef.current);
			}
		};
	}, []);

	async function copyCode() {
		await navigator.clipboard?.writeText(code);
		setCopyState("copied");

		if (copyResetTimeoutRef.current !== null) {
			window.clearTimeout(copyResetTimeoutRef.current);
		}

		copyResetTimeoutRef.current = window.setTimeout(() => setCopyState("idle"), 1200);
	}

	return (
		<div className="overflow-hidden rounded-lg border border-app-border bg-app-soft" data-markdown-code-block>
			<div className="flex min-h-9 items-center justify-between gap-3 border-b border-app-border px-3 py-1.5">
				<span className="min-w-0 truncate font-mono text-[11px] font-medium uppercase tracking-normal text-muted">
					{language ?? "code"}
				</span>
				<IconButton
					size="xs"
					variant="ghost"
					aria-label={copyState === "copied" ? "Code copied" : "Copy code"}
					onClick={copyCode}
				>
					{copyState === "copied" ? <Check size={14} aria-hidden="true" /> : <Clipboard size={14} aria-hidden="true" />}
				</IconButton>
			</div>
			<pre className="max-w-full overflow-x-auto p-3 text-xs leading-5">
				<code className="font-mono" data-markdown-code-highlighted={highlightedCode ? "true" : "false"}>
					{highlightedCode ? <HighlightedCodeLines highlightedCode={highlightedCode} /> : code}
				</code>
			</pre>
		</div>
	);
}

function HighlightedCodeLines({ highlightedCode }: { highlightedCode: HighlightedCode }) {
	return (
		<>
			{highlightedCode.lines.map((line, lineIndex) => (
				<Fragment key={lineIndex}>
					{line.map((token, tokenIndex) => (
						<span
							key={`${lineIndex}-${tokenIndex}`}
							style={{
								color: token.color,
								fontStyle: token.fontStyle === "italic" ? "italic" : undefined,
								fontWeight: token.fontStyle === "bold" ? 600 : undefined,
								textDecoration: token.fontStyle === "underline" ? "underline" : undefined
							}}
						>
							{token.content}
						</span>
					))}
					{lineIndex < highlightedCode.lines.length - 1 ? "\n" : null}
				</Fragment>
			))}
		</>
	);
}

export default ChatMessageContent;
