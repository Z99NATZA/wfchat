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
	MISTWATER_WORLD_WIDTH,
	isMistwaterWaterPoint
} from "@/features/mistwater/game/mistwaterMap";
import {
	createMistwaterWorld,
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
	flower: Phaser.GameObjects.Container;
	petals: Phaser.GameObjects.Ellipse[];
	center: Phaser.GameObjects.Arc;
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
	private wakeSide = 1;
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
		const proposedX = Phaser.Math.Clamp(
			this.breeze.x + this.velocity.x * (delta / 1000),
			45,
			MISTWATER_WORLD_WIDTH - 45
		);
		const proposedY = Phaser.Math.Clamp(
			this.breeze.y + this.velocity.y * (delta / 1000),
			45,
			MISTWATER_WORLD_HEIGHT - 45
		);
		let nextX = this.breeze.x;
		let nextY = this.breeze.y;
		if (isMistwaterWaterPoint(proposedX, proposedY)) {
			nextX = proposedX;
			nextY = proposedY;
		} else {
			if (isMistwaterWaterPoint(proposedX, this.breeze.y)) {
				nextX = proposedX;
			}
			if (isMistwaterWaterPoint(this.breeze.x, proposedY)) {
				nextY = proposedY;
			}
			this.velocity.scale(0.72);
		}
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
			.circle(x, y, 22, 0x8fffd2, 0.08)
			.setStrokeStyle(1, 0xcfffee, 0.36)
			.setDepth(5);
		const petals = Array.from({ length: 7 }, (_, petalIndex) => {
			const angle = (Math.PI * 2 * petalIndex) / 7;
			return this.add
				.ellipse(Math.cos(angle) * 7, Math.sin(angle) * 7, 8, 15, 0xc9eee7, 0.78)
				.setRotation(angle + Math.PI / 2);
		});
		const center = this.add.circle(0, 0, 5, 0xf3d99b, 0.86);
		const flower = this.add
			.container(x, y, [...petals, center])
			.setDepth(6)
			.setScale(0.82)
			.setRotation(index * 0.37);
		const bloom = { x, y, flower, petals, center, glow, awakeUntil: 0 };
		this.drawBloom(bloom, false);
		this.tweens.add({
			targets: glow,
			scale: 1.22,
			alpha: 0.2,
			duration: 1_250 + index * 47,
			yoyo: true,
			repeat: -1,
			ease: "Sine.InOut"
		});
		this.tweens.add({
			targets: flower,
			rotation: flower.rotation + Math.PI * 2,
			duration: 18_000 + index * 320,
			repeat: -1
		});
		return bloom;
	}

	private drawBloom(bloom: Bloom, awake: boolean) {
		for (const petal of bloom.petals) {
			petal.setFillStyle(awake ? 0xfff1c2 : 0xc9eee7, awake ? 0.96 : 0.72);
		}
		bloom.center.setFillStyle(awake ? 0xffc95c : 0xf3d99b, awake ? 1 : 0.82);
		bloom.flower.setAlpha(awake ? 1 : 0.82);
	}

	private wakeBloom(bloom: Bloom, time: number) {
		bloom.awakeUntil = time + BLOOM_REST_MS;
		this.drawBloom(bloom, true);
		bloom.glow.setFillStyle(0xffe891, 0.28).setStrokeStyle(2, 0xfff0ae, 0.7).setRadius(34);
		this.tweens.add({
			targets: bloom.flower,
			scale: 1.12,
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
		this.drawBloom(bloom, false);
		bloom.glow.setFillStyle(0x8fffd2, 0.1).setStrokeStyle(1, 0xcfffee, 0.36).setRadius(25);
		bloom.flower.setScale(0.82);
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
		const speed = Math.max(this.velocity.length(), 1);
		const directionX = this.velocity.x / speed;
		const directionY = this.velocity.y / speed;
		const normalX = -directionY;
		const normalY = directionX;
		const trailX = x - directionX * 18 + normalX * this.wakeSide * 8;
		const trailY = y - directionY * 18 + normalY * this.wakeSide * 8 + 8;
		this.wakeSide *= -1;
		const ripple = this.add
			.ellipse(trailX, trailY, 24, 10, 0x8cf6ec, 0)
			.setStrokeStyle(2, 0xc5fff5, 0.48)
			.setRotation(Math.atan2(directionY, directionX))
			.setDepth(7)
			.setBlendMode(Phaser.BlendModes.ADD);
		const sparkle = this.add
			.circle(trailX, trailY, 2, 0xe7fff9, 0.72)
			.setDepth(8)
			.setBlendMode(Phaser.BlendModes.ADD);
		this.tweens.add({
			targets: ripple,
			scaleX: 2.1,
			scaleY: 1.65,
			alpha: 0,
			duration: 820,
			ease: "Sine.Out",
			onComplete: () => ripple.destroy()
		});
		this.tweens.add({
			targets: sparkle,
			x: trailX - directionX * 10,
			y: trailY - directionY * 10,
			alpha: 0,
			scale: 0.3,
			duration: 480,
			ease: "Cubic.Out",
			onComplete: () => sparkle.destroy()
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
			Math.max(
				viewportWidth / MISTWATER_WORLD_WIDTH,
				viewportHeight / MISTWATER_WORLD_HEIGHT
			),
			0.72,
			1.05
		);
		this.cameras.main.setZoom(zoom);
		this.cameras.main.startFollow(this.breeze, true, 0.08, 0.08);
		this.cameras.main.setRoundPixels(false);
	}

	private resetRun() {
		this.snapshot = initialMistwaterSnapshot();
		this.lastBloomAt = null;
		this.lastRippleAt = 0;
		this.wakeSide = 1;
		this.pointerTarget = null;
		this.velocity.set(0, 0);
		this.breeze?.setPosition(MISTWATER_PLAYER_START.x, MISTWATER_PLAYER_START.y);
		this.blooms.forEach((bloom) => this.restBloom(bloom));
		this.onSnapshot(this.snapshot);
	}
}
