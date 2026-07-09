/**
 * @vitest-environment happy-dom
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAvatarChatBridge } from "@/features/avatar/runtime/avatarChatBridge";

const mocks = vi.hoisted(() => ({
	updateRuntimeState: vi.fn()
}));

vi.mock("@/features/avatar/runtime/avatarRuntimeContext", () => ({
	useAvatarRuntime: () => ({
		updateRuntimeState: mocks.updateRuntimeState
	})
}));

describe("useAvatarChatBridge speech playback motion", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	it("maps speech loading to semantic thinking motion", () => {
		const { result } = renderHook(() => useAvatarChatBridge());

		act(() => {
			result.current.notifyAvatarChatEvent({
				type: "assistant_speech_loading",
				chatId: "chat-1",
				personaId: "aiko",
				text: "ขอบคุณมากนะ"
			});
		});

		expect(mocks.updateRuntimeState).toHaveBeenCalledWith({
			avatarId: "aiko-pngtuber",
			rendererKind: "pngtuber",
			expressionId: "happy",
			motionState: "thinking",
			drivenBy: "chat-bridge"
		});
	});

	it("maps active speech playback to semantic talking motion", () => {
		const { result } = renderHook(() => useAvatarChatBridge());

		act(() => {
			result.current.notifyAvatarChatEvent({
				type: "assistant_speech_playing",
				chatId: "chat-1",
				personaId: "aiko",
				text: "Sorry, that hurt."
			});
		});

		expect(mocks.updateRuntimeState).toHaveBeenCalledWith({
			avatarId: "aiko-pngtuber",
			rendererKind: "pngtuber",
			expressionId: "sad",
			motionState: "talking",
			drivenBy: "chat-bridge"
		});
	});

	it("returns speech playback to idle without changing expression", () => {
		const { result } = renderHook(() => useAvatarChatBridge());

		act(() => {
			result.current.notifyAvatarChatEvent({
				type: "assistant_speech_stopped",
				chatId: "chat-1",
				personaId: "aiko"
			});
		});

		expect(mocks.updateRuntimeState).toHaveBeenCalledWith({
			avatarId: "aiko-pngtuber",
			rendererKind: "pngtuber",
			motionState: "idle",
			drivenBy: "chat-bridge"
		});
	});

	it("maps speech playback errors to idle error expression", () => {
		const { result } = renderHook(() => useAvatarChatBridge());

		act(() => {
			result.current.notifyAvatarChatEvent({
				type: "assistant_speech_error",
				chatId: "chat-1",
				personaId: "aiko"
			});
		});

		expect(mocks.updateRuntimeState).toHaveBeenCalledWith({
			avatarId: "aiko-pngtuber",
			rendererKind: "pngtuber",
			expressionId: "sad",
			motionState: "idle",
			drivenBy: "chat-bridge"
		});
	});
});
