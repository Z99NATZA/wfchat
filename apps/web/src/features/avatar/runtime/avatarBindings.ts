import type { AvatarRendererKind } from "@/features/avatar/runtime/avatarRuntimeTypes";

export type AvatarBinding = {
	personaId: string;
	avatarId: string;
	rendererKind: AvatarRendererKind;
	defaultExpressionId: string;
	errorExpressionId: string;
	enabled: boolean;
};

export const AVATAR_BINDINGS: readonly AvatarBinding[] = [
	{
		personaId: "aiko",
		avatarId: "aiko-pngtuber",
		rendererKind: "pngtuber",
		defaultExpressionId: "neutral",
		errorExpressionId: "sad",
		enabled: true
	}
];

export function resolveAvatarBinding(
	personaId: string,
	bindings: readonly AvatarBinding[] = AVATAR_BINDINGS
): AvatarBinding | null {
	return bindings.find((binding) => binding.enabled && binding.personaId === personaId) ?? null;
}
