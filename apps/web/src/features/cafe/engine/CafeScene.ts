import Phaser from "phaser";
import type {
	CafeDirection,
	CafeEmote,
	CafeMapLayout,
	CafePlayerState,
	CafeRoomState
} from "@/features/cafe/types";
import { calculateCafeCameraFraming } from "@/features/cafe/engine/cafeCamera";
import { resolveCafeMovement } from "@/features/cafe/engine/cafeCollision";
import {
	CAFE_PLAYER_DISPLAY_SIZE,
	CAFE_PLAYER_FRAME_SIZE,
	CAFE_PLAYER_ORIGIN_Y,
	CAFE_PLAYER_SPRITE_KEY,
	CAFE_PLAYER_SPRITE_URL,
	cafePlayerFrame,
	cafePlayerFrameOffsetX
} from "@/features/cafe/engine/cafePlayerAnimation";

const PLAYER_SPEED = 210;
const PLAYER_LABEL_Y = -101;
const PLAYER_LABEL_WITH_COSMETIC_Y = -119;
const PLAYER_EMOTE_Y = -132;
const CAMERA_FOLLOW_LERP = 0.1;

type CafeSceneCallbacks = {
	onMovement: (
		x: number,
		y: number,
		direction: CafeDirection,
		moving: boolean,
		sequence: number
	) => void;
	onInteract: (targetId: string) => void;
	onInteractionTargetChange: (targetId: string | null) => void;
};

type PlayerVisual = {
	container: Phaser.GameObjects.Container;
	accent: Phaser.GameObjects.Graphics;
	sprite: Phaser.GameObjects.Sprite;
	accessories: Phaser.GameObjects.Graphics;
	label: Phaser.GameObjects.Text;
	targetX: number;
	targetY: number;
	direction: CafeDirection;
	moving: boolean;
	color: string;
	carriedTea: number;
	carriedOrderId: string | null;
	equippedCosmetic: string | null;
};

type DirectionInput = { x: number; y: number };

export class CafeScene extends Phaser.Scene {
	private readonly callbacks: CafeSceneCallbacks;
	private readonly showCollisionDebug: boolean;
	private readonly playerVisuals = new Map<string, PlayerVisual>();
	private readonly teaVisuals = new Map<string, Phaser.GameObjects.Container>();
	private readonly tableOrderVisuals = new Map<string, Phaser.GameObjects.Container>();
	private room: CafeRoomState | null = null;
	private selfPlayerId: string | null = null;
	private localVisual: PlayerVisual | null = null;
	private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
	private wasd?: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
	private virtualInput: DirectionInput = { x: 0, y: 0 };
	private inputEnabled = true;
	private interactionTarget: string | null = null;
	private movementSequence = 0;
	private lastMovementSentAt = 0;
	private lastMoving = false;
	private hasLocalPosition = false;
	private background?: Phaser.GameObjects.Image;
	private aiko?: Phaser.GameObjects.Image;
	private aikoQuestMarker?: Phaser.GameObjects.Container;
	private collisionDebug?: Phaser.GameObjects.Graphics;
	private appliedMapVersion: string | null = null;

	constructor(callbacks: CafeSceneCallbacks, showCollisionDebug = false) {
		super("aiko-cafe");
		this.callbacks = callbacks;
		this.showCollisionDebug = showCollisionDebug;
	}

	preload() {
		this.load.image("cafe-room", "/images/aiko-cafe/cafe-room-v1.png");
		this.load.image("aiko-host", "/images/aiko-cafe/aiko-host-v1.png");
		this.load.spritesheet(CAFE_PLAYER_SPRITE_KEY, CAFE_PLAYER_SPRITE_URL, {
			frameWidth: CAFE_PLAYER_FRAME_SIZE,
			frameHeight: CAFE_PLAYER_FRAME_SIZE
		});
	}

