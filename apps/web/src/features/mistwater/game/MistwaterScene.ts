import Phaser from "phaser";
import {
	initialMistwaterSnapshot,
	recordMistwaterBloom,
	type MistwaterSnapshot
} from "@/features/mistwater/game/mistwaterState";
import {
	MISTWATER_BLOOM_POINTS,
	MISTWATER_PLAYER_START,
	MISTWATER_WORLD_HEIGHT,
	MISTWATER_WORLD_WIDTH
} from "@/features/mistwater/game/mistwaterMap";
import {
	createMistwaterWorld,
	MISTWATER_SCENERY_TEXTURE_KEY,
	preloadMistwaterWorld,
	type MistwaterWorld
} from "@/features/mistwater/game/MistwaterWorld";

const PLAYER_SPEED = 220;
const BLOOM_RADIUS = 54;
const BLOOM_REST_MS = 16_000;

type DirectionKey = "up" | "down" | "left" | "right" | "w" | "a" | "s" | "d";
type DirectionKeys = Record<DirectionKey, Phaser.Input.Keyboard.Key>;

type Bloom = {
	x: number;
	y: number;
	petals: Phaser.GameObjects.Image;
	glow: Phaser.GameObjects.Arc;
	awakeUntil: number;
};

export default class MistwaterScene extends Phaser.Scene {
	private readonly onSnapshot: (snapshot: MistwaterSnapshot) => void;
	private keys?: DirectionKeys;
	private breeze?: Phaser.GameObjects.Container;
	private breezeCore?: Phaser.GameObjects.Arc;
	private breezeRing?: Phaser.GameObjects.Arc;
	private blooms: Bloom[] = [];
	private pointerTarget: Phaser.Math.Vector2 | null = null;
	private velocity = new Phaser.Math.Vector2();
	private snapshot = initialMistwaterSnapshot();
	private lastBloomAt: number | null = null;
	private lastRippleAt = 0;
	private world?: MistwaterWorld;

	constructor(onSnapshot: (snapshot: MistwaterSnapshot) => void) {
		super("mistwater");
		this.onSnapshot = onSnapshot;
	}

	preload() {
		preloadMistwaterWorld(this);
	}

