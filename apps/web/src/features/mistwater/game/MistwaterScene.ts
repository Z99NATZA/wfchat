import Phaser from "phaser";
import {
	MISTWATER_WORLD_HEIGHT,
	MISTWATER_WORLD_WIDTH
} from "@/features/mistwater/game/mistwaterMap";
import {
	createMistwaterWorld,
	preloadMistwaterWorld,
	type MistwaterWorld
} from "@/features/mistwater/game/MistwaterWorld";

const POINTER_RIPPLE_INTERVAL_MS = 55;

export default class MistwaterScene extends Phaser.Scene {
	private world?: MistwaterWorld;
	private lastPointerRippleAt = 0;

	constructor() {
		super("mistwater");
	}

	preload() {
		preloadMistwaterWorld(this);
	}

	create() {
		this.cameras.main.setBackgroundColor("#061d24");
		this.world = createMistwaterWorld(this);
		this.cameras.main.setBounds(0, 0, MISTWATER_WORLD_WIDTH, MISTWATER_WORLD_HEIGHT);
		this.configureInput();
		this.configureCamera();
		this.scale.on(Phaser.Scale.Events.RESIZE, this.configureCamera, this);
		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			this.scale.off(Phaser.Scale.Events.RESIZE, this.configureCamera, this);
		});
	}

	update(time: number, delta: number) {
		this.world?.update(time, delta);
	}

	private configureInput() {
		const disturbAtPointer = (
			pointer: Phaser.Input.Pointer,
			strength: number,
			radius: number
		) => {
			const worldPoint = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
			this.world?.disturbWater(worldPoint.x, worldPoint.y, strength, radius);
		};

		this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
			this.lastPointerRippleAt = this.time.now;
			disturbAtPointer(pointer, 0.9, 3);
		});
		this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
			if (
				!pointer.isDown ||
				this.time.now - this.lastPointerRippleAt < POINTER_RIPPLE_INTERVAL_MS
			) {
				return;
			}
			this.lastPointerRippleAt = this.time.now;
			disturbAtPointer(pointer, 0.34, 2);
		});
	}

	private configureCamera() {
		const viewportWidth = Math.max(this.scale.width, 320);
		const viewportHeight = Math.max(this.scale.height, 320);
		const zoom = Phaser.Math.Clamp(
			Math.max(
				viewportWidth / MISTWATER_WORLD_WIDTH,
				viewportHeight / MISTWATER_WORLD_HEIGHT
			),
			0.38,
			1.05
		);
		this.cameras.main.stopFollow();
		this.cameras.main.setZoom(zoom);
		this.cameras.main.centerOn(MISTWATER_WORLD_WIDTH / 2, MISTWATER_WORLD_HEIGHT / 2);
		this.cameras.main.setRoundPixels(false);
	}
}