	create() {
		this.background = this.add.image(0, 0, "cafe-room").setOrigin(0).setVisible(false);
		this.aiko = this.add
			.image(0, 0, "aiko-host")
			.setOrigin(0.5, 0.9)
			.setDisplaySize(112, 168)
			.setDepth(420)
			.setVisible(false);
		const markerBackground = this.add.graphics();
		markerBackground.fillStyle(0x6f431c, 0.96).fillCircle(0, 0, 19);
		markerBackground.lineStyle(3, 0xfff4d2, 1).strokeCircle(0, 0, 19);
		const markerLabel = this.add
			.text(0, -1, "!", {
				fontFamily: "sans-serif",
				fontSize: "24px",
				fontStyle: "bold",
				color: "#ffffff"
			})
			.setOrigin(0.5);
		this.aikoQuestMarker = this.add
			.container(0, 0, [markerBackground, markerLabel])
			.setDepth(2200)
			.setVisible(false);
		if (this.showCollisionDebug) {
			this.collisionDebug = this.add.graphics().setDepth(5000);
		}

		if (this.input.keyboard) {
			this.cursors = this.input.keyboard.createCursorKeys();
			this.wasd = this.input.keyboard.addKeys("W,A,S,D") as Record<
				"W" | "A" | "S" | "D",
				Phaser.Input.Keyboard.Key
			>;
		}
		if (this.room) {
			this.renderRoom(this.room);
		}
	}

	update(time: number, delta: number) {
		if (!this.room || !this.localVisual) {
			return;
		}
		this.updateHostVisuals(time);

		const input = this.inputEnabled ? this.readDirectionInput() : { x: 0, y: 0 };
		const moving = input.x !== 0 || input.y !== 0;
		let direction = this.localVisual.direction;
		if (moving) {
			const length = Math.hypot(input.x, input.y) || 1;
			const normalizedX = input.x / length;
			const normalizedY = input.y / length;
			const distance = (PLAYER_SPEED * delta) / 1000;
			const nextX = this.localVisual.container.x + normalizedX * distance;
			const nextY = this.localVisual.container.y + normalizedY * distance;
			this.moveLocalPlayer(nextX, nextY);
			direction = directionFromVector(normalizedX, normalizedY, direction);
		}
		this.localVisual.direction = direction;
		this.localVisual.moving = moving;

		if (
			this.inputEnabled &&
			(time - this.lastMovementSentAt >= 80 || moving !== this.lastMoving)
		) {
			this.lastMovementSentAt = time;
			this.lastMoving = moving;
			this.movementSequence += 1;
			this.callbacks.onMovement(
				this.localVisual.container.x,
				this.localVisual.container.y,
				direction,
				moving,
				this.movementSequence
			);
		}

		for (const [playerId, visual] of this.playerVisuals) {
			if (playerId !== this.selfPlayerId) {
				visual.container.x = Phaser.Math.Linear(visual.container.x, visual.targetX, 0.22);
				visual.container.y = Phaser.Math.Linear(visual.container.y, visual.targetY, 0.22);
			}
			redrawPlayer(visual, time);
			visual.container.setDepth(Math.round(visual.container.y) + 500);
		}

		if (this.inputEnabled) {
			this.updateInteractionTarget();
		} else {
			this.changeInteractionTarget(null);
		}
		this.drawCollisionDebug();
	}

	applyRoomState(room: CafeRoomState, selfPlayerId: string | null, resetLocalPosition = false) {
		if (resetLocalPosition) {
			this.hasLocalPosition = false;
		}
		this.room = room;
		this.selfPlayerId = selfPlayerId;
		if (this.sys.isActive()) {
			this.renderRoom(room);
		}
	}

	setVirtualInput(input: DirectionInput) {
		this.virtualInput = this.inputEnabled ? input : { x: 0, y: 0 };
	}

	setInputEnabled(enabled: boolean) {
		this.inputEnabled = enabled;
		if (!enabled) {
			this.virtualInput = { x: 0, y: 0 };
			this.lastMoving = false;
			this.changeInteractionTarget(null);
		}
	}

	setInteractionTarget(targetId: string | null) {
		this.changeInteractionTarget(targetId);
	}

	interactNearest() {
		if (this.interactionTarget) {
			this.callbacks.onInteract(this.interactionTarget);
		}
	}

