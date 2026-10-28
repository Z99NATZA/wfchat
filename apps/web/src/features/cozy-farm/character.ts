import { move, type World } from "./world";

export type Facing = "down" | "left" | "right" | "up";
export type CharacterState = "idle" | "walk" | "run";
export const FACINGS: Facing[] = ["down", "left", "right", "up"];
export const WALK_SPEED = 54;
export const RUN_SPEED = 86;
export const CHARACTER_SHEETS = {
	idle: "aiko-idle-v2.png",
	walk: {
		front: "aiko-walk-front-v2.png",
		back: "aiko-walk-back-v2.png",
		side: "aiko-walk-side-v2.png"
	},
	run: {
		front: "aiko-run-front-v2.png",
		back: "aiko-run-back-v2.png",
		side: "aiko-run-side-v2.png"
	}
} as const;
export const FRAME_COUNTS = { idle: 4, walk: 8, run: 8 };
// Registered atlas rows: down, up, mirrored left profile, right profile.
export const CHARACTER_ROWS: Record<Facing, number> = { down: 0, up: 1, left: 2, right: 3 };
// World distance per complete left + right stride. Playback follows collision-resolved distance.
export const STRIDE = { walk: 24, run: 32 };
export interface CharacterPose {
	state: CharacterState;
	facing: Facing;
	frame: number;
}

export function facingFor(dx: number, dy: number): Facing {
	return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy < 0 ? "up" : "down";
}

/** Transient velocity is deliberately not persisted in the world save. */
export class PlayerMotion {
	vx = 0;
	vy = 0;
	stop() {
		this.vx = this.vy = 0;
	}
	update(world: World, x: number, y: number, running: boolean, dt: number) {
		const length = Math.hypot(x, y),
			speed = running ? RUN_SPEED : WALK_SPEED;
		const tx = length ? (x / length) * speed : 0,
			ty = length ? (y / length) * speed : 0;
		// Integrate the exponential velocity response, so travel is independent of frame rate.
		const tau = length ? 0.035 : 0.045,
			decay = Math.exp(-dt / tau);
		const mx = tx * dt + (this.vx - tx) * tau * (1 - decay);
		const my = ty * dt + (this.vy - ty) * tau * (1 - decay);
		this.vx = tx + (this.vx - tx) * decay;
		this.vy = ty + (this.vy - ty) * decay;
		if (!length && Math.hypot(this.vx, this.vy) < 0.5) this.stop();
		const beforeX = world.player.x,
			beforeY = world.player.y;
		if (dt > 0 && Math.hypot(mx, my) > 0.005) move(world, mx, my, dt, Math.hypot(mx, my) / dt);
		if (Math.abs(world.player.x - beforeX) < 0.001) this.vx = 0;
		if (Math.abs(world.player.y - beforeY) < 0.001) this.vy = 0;
		return { dx: world.player.x - beforeX, dy: world.player.y - beforeY };
	}
}

/** No timers or React state: pausing the Pixi ticker also pauses all idle schedules. */
export class CharacterAnimation {
	pose: CharacterPose = { state: "idle", facing: "down", frame: 0 };
	phase = 0;
	private time = 0;
	update(dt: number, dx: number, dy: number, running: boolean, intentX = 0, intentY = 0) {
		this.time += dt;
		const distance = Math.hypot(dx, dy);
		if (distance > 0.005) {
			this.pose.facing = facingFor(dx, dy);
			this.pose.state = running ? "run" : "walk";
			this.phase = (this.phase + distance / STRIDE[this.pose.state]) % 1;
			if (this.phase > 1 - 1e-10) this.phase = 0;
			this.pose.frame = Math.floor(this.phase * FRAME_COUNTS[this.pose.state]);
			this.time = 0;
			return this.pose;
		}
		if (intentX || intentY) this.pose.facing = facingFor(intentX, intentY);
		this.pose.state = "idle";
		// Preserve the source character's breathing sequence and brief five-second blink.
		this.pose.frame = [0, 1, 0, 3][Math.floor(this.time * 2) % 4];
		const blinkPhase = this.time % 5;
		if (blinkPhase >= 4.65 && blinkPhase < 4.77) this.pose.frame = 2;
		return this.pose;
	}
}
