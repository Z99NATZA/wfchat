import { useCallback, useEffect, useRef } from "react";
import { resolveAvatarBinding } from "@/features/avatar/runtime/avatarBindings";
import { useAvatarRuntime } from "@/features/avatar/runtime/avatarRuntimeStore";
import {
	inferExpressionIdFromText
} from "@/features/avatar/runtime/avatarEmotionInference";

export type ChatAvatarEvent =
	| { type: "assistant_waiting"; chatId: string | null; personaId: string }
	| { type: "assistant_replied"; chatId: string; personaId: string; text: string }
	| { type: "assistant_error"; chatId: string | null; personaId: string };

const TALKING_PREVIEW_MS = 1600;

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
						rendererKind: binding.rendererKind,
						expressionId: binding.defaultExpressionId,
						motionState: "thinking",
						drivenBy: "chat-bridge"
					});
					return;
				case "assistant_replied":
					updateRuntimeState({
						avatarId: binding.avatarId,
						rendererKind: binding.rendererKind,
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
						rendererKind: binding.rendererKind,
						expressionId: binding.errorExpressionId,
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