	create() {
		this.cameras.main.setBackgroundColor("#061d24");
		this.world = createMistwaterWorld(this);
		this.cameras.main.setBounds(0, 0, MISTWATER_WORLD_WIDTH, MISTWATER_WORLD_HEIGHT);

		this.blooms = MISTWATER_BLOOM_POINTS.map(({ x, y }, index) =>
			this.createBloom(x, y, index)
		);
		this.createBreeze();
		this.configureInput();
		this.configureCamera();
		this.scale.on(Phaser.Scale.Events.RESIZE, this.configureCamera, this);
		this.game.events.on("mistwater:reset", this.resetRun, this);
		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			this.scale.off(Phaser.Scale.Events.RESIZE, this.configureCamera, this);
			this.game.events.off("mistwater:reset", this.resetRun, this);
		});
		this.onSnapshot(this.snapshot);
	}

	update(time: number, delta: number) {
		this.world?.update(time);
		if (!this.breeze || !this.breezeCore || !this.breezeRing || !this.keys) {
			return;
		}

		const keyboardDirection = new Phaser.Math.Vector2(
			Number(this.keys.right.isDown || this.keys.d.isDown) -
				Number(this.keys.left.isDown || this.keys.a.isDown),
			Number(this.keys.down.isDown || this.keys.s.isDown) -
				Number(this.keys.up.isDown || this.keys.w.isDown)
		);
		const desiredVelocity = new Phaser.Math.Vector2();

		if (keyboardDirection.lengthSq() > 0) {
			this.pointerTarget = null;
			desiredVelocity.copy(keyboardDirection.normalize().scale(PLAYER_SPEED));
		} else if (this.pointerTarget) {
			const distance = Phaser.Math.Distance.Between(
				this.breeze.x,
				this.breeze.y,
				this.pointerTarget.x,
				this.pointerTarget.y
			);
			if (distance > 10) {
				desiredVelocity
					.set(this.pointerTarget.x - this.breeze.x, this.pointerTarget.y - this.breeze.y)
					.normalize()
					.scale(Math.min(PLAYER_SPEED, 95 + distance * 0.45));
			} else {
				this.pointerTarget = null;
			}
		}

		const smoothing = 1 - Math.pow(0.0009, delta / 1000);
		this.velocity.lerp(desiredVelocity, smoothing);
		const nextX = Phaser.Math.Clamp(
			this.breeze.x + this.velocity.x * (delta / 1000),
			45,
			MISTWATER_WORLD_WIDTH - 45
		);
		const nextY = Phaser.Math.Clamp(
			this.breeze.y + this.velocity.y * (delta / 1000),
			45,
			MISTWATER_WORLD_HEIGHT - 45
		);
		this.breeze.setPosition(nextX, nextY);

		const motion = Phaser.Math.Clamp(this.velocity.length() / PLAYER_SPEED, 0, 1);
		this.breezeCore.setScale(1 + motion * 0.2);
		this.breezeRing.setScale(1 + Math.sin(time / 360) * 0.08 + motion * 0.13);
		this.breeze.setRotation(motion > 0.08 ? Math.atan2(this.velocity.y, this.velocity.x) : 0);

		if (motion > 0.08 && time - this.lastRippleAt > 135) {
			this.lastRippleAt = time;
			this.createRipple(this.breeze.x, this.breeze.y);
		}

		for (const bloom of this.blooms) {
			if (bloom.awakeUntil > 0 && time >= bloom.awakeUntil) {
				this.restBloom(bloom);
			}
			if (
				bloom.awakeUntil === 0 &&
				Phaser.Math.Distance.Squared(this.breeze.x, this.breeze.y, bloom.x, bloom.y) <=
					BLOOM_RADIUS * BLOOM_RADIUS
			) {
				this.wakeBloom(bloom, time);
			}
		}
	}

	private createBreeze() {
		const halo = this.add.circle(0, 0, 34, 0x9ff8e5, 0.13);
		this.breezeRing = this.add
			.circle(0, 0, 25, 0x80e6db, 0.1)
			.setStrokeStyle(2, 0xd5fff5, 0.74);
		this.breezeCore = this.add
			.circle(0, 0, 11, 0xd9fff4, 0.88)
			.setStrokeStyle(2, 0xffffff, 0.72);
		const tailA = this.add.ellipse(-25, 7, 34, 9, 0xa5f5e7, 0.23).setAngle(-12);
		const tailB = this.add.ellipse(-18, -9, 25, 7, 0xe0fff8, 0.18).setAngle(13);
		this.breeze = this.add
			.container(MISTWATER_PLAYER_START.x, MISTWATER_PLAYER_START.y, [
				halo,
				this.breezeRing,
				tailA,
				tailB,
				this.breezeCore
			])
			.setDepth(2_000);
		this.tweens.add({
			targets: halo,
			scale: 1.3,
			alpha: 0.04,
			duration: 1_500,
			yoyo: true,
			repeat: -1,
			ease: "Sine.InOut"
		});
	}

	private createBloom(x: number, y: number, index: number): Bloom {
		const glow = this.add
			.circle(x, y, 25, 0x8fffd2, 0.1)
			.setStrokeStyle(1, 0xcfffee, 0.36)
			.setDepth(5);
		const petals = this.add
			.image(x, y, MISTWATER_SCENERY_TEXTURE_KEY, 3)
			.setScale(0.105)
			.setDepth(6);
		this.drawBloom(petals, false);
		this.tweens.add({
			targets: glow,
			scale: 1.22,
			alpha: 0.2,
			duration: 1_250 + index * 47,
			yoyo: true,
			repeat: -1,
			ease: "Sine.InOut"
		});
		return { x, y, petals, glow, awakeUntil: 0 };
	}

	private drawBloom(petals: Phaser.GameObjects.Image, awake: boolean) {
		petals.setTint(awake ? 0xffe7a0 : 0x9ddfd5).setAlpha(awake ? 1 : 0.72);
	}

	private wakeBloom(bloom: Bloom, time: number) {
		bloom.awakeUntil = time + BLOOM_REST_MS;
		this.drawBloom(bloom.petals, true);
		bloom.glow.setFillStyle(0xffe891, 0.28).setStrokeStyle(2, 0xfff0ae, 0.7).setRadius(34);
		this.tweens.add({
			targets: bloom.petals,
			scale: 0.135,
			duration: 270,
			yoyo: true,
			ease: "Back.Out"
		});
		this.tweens.add({
			targets: bloom.glow,
			scale: 1.28,
			duration: 270,
			yoyo: true,
			ease: "Back.Out"
		});
		this.createBloomBurst(bloom.x, bloom.y);

		const elapsed = this.lastBloomAt === null ? null : time - this.lastBloomAt;
		this.snapshot = recordMistwaterBloom(this.snapshot, elapsed);
		this.lastBloomAt = time;
		this.onSnapshot(this.snapshot);
	}

	private restBloom(bloom: Bloom) {
		bloom.awakeUntil = 0;
		this.drawBloom(bloom.petals, false);
		bloom.glow.setFillStyle(0x8fffd2, 0.1).setStrokeStyle(1, 0xcfffee, 0.36).setRadius(25);
		bloom.petals.setScale(0.105);
		bloom.glow.setScale(1);
	}

	private createBloomBurst(x: number, y: number) {
		for (let index = 0; index < 10; index += 1) {
			const angle = (Math.PI * 2 * index) / 10 + Math.random() * 0.28;
			const mote = this.add
				.circle(x, y, Phaser.Math.Between(2, 4), 0xffef9c, 0.95)
				.setDepth(9);
			const distance = Phaser.Math.Between(28, 58);
			this.tweens.add({
				targets: mote,
				x: x + Math.cos(angle) * distance,
				y: y + Math.sin(angle) * distance,
				alpha: 0,
				scale: 0.25,
				duration: Phaser.Math.Between(520, 850),
				ease: "Cubic.Out",
				onComplete: () => mote.destroy()
			});
		}
	}

	private createRipple(x: number, y: number) {
		const ripple = this.add
			.ellipse(x, y + 8, 28, 13, 0x8cf6ec, 0)
			.setStrokeStyle(2, 0xc5fff5, 0.48)
			.setDepth(7);
		this.tweens.add({
			targets: ripple,
			scaleX: 1.9,
			scaleY: 1.9,
			alpha: 0,
			duration: 720,
			ease: "Sine.Out",
			onComplete: () => ripple.destroy()
		});
	}

	private configureInput() {
		const keyboard = this.input.keyboard;
		if (keyboard) {
			const codes = Phaser.Input.Keyboard.KeyCodes;
			this.keys = keyboard.addKeys({
				up: codes.UP,
				down: codes.DOWN,
				left: codes.LEFT,
				right: codes.RIGHT,
				w: codes.W,
				a: codes.A,
				s: codes.S,
				d: codes.D
			}) as DirectionKeys;
			keyboard.addCapture([
				codes.UP,
				codes.DOWN,
				codes.LEFT,
				codes.RIGHT,
				codes.W,
				codes.A,
				codes.S,
				codes.D
			]);
		}

		const updatePointerTarget = (pointer: Phaser.Input.Pointer) => {
			const worldPoint = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
			this.pointerTarget = new Phaser.Math.Vector2(
				Phaser.Math.Clamp(worldPoint.x, 45, MISTWATER_WORLD_WIDTH - 45),
				Phaser.Math.Clamp(worldPoint.y, 45, MISTWATER_WORLD_HEIGHT - 45)
			);
		};
		this.input.on(Phaser.Input.Events.POINTER_DOWN, updatePointerTarget);
		this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
			if (pointer.isDown) {
				updatePointerTarget(pointer);
			}
		});
	}

	private configureCamera() {
		if (!this.breeze) {
			return;
		}
		const viewportWidth = Math.max(this.scale.width, 320);
		const viewportHeight = Math.max(this.scale.height, 320);
		const zoom = Phaser.Math.Clamp(
			Math.min(viewportWidth / 960, viewportHeight / 620),
			0.72,
			1.16
		);
		this.cameras.main.setZoom(zoom);
		this.cameras.main.startFollow(this.breeze, true, 0.08, 0.08);
		this.cameras.main.setRoundPixels(true);
	}

	private resetRun() {
		this.snapshot = initialMistwaterSnapshot();
		this.lastBloomAt = null;
		this.pointerTarget = null;
		this.velocity.set(0, 0);
		this.breeze?.setPosition(MISTWATER_PLAYER_START.x, MISTWATER_PLAYER_START.y);
		this.blooms.forEach((bloom) => this.restBloom(bloom));
		this.onSnapshot(this.snapshot);
	}
}
