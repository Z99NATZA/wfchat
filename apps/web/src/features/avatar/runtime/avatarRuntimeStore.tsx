import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
	AvatarRuntimeContext,
	DEFAULT_AVATAR_RUNTIME_STATE,
	type AvatarRuntimeContextValue
} from "@/features/avatar/runtime/avatarRuntimeContext";
import type {
	AvatarDrivenBy,
	AvatarMotionState,
	AvatarRuntimeState,
	AvatarRuntimeUpdate
} from "@/features/avatar/runtime/avatarRuntimeTypes";

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
