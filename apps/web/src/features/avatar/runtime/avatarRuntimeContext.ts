import { createContext, useContext } from "react";
import type {
	AvatarDrivenBy,
	AvatarMotionState,
	AvatarRuntimeState,
	AvatarRuntimeUpdate
} from "@/features/avatar/runtime/avatarRuntimeTypes";

export const DEFAULT_AVATAR_RUNTIME_STATE: AvatarRuntimeState = {
	avatarId: "aiko-pngtuber",
	rendererKind: "pngtuber",
	expressionId: "neutral",
	motionState: "idle",
	drivenBy: "manual"
};

export type AvatarRuntimeContextValue = {
	state: AvatarRuntimeState;
	resetRuntimeState: () => void;
	setExpression: (expressionId: string, drivenBy?: AvatarDrivenBy) => void;
	setMotionState: (motionState: AvatarMotionState, drivenBy?: AvatarDrivenBy) => void;
	setRuntimeState: (state: AvatarRuntimeState) => void;
	updateRuntimeState: (update: AvatarRuntimeUpdate) => void;
};

export const AvatarRuntimeContext = createContext<AvatarRuntimeContextValue | null>(null);

export function useAvatarRuntime() {
	const context = useContext(AvatarRuntimeContext);

	if (!context) {
		throw new Error("useAvatarRuntime must be used within AvatarRuntimeProvider");
	}

	return context;
}