	showEmote(emote: CafeEmote) {
		if (!this.sys.isActive()) {
			return;
		}
		const visual = this.playerVisuals.get(emote.playerId);
		if (!visual) {
			return;
		}
		const label = this.add
			.text(
				visual.container.x,
				visual.container.y + PLAYER_EMOTE_Y,
				emoteGlyph(emote.emote),
				{
					fontFamily: "sans-serif",
					fontSize: "30px",
					stroke: "#ffffff",
					strokeThickness: 5
				}
			)
			.setOrigin(0.5)
			.setDepth(2000);
		this.tweens.add({
			targets: label,
			y: label.y - 26,
			alpha: 0,
			duration: 1800,
			ease: "Sine.easeOut",
			onComplete: () => label.destroy()
		});
	}

	private renderRoom(room: CafeRoomState) {
		this.applyMapLayout(room.mapLayout);
		const activePlayerIds = new Set(room.players.map((player) => player.id));
		for (const [playerId, visual] of this.playerVisuals) {
			if (!activePlayerIds.has(playerId)) {
				visual.container.destroy(true);
				this.playerVisuals.delete(playerId);
			}
		}

		for (const player of room.players) {
			const visual = this.playerVisuals.get(player.id) ?? this.createPlayer(player);
			visual.targetX = player.x;
			visual.targetY = player.y;
			visual.direction = player.direction;
			visual.moving = player.moving;
			visual.carriedTea = player.carriedTea;
			visual.carriedOrderId = player.carriedOrderId;
			visual.equippedCosmetic = player.equippedCosmetic;
			visual.label.setText(player.name).setY(playerLabelY(player.equippedCosmetic));
			if (player.id === this.selfPlayerId) {
				this.localVisual = visual;
				if (!this.hasLocalPosition) {
					visual.container.setPosition(player.x, player.y);
					this.hasLocalPosition = true;
					this.cameras.main.startFollow(
						visual.container,
						true,
						CAMERA_FOLLOW_LERP,
						CAMERA_FOLLOW_LERP
					);
					this.updateCameraFraming();
				}
			}
		}

		const activeLeafIds = new Set(room.activity.teaLeaves.map((leaf) => leaf.id));
		for (const [leafId, visual] of this.teaVisuals) {
			if (!activeLeafIds.has(leafId)) {
				visual.destroy(true);
				this.teaVisuals.delete(leafId);
			}
		}
		for (const leaf of room.activity.teaLeaves) {
			const visual =
				this.teaVisuals.get(leaf.id) ?? this.createTeaLeaf(leaf.id, leaf.x, leaf.y);
			visual.setVisible(leaf.available);
		}
		const activeOrderIds = new Set(room.activity.tableOrders.map((order) => order.id));
		for (const [orderId, visual] of this.tableOrderVisuals) {
			if (!activeOrderIds.has(orderId)) {
				visual.destroy(true);
				this.tableOrderVisuals.delete(orderId);
			}
		}
		for (const order of room.activity.tableOrders) {
			const visual =
				this.tableOrderVisuals.get(order.id) ??
				this.createTableOrder(order.id, order.x, order.y, order.drink);
			visual.setVisible(order.status !== "served");
			visual.setAlpha(
				order.status === "waiting_ingredient"
					? 0.28
					: order.status === "available" || order.claimedBy === this.selfPlayerId
						? 1
						: 0.46
			);
			visual.setScale(order.claimedBy === this.selfPlayerId ? 1.12 : 1);
		}
		const selfPlayer = room.players.find((player) => player.id === this.selfPlayerId);
		this.aikoQuestMarker?.setVisible(
			!room.activity.completed &&
				(room.activity.id === "tea_delivery"
					? (selfPlayer?.carriedTea ?? 0) > 0
					: !selfPlayer?.carriedOrderId &&
						((room.activity.id === "cafe_rush" && (selfPlayer?.carriedTea ?? 0) > 0) ||
							room.activity.tableOrders.some(
								(order) => order.status === "available"
							)))
		);
		if (this.aiko) {
			this.aiko.setTint(room.activity.completed ? 0xfff2b8 : 0xffffff);
		}
		if (this.inputEnabled) {
			this.updateInteractionTarget();
		} else {
			this.changeInteractionTarget(null);
		}
	}

