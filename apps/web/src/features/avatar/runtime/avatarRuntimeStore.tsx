import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
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

type AvatarRuntimeContextValue = {
	state: AvatarRuntimeState;
	resetRuntimeState: () => void;
	setExpression: (expressionId: string, drivenBy?: AvatarDrivenBy) => void;
	setMotionState: (motionState: AvatarMotionState, drivenBy?: AvatarDrivenBy) => void;
	setRuntimeState: (state: AvatarRuntimeState) => void;
	updateRuntimeState: (update: AvatarRuntimeUpdate) => void;
};

const AvatarRuntimeContext = createContext<AvatarRuntimeContextValue | null>(null);

type AvatarRuntimeProviderProps = {
	children: ReactNode;
};

export function AvatarRuntimeProvider({ children }: AvatarRuntimeProviderProps) {
	const [state, setState] = useState<AvatarRuntimeState>(DEFAULT_AVATAR_RUNTIME_STATE);

	const setRuntimeState = useCallback((nextState: AvatarRuntimeState) => {
		setState(nextState);
	}, []);

	const updateRuntimeState = useCallback((update: AvatarRuntimeUpdate) => {
		setState((currentState) => ({
			...currentState,
			...update
		}));
	}, []);

	const setExpression = useCallback(
		(expressionId: string, drivenBy: AvatarDrivenBy = "manual") => {
			setState((currentState) => ({
				...currentState,
				expressionId,
				drivenBy
			}));
		},
		[]
	);

	const setMotionState = useCallback(
		(motionState: AvatarMotionState, drivenBy: AvatarDrivenBy = "manual") => {
			setState((currentState) => ({
				...currentState,
				motionState,
				drivenBy
			}));
		},
		[]
	);

	const resetRuntimeState = useCallback(() => {
		setState(DEFAULT_AVATAR_RUNTIME_STATE);
	}, []);

	const value = useMemo<AvatarRuntimeContextValue>(
		() => ({
			state,
			resetRuntimeState,
			setExpression,
			setMotionState,
			setRuntimeState,
			updateRuntimeState
		}),
		[
			resetRuntimeState,
			setExpression,
			setMotionState,
			setRuntimeState,
			state,
			updateRuntimeState
		]
	);

	return <AvatarRuntimeContext.Provider value={value}>{children}</AvatarRuntimeContext.Provider>;
}

export function useAvatarRuntime() {
	const context = useContext(AvatarRuntimeContext);

	if (!context) {
		throw new Error("useAvatarRuntime must be used within AvatarRuntimeProvider");
	}

	return context;
}
