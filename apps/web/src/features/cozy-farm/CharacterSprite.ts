import { Sprite } from "pixi.js";
import type { Art } from "./art";
import type { CharacterPose } from "./character";

/** Keep the torso, pelvis, knees and boots in the same authored animation frame. */
export class CharacterSprite extends Sprite {
	constructor(private art: Art) {
		super();
		this.anchor.set(0.5, 1);
		this.scale.set(0.5);
	}
	update(pose: CharacterPose, x: number, y: number) {
		this.texture = this.art.player(pose);
		this.position.set(x, y);
		this.zIndex = y;
	}
}