	private createPlayer(player: CafePlayerState): PlayerVisual {
		const accent = this.add.graphics();
		const sprite = this.add
			.sprite(0, 0, CAFE_PLAYER_SPRITE_KEY, cafePlayerFrame(player.direction, false, 0))
			.setOrigin(0.5, CAFE_PLAYER_ORIGIN_Y)
			.setDisplaySize(CAFE_PLAYER_DISPLAY_SIZE, CAFE_PLAYER_DISPLAY_SIZE);
		const accessories = this.add.graphics();
		const label = this.add
			.text(0, playerLabelY(player.equippedCosmetic), player.name, {
				fontFamily: "sans-serif",
				fontSize: "14px",
				fontStyle: "bold",
				color: "#2f2430",
				backgroundColor: "rgba(255,255,255,0.86)",
				padding: { x: 7, y: 3 }
			})
			.setOrigin(0.5);
		const container = this.add.container(player.x, player.y, [
			accent,
			sprite,
			accessories,
			label
		]);
		const visual: PlayerVisual = {
			container,
			accent,
			sprite,
			accessories,
			label,
			targetX: player.x,
			targetY: player.y,
			direction: player.direction,
			moving: player.moving,
			color: player.color,
			carriedTea: player.carriedTea,
			carriedOrderId: player.carriedOrderId,
			equippedCosmetic: player.equippedCosmetic
		};
		this.playerVisuals.set(player.id, visual);
		redrawPlayer(visual, 0);
		return visual;
	}

	private createTeaLeaf(id: string, x: number, y: number) {
		const glow = this.add.graphics();
		glow.fillStyle(0xfff7d5, 0.82).fillCircle(0, 0, 22);
		glow.lineStyle(3, 0xffffff, 0.9).strokeCircle(0, 0, 18);
		const leaf = this.add.graphics();
		leaf.fillStyle(0x5f8f55, 1).fillEllipse(-5, 0, 14, 24);
		leaf.fillStyle(0x7cad64, 1).fillEllipse(6, -2, 14, 24);
		leaf.lineStyle(2, 0x315c39, 1).lineBetween(0, 12, 0, -12);
		const marker = this.add
			.text(0, -39, "🍃", {
				fontFamily: "sans-serif",
				fontSize: "22px",
				backgroundColor: "rgba(34, 73, 42, 0.92)",
				padding: { x: 5, y: 3 }
			})
			.setOrigin(0.5);
		const container = this.add
			.container(x, y, [glow, leaf, marker])
			.setDepth(Math.round(y) + 420);
		this.tweens.add({
			targets: container,
			y: y - 6,
			duration: 900,
			yoyo: true,
			repeat: -1,
			ease: "Sine.easeInOut",
			delay: this.teaVisuals.size * 160
		});
		this.teaVisuals.set(id, container);
		return container;
	}

	private createTableOrder(id: string, x: number, y: number, drink: string) {
		const background = this.add.graphics();
		background.fillStyle(0x503b35, 0.94).fillRoundedRect(-28, -24, 56, 48, 14);
		background.lineStyle(3, 0xfff4d2, 1).strokeRoundedRect(-28, -24, 56, 48, 14);
		const label = this.add
			.text(0, -1, drinkGlyph(drink), {
				fontFamily: "sans-serif",
				fontSize: "24px"
			})
			.setOrigin(0.5);
		const container = this.add
			.container(x, y - 54, [background, label])
			.setDepth(Math.round(y) + 1300);
		this.tweens.add({
			targets: container,
			y: y - 61,
			duration: 820,
			yoyo: true,
			repeat: -1,
			ease: "Sine.easeInOut",
			delay: this.tableOrderVisuals.size * 140
		});
		this.tableOrderVisuals.set(id, container);
		return container;
	}

