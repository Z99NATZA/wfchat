import { useCallback, useEffect, useRef } from "react";
import { useAvatarRuntime } from "@/features/avatar/runtime/avatarRuntimeStore";
import type { AikoEmotionId } from "@/features/avatar/data/aikoPngTuber";

export type ChatAvatarEvent =
	| { type: "assistant_waiting"; chatId: string | null; personaId: string }
	| { type: "assistant_replied"; chatId: string; personaId: string; text: string }
	| { type: "assistant_error"; chatId: string | null; personaId: string };

export type AvatarBinding = {
	personaId: string;
	avatarId: string;
	enabled: boolean;
};

const TALKING_PREVIEW_MS = 1600;
const DEFAULT_EXPRESSION_ID: AikoEmotionId = "neutral";
const ERROR_EXPRESSION_ID: AikoEmotionId = "sad";

const emotionKeywordRules: Array<{ expressionId: AikoEmotionId; keywords: string[] }> = [
	{
		expressionId: "sad",
		keywords: [
			"sad",
			"sorry",
			"hurt",
			"lonely",
			"cry",
			"เศร้า",
			"เสียใจ",
			"ขอโทษ",
			"เจ็บ",
			"เหงา",
			"ร้องไห้"
		]
	},
	{
		expressionId: "surprised",
		keywords: ["wow", "whoa", "surprise", "unexpected", "ตกใจ", "ว้าว", "จริงเหรอ", "ไม่น่าเชื่อ"]
	},
	{
		expressionId: "shy",
		keywords: ["blush", "shy", "embarrassed", "เขิน", "อาย", "หน้าแดง"]
	},
	{
		expressionId: "happy",
		keywords: [
			"happy",
			"glad",
			"great",
			"love",
			"nice",
			"ดีใจ",
			"เยี่ยม",
			"รัก",
			"น่ารัก",
			"ขอบคุณ"
		]
	}
];

const avatarBindings: AvatarBinding[] = [
	{
		personaId: "aiko",
		avatarId: "aiko-pngtuber",
		enabled: true
	}
];

function resolveAvatarBinding(personaId: string): AvatarBinding | null {
	return avatarBindings.find((binding) => binding.enabled && binding.personaId === personaId) ?? null;
}

function inferExpressionIdFromText(text: string): AikoEmotionId {
	const normalizedText = text.trim().toLocaleLowerCase();
	if (!normalizedText) {
		return DEFAULT_EXPRESSION_ID;
	}

	const matchedRule = emotionKeywordRules.find((rule) =>
		rule.keywords.some((keyword) => normalizedText.includes(keyword.toLocaleLowerCase()))
	);

	return matchedRule?.expressionId ?? DEFAULT_EXPRESSION_ID;
}

export function useAvatarChatBridge() {
	const { updateRuntimeState } = useAvatarRuntime();
	const idleTimeoutRef = useRef<number | null>(null);

	const clearIdleTimeout = useCallback(() => {
		if (idleTimeoutRef.current === null) {
			return;
		}

		window.clearTimeout(idleTimeoutRef.current);
		idleTimeoutRef.current = null;
	}, []);

	useEffect(() => clearIdleTimeout, [clearIdleTimeout]);

	const notifyAvatarChatEvent = useCallback(
		(event: ChatAvatarEvent) => {
			const binding = resolveAvatarBinding(event.personaId);
			if (!binding) {
				return;
			}

			clearIdleTimeout();

			switch (event.type) {
				case "assistant_waiting":
					updateRuntimeState({
						avatarId: binding.avatarId,
						rendererKind: "pngtuber",
						expressionId: DEFAULT_EXPRESSION_ID,
						motionState: "thinking",
						drivenBy: "chat-bridge"
					});
					return;
				case "assistant_replied":
					updateRuntimeState({
						avatarId: binding.avatarId,
						rendererKind: "pngtuber",
						expressionId: inferExpressionIdFromText(event.text),
						motionState: "talking",
						drivenBy: "chat-bridge"
					});
					idleTimeoutRef.current = window.setTimeout(() => {
						updateRuntimeState({
							motionState: "idle",
							drivenBy: "chat-bridge"
						});
						idleTimeoutRef.current = null;
					}, TALKING_PREVIEW_MS);
					return;
				case "assistant_error":
					updateRuntimeState({
						avatarId: binding.avatarId,
						rendererKind: "pngtuber",
						expressionId: ERROR_EXPRESSION_ID,
						motionState: "idle",
						drivenBy: "chat-bridge"
					});
					return;
			}
		},
		[clearIdleTimeout, updateRuntimeState]
	);

	return { notifyAvatarChatEvent };
}
