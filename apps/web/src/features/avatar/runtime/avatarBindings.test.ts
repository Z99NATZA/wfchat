import { describe, expect, it } from "vitest";
import { AVATAR_BINDINGS, resolveAvatarBinding, type AvatarBinding } from "@/features/avatar/runtime/avatarBindings";

describe("avatar bindings", () => {
	it("binds Aiko to the current PNGTuber avatar", () => {
		expect(resolveAvatarBinding("aiko")).toEqual({
			personaId: "aiko",
			avatarId: "aiko-pngtuber",
			rendererKind: "pngtuber",
			defaultExpressionId: "neutral",
			errorExpressionId: "sad",
			enabled: true
		});
	});

	it("returns null for unknown or disabled personas", () => {
		const bindings: AvatarBinding[] = [
			...AVATAR_BINDINGS,
			{
				personaId: "disabled-persona",
				avatarId: "disabled-avatar",
				rendererKind: "pngtuber",
				defaultExpressionId: "neutral",
				errorExpressionId: "sad",
				enabled: false
			}
		];

		expect(resolveAvatarBinding("missing-persona", bindings)).toBeNull();
		expect(resolveAvatarBinding("disabled-persona", bindings)).toBeNull();
	});

	it("can resolve additional persona bindings without changing bridge code", () => {
		const bindings: AvatarBinding[] = [
			...AVATAR_BINDINGS,
			{
				personaId: "forked-persona",
				avatarId: "forked-avatar",
				rendererKind: "pngtuber",
				defaultExpressionId: "neutral",
				errorExpressionId: "sad",
				enabled: true
			}
		];

		expect(resolveAvatarBinding("forked-persona", bindings)?.avatarId).toBe("forked-avatar");
	});
});