	private readDirectionInput(): DirectionInput {
		const keyboardX =
			(this.cursors?.right.isDown || this.wasd?.D.isDown ? 1 : 0) -
			(this.cursors?.left.isDown || this.wasd?.A.isDown ? 1 : 0);
		const keyboardY =
			(this.cursors?.down.isDown || this.wasd?.S.isDown ? 1 : 0) -
			(this.cursors?.up.isDown || this.wasd?.W.isDown ? 1 : 0);
		return keyboardX || keyboardY ? { x: keyboardX, y: keyboardY } : this.virtualInput;
	}

	private moveLocalPlayer(nextX: number, nextY: number) {
		if (!this.localVisual || !this.room) {
			return;
		}
		const resolved = resolveCafeMovement(
			this.room.mapLayout,
			{ x: this.localVisual.container.x, y: this.localVisual.container.y },
			{ x: nextX, y: nextY }
		);
		this.localVisual.container.setPosition(resolved.x, resolved.y);
	}

	private updateInteractionTarget() {
		if (!this.room || !this.localVisual) {
			return;
		}
		const localPosition = new Phaser.Math.Vector2(
			this.localVisual.container.x,
			this.localVisual.container.y
		);
		let nextTarget: string | null = null;
		const selfPlayer = this.room.players.find((player) => player.id === this.selfPlayerId);
		if (
			this.room.activity.id === "tea_delivery" ||
			(this.room.activity.id === "cafe_rush" && !selfPlayer?.carriedOrderId)
		) {
			let nearestDistance = Number.POSITIVE_INFINITY;
			for (const leaf of this.room.activity.teaLeaves) {
				if (!leaf.available) {
					continue;
				}
				const distance = Phaser.Math.Distance.Between(
					localPosition.x,
					localPosition.y,
					leaf.x,
					leaf.y
				);
				if (
					distance <= this.room.mapLayout.interactionRadius &&
					distance < nearestDistance
				) {
					nextTarget = leaf.id;
					nearestDistance = distance;
				}
			}
			const counterDistance = Phaser.Math.Distance.Between(
				localPosition.x,
				localPosition.y,
				this.room.aiko.x,
				this.room.aiko.y
			);
			const canUseCounter =
				this.room.activity.id === "tea_delivery" ||
				(selfPlayer?.carriedTea ?? 0) > 0 ||
				this.room.activity.tableOrders.some((order) => order.status === "available");
			if (
				canUseCounter &&
				counterDistance <= this.room.mapLayout.hostInteractionRadius &&
				counterDistance < nearestDistance
			) {
				nextTarget = this.room.activity.id === "cafe_rush" ? "service-counter" : "aiko";
			}
		} else if (selfPlayer?.carriedOrderId) {
			const order = this.room.activity.tableOrders.find(
				(candidate) =>
					candidate.id === selfPlayer.carriedOrderId &&
					candidate.status === "claimed" &&
					candidate.claimedBy === this.selfPlayerId
			);
			if (
				order &&
				Phaser.Math.Distance.Between(localPosition.x, localPosition.y, order.x, order.y) <=
					this.room.mapLayout.interactionRadius
			) {
				nextTarget = order.id;
			}
		} else if (
			(this.room.activity.id === "cafe_rush" && (selfPlayer?.carriedTea ?? 0) > 0) ||
			this.room.activity.tableOrders.some((order) => order.status === "available")
		) {
			const counterDistance = Phaser.Math.Distance.Between(
				localPosition.x,
				localPosition.y,
				this.room.aiko.x,
				this.room.aiko.y
			);
			if (counterDistance <= this.room.mapLayout.hostInteractionRadius) {
				nextTarget = "service-counter";
			}
		}
		this.changeInteractionTarget(nextTarget);
	}

	private changeInteractionTarget(nextTarget: string | null) {
		if (nextTarget === this.interactionTarget) {
			return;
		}
		if (this.interactionTarget?.startsWith("tea-")) {
			this.teaVisuals.get(this.interactionTarget)?.setScale(1);
		}
		if (this.interactionTarget?.startsWith("order-")) {
			this.tableOrderVisuals.get(this.interactionTarget)?.setScale(1.12);
		}
		this.interactionTarget = nextTarget;
		if (nextTarget?.startsWith("tea-")) {
			this.teaVisuals.get(nextTarget)?.setScale(1.16);
		}
		if (nextTarget?.startsWith("order-")) {
			this.tableOrderVisuals.get(nextTarget)?.setScale(1.24);
		}
		this.callbacks.onInteractionTargetChange(nextTarget);
	}

