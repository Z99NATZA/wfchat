export type AvatarRendererKind = "pngtuber" | "live2d";

export type AvatarMotionState = "idle" | "thinking" | "talking";

export type AvatarDrivenBy = "manual" | "chat-bridge";

export type AvatarRuntimeState = {
	avatarId: string;
	rendererKind: AvatarRendererKind;
	expressionId: string;
	motionState: AvatarMotionState;
	drivenBy: AvatarDrivenBy;
};

export type AvatarRuntimeUpdate = Partial<Omit<AvatarRuntimeState, "drivenBy">> & {
	drivenBy?: AvatarDrivenBy;
};