	private updateCameraFraming() {
		if (!this.room) {
			return;
		}
		const framing = calculateCafeCameraFraming(
			this.scale.width,
			this.scale.height,
			this.room.mapLayout.width,
			this.room.mapLayout.height
		);
		this.cameras.main.setZoom(framing.zoom);
		this.cameras.main.setDeadzone(framing.deadZoneWidth, framing.deadZoneHeight);
	}

	private applyMapLayout(layout: CafeMapLayout) {
		if (this.appliedMapVersion === layout.version) {
			return;
		}
		this.appliedMapVersion = layout.version;
		this.cameras.main.setBounds(0, 0, layout.width, layout.height);
		this.background?.setDisplaySize(layout.width, layout.height).setVisible(true);
		this.updateCameraFraming();
	}

	private updateHostVisuals(time: number) {
		if (!this.room) {
			return;
		}
		const hostBob = Math.sin(time / 900) * 2;
		this.aiko?.setPosition(this.room.aiko.x, this.room.aiko.y + hostBob).setVisible(true);
		if (this.aikoQuestMarker?.visible) {
			const markerBob = Math.sin(time / 350) * 4;
			this.aikoQuestMarker.setPosition(this.room.aiko.x, this.room.aiko.y - 160 + markerBob);
		}
	}

	private drawCollisionDebug() {
		if (!this.collisionDebug || !this.room) {
			return;
		}
		const layout = this.room.mapLayout;
		this.collisionDebug.clear();
		this.collisionDebug.fillStyle(0xff315c, 0.2);
		this.collisionDebug.lineStyle(2, 0xff315c, 0.95);
		for (const collider of layout.colliders) {
			this.collisionDebug.fillRect(collider.x, collider.y, collider.width, collider.height);
			this.collisionDebug.strokeRect(collider.x, collider.y, collider.width, collider.height);
		}
		this.collisionDebug.fillStyle(0xffc857, 0.9);
		for (const target of layout.interactionTargets) {
			this.collisionDebug.fillCircle(target.x, target.y, 6);
		}
		if (this.localVisual) {
			this.collisionDebug.lineStyle(2, 0x42e695, 1);
			this.collisionDebug.strokeCircle(
				this.localVisual.container.x,
				this.localVisual.container.y,
				layout.playerCollisionRadius
			);
		}
	}
}

function directionFromVector(x: number, y: number, fallback: CafeDirection): CafeDirection {
	if (Math.abs(x) > Math.abs(y)) {
		return x > 0 ? "right" : "left";
	}
	if (Math.abs(y) > 0.01) {
		return y > 0 ? "down" : "up";
	}
	return fallback;
}

function redrawPlayer(visual: PlayerVisual, time: number) {
	const color = Phaser.Display.Color.HexStringToColor(visual.color).color;
	const frame = cafePlayerFrame(visual.direction, visual.moving, time);
	visual.sprite.setFrame(frame).setX(cafePlayerFrameOffsetX(frame));
	visual.accent.clear();
	visual.accent.fillStyle(0x3b2b34, 0.18).fillEllipse(0, 3, 52, 16);
	visual.accent.lineStyle(4, color, 0.9).strokeEllipse(0, 3, 47, 13);
	visual.accessories.clear();
	drawEquippedCosmetic(visual.accessories, visual.equippedCosmetic, visual.direction);
	if (visual.carriedOrderId) {
		drawCarriedDrink(visual.accessories);
	} else if (visual.carriedTea > 0) {
		drawCarriedTea(visual.accessories, visual.carriedTea);
	}
}

function drawEquippedCosmetic(
	graphics: Phaser.GameObjects.Graphics,
	cosmeticId: string | null,
	direction: CafeDirection
) {
	switch (cosmeticId) {
		case "sakura_pin":
			graphics.fillStyle(0xff9eb5, 1);
			graphics
				.fillCircle(cosmeticSide(direction) + 5, -78, 5)
				.fillCircle(cosmeticSide(direction), -83, 5)
				.fillCircle(cosmeticSide(direction) - 5, -78, 5)
				.fillCircle(cosmeticSide(direction), -73, 5);
			graphics.fillStyle(0xffe4a8, 1).fillCircle(cosmeticSide(direction), -78, 3.5);
			break;
		case "mint_scarf":
			drawMintScarf(graphics, direction);
			break;
		case "tea_hat":
			graphics.fillStyle(0x6f9f62, 1).fillEllipse(0, -91, 55, 12);
			graphics.fillStyle(0x88b978, 1).fillRoundedRect(-17, -106, 34, 17, 6);
			graphics.lineStyle(2, 0xfff1c9, 0.92).strokeRoundedRect(-17, -106, 34, 17, 6);
			graphics.fillStyle(0xffd98d, 1).fillCircle(11, -97, 3);
			break;
		case "cafe_apron":
			drawCafeApron(graphics, direction);
			break;
	}
}

function drawMintScarf(graphics: Phaser.GameObjects.Graphics, direction: CafeDirection) {
	const mint = 0x79c9a4;
	const shadow = 0x4f9f7a;
	const highlight = 0xe8fff2;

	if (direction === "up") {
		graphics.fillStyle(shadow, 0.95);
		graphics.fillTriangle(-7, -46, -1, -46, -5, -33);
		graphics.fillStyle(mint, 1);
		graphics.fillTriangle(0, -46, 6, -46, 4, -35);
		graphics.fillEllipse(0, -49, 27, 9);
		graphics.lineStyle(2, shadow, 0.9).strokeEllipse(0, -49, 27, 9);
		graphics.lineStyle(1, highlight, 0.8).lineBetween(-8, -51, 8, -51);
		return;
	}

	if (direction === "left" || direction === "right") {
		const facing = direction === "left" ? -1 : 1;
		const knotX = facing * 8;

		graphics.fillStyle(shadow, 0.96);
		graphics.fillTriangle(
			knotX - facing * 2,
			-46,
			knotX + facing * 3,
			-45,
			knotX - facing,
			-31
		);
		graphics.fillStyle(mint, 1).fillEllipse(0, -50, 23, 9);
		graphics.lineStyle(2, shadow, 0.9).strokeEllipse(0, -50, 23, 9);
		graphics.fillStyle(shadow, 1).fillCircle(knotX, -46, 4);
		graphics.fillStyle(highlight, 0.78).fillCircle(knotX - facing, -47, 1.4);
		return;
	}

	graphics.fillStyle(shadow, 0.96);
	graphics.fillTriangle(4, -46, 10, -45, 7, -30);
	graphics.fillStyle(mint, 1);
	graphics.fillTriangle(8, -45, 14, -44, 12, -34);
	graphics.fillEllipse(0, -51, 28, 10);
	graphics.lineStyle(2, shadow, 0.9).strokeEllipse(0, -51, 28, 10);
	graphics.fillStyle(shadow, 1).fillCircle(8, -46, 4.5);
	graphics.fillStyle(highlight, 0.82).fillCircle(7, -47, 1.5);
}

function drawCafeApron(graphics: Phaser.GameObjects.Graphics, direction: CafeDirection) {
	const pink = 0xf3b2bd;
	const highlight = 0xfff4e3;
	const outline = 0xd98fa2;

	if (direction === "up") {
		graphics.fillStyle(pink, 0.78).fillRoundedRect(-14, -24, 28, 5, 2);
		graphics.lineStyle(2, outline, 0.82).strokeRoundedRect(-14, -24, 28, 5, 2);
		graphics.fillStyle(pink, 0.84);
		graphics.fillTriangle(-2, -21, -12, -27, -11, -16);
		graphics.fillTriangle(2, -21, 12, -27, 11, -16);
		graphics.fillStyle(highlight, 0.9).fillCircle(0, -21, 3);
		return;
	}

	if (direction === "left" || direction === "right") {
		const facing = direction === "left" ? -1 : 1;
		const front = facing * 5;
		const y = -5;
		graphics.lineStyle(2, pink, 0.82);
		graphics.lineBetween(-front, -42 + y, front, -36 + y);
		graphics.fillStyle(pink, 0.72).fillRoundedRect(front - 6, -37 + y, 12, 12, 4);
		graphics.lineStyle(2, outline, 0.82).strokeRoundedRect(front - 6, -37 + y, 12, 12, 4);
		graphics.fillStyle(pink, 0.76).fillRoundedRect(-12, -25 + y, 24, 4, 2);
		graphics.fillTriangle(-10, -21 + y, 10, -21 + y, front + facing * 11, -8 + y);
		graphics.fillTriangle(-10, -21 + y, front + facing * 11, -8 + y, -front, -8 + y);
		graphics.lineStyle(2, outline, 0.82);
		graphics.lineBetween(10, -21 + y, front + facing * 11, -8 + y);
		graphics.lineBetween(front + facing * 11, -8 + y, -front, -8 + y);
		return;
	}

	const y = -9;
	graphics.lineStyle(2, pink, 0.82);
	graphics.lineBetween(-12, -43 + y, -6, -37 + y);
	graphics.lineBetween(12, -43 + y, 6, -37 + y);
	graphics.fillStyle(pink, 0.7).fillRoundedRect(-7, -38 + y, 14, 13, 4);
	graphics.lineStyle(2, outline, 0.82).strokeRoundedRect(-7, -38 + y, 14, 13, 4);
	graphics.fillStyle(pink, 0.76).fillRoundedRect(-14, -25 + y, 28, 4, 2);
	graphics.fillTriangle(-12, -21 + y, 12, -21 + y, -17, -8 + y);
	graphics.fillTriangle(12, -21 + y, 17, -8 + y, -17, -8 + y);
	graphics.lineStyle(2, outline, 0.82);
	graphics.lineBetween(-12, -21 + y, 12, -21 + y);
	graphics.lineBetween(12, -21 + y, 17, -8 + y);
	graphics.lineBetween(17, -8 + y, -17, -8 + y);
	graphics.lineBetween(-17, -8 + y, -12, -21 + y);
	graphics.lineStyle(2, highlight, 0.88).strokeRoundedRect(-5, -17 + y, 10, 6, 2);
}

function drawCarriedDrink(graphics: Phaser.GameObjects.Graphics) {
	graphics.fillStyle(0xfff7e0, 1).fillRoundedRect(25, -50, 19, 16, 5);
	graphics.lineStyle(2, 0x8a6651, 1).strokeRoundedRect(25, -50, 19, 16, 5);
	graphics.lineStyle(3, 0x8a6651, 1).strokeCircle(46, -42, 6);
	graphics.fillStyle(0x8ec9a7, 1).fillRect(29, -46, 11, 3);
}

function drawCarriedTea(graphics: Phaser.GameObjects.Graphics, count: number) {
	for (let index = 0; index < Math.min(3, count); index += 1) {
		const x = 31 + index * 5;
		const y = -43 - index * 6;
		graphics.fillStyle(index % 2 === 0 ? 0x5f8f55 : 0x7cad64, 1);
		graphics.fillEllipse(x, y, 14, 23);
		graphics.lineStyle(2, 0x315c39, 1).lineBetween(x, y + 10, x, y - 10);
	}
}

function cosmeticSide(direction: CafeDirection) {
	if (direction === "left") return -19;
	if (direction === "right") return 19;
	return 17;
}

function playerLabelY(cosmeticId: string | null) {
	return cosmeticId ? PLAYER_LABEL_WITH_COSMETIC_Y : PLAYER_LABEL_Y;
}

function emoteGlyph(emote: string) {
	switch (emote) {
		case "wave":
			return "👋";
		case "heart":
			return "💗";
		case "tea":
			return "🍵";
		default:
			return "✨";
	}
}

function drinkGlyph(drink: string) {
	switch (drink) {
		case "sakura":
			return "🌸";
		case "mint":
			return "🌿";
		default:
			return "🍵";
	}
}
