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

const PLAYER_SPEED = 210;
const PLAYER_LABEL_Y = -58;
const PLAYER_LABEL_WITH_COSMETIC_Y = -88;
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
	graphics: Phaser.GameObjects.Graphics;
	label: Phaser.GameObjects.Text;
	targetX: number;
	targetY: number;
	direction: CafeDirection;
	moving: boolean;
	color: string;
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
			.text(visual.container.x, visual.container.y - 76, emoteGlyph(emote.emote), {
				fontFamily: "sans-serif",
				fontSize: "30px",
				stroke: "#ffffff",
				strokeThickness: 5
			})
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
				order.status === "available" || order.claimedBy === this.selfPlayerId ? 1 : 0.46
			);
			visual.setScale(order.claimedBy === this.selfPlayerId ? 1.12 : 1);
		}
		const selfPlayer = room.players.find((player) => player.id === this.selfPlayerId);
		this.aikoQuestMarker?.setVisible(
			!room.activity.completed &&
				(room.activity.id === "tea_delivery"
					? (selfPlayer?.carriedTea ?? 0) > 0
					: !selfPlayer?.carriedOrderId &&
						room.activity.tableOrders.some((order) => order.status === "available"))
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
		const graphics = this.add.graphics();
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
		const container = this.add.container(player.x, player.y, [graphics, label]);
		const visual: PlayerVisual = {
			container,
			graphics,
			label,
			targetX: player.x,
			targetY: player.y,
			direction: player.direction,
			moving: player.moving,
			color: player.color,
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
		if (this.room.activity.id === "tea_delivery") {
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
			const aikoDistance = Phaser.Math.Distance.Between(
				localPosition.x,
				localPosition.y,
				this.room.aiko.x,
				this.room.aiko.y
			);
			if (
				aikoDistance <= this.room.mapLayout.hostInteractionRadius &&
				aikoDistance < nearestDistance
			) {
				nextTarget = "aiko";
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
		} else if (this.room.activity.tableOrders.some((order) => order.status === "available")) {
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
	const graphics = visual.graphics;
	const color = Phaser.Display.Color.HexStringToColor(visual.color).color;
	const step = visual.moving ? Math.sin(time / 90) * 4 : 0;
	graphics.clear();
	graphics.fillStyle(0x3b2b34, 0.2).fillEllipse(0, 20, 50, 20);
	graphics.fillStyle(0x3c3444, 1);
	graphics.fillRoundedRect(-14 + step, 9, 11, 22, 5);
	graphics.fillRoundedRect(3 - step, 9, 11, 22, 5);
	graphics.fillStyle(color, 1).fillRoundedRect(-22, -19, 44, 45, 15);
	graphics.lineStyle(3, 0xffffff, 0.84).strokeRoundedRect(-22, -19, 44, 45, 15);
	graphics.fillStyle(0xf5c9b8, 1).fillCircle(0, -28, 22);
	graphics.fillStyle(0x232437, 1).fillEllipse(0, -36, 45, 26);
	graphics.fillStyle(0x232437, 1).fillRoundedRect(-22, -37, 10, 26, 5);
	graphics.fillRoundedRect(12, -37, 10, 26, 5);
	if (visual.direction === "down") {
		graphics.fillStyle(0x353052, 1).fillCircle(-7, -27, 2.4).fillCircle(7, -27, 2.4);
	}
	graphics.fillStyle(0xffffff, 0.88).fillCircle(-14, 0, 4);
	drawEquippedCosmetic(graphics, visual.equippedCosmetic);
	if (visual.carriedOrderId) {
		graphics.fillStyle(0xfff7e0, 1).fillRoundedRect(16, -5, 17, 14, 5);
		graphics.lineStyle(2, 0x8a6651, 1).strokeRoundedRect(16, -5, 17, 14, 5);
		graphics.lineStyle(3, 0x8a6651, 1).strokeCircle(34, 2, 6);
		graphics.fillStyle(0x8ec9a7, 1).fillRect(20, -1, 9, 3);
	}
}

function drawEquippedCosmetic(graphics: Phaser.GameObjects.Graphics, cosmeticId: string | null) {
	switch (cosmeticId) {
		case "sakura_pin":
			graphics.fillStyle(0xff9eb5, 1);
			graphics
				.fillCircle(17, -43, 5)
				.fillCircle(12, -47, 5)
				.fillCircle(8, -42, 5)
				.fillCircle(12, -37, 5);
			graphics.fillStyle(0xffe4a8, 1).fillCircle(12, -42, 3.5);
			break;
		case "mint_scarf":
			graphics.fillStyle(0x79c9a4, 1).fillRoundedRect(-19, -15, 38, 9, 4);
			graphics.fillStyle(0x5ba985, 1).fillRoundedRect(8, -9, 9, 22, 4);
			graphics.lineStyle(2, 0xe8fff2, 0.86).strokeRoundedRect(-19, -15, 38, 9, 4);
			break;
		case "tea_hat":
			graphics.fillStyle(0x6f9f62, 1).fillEllipse(0, -57, 48, 11);
			graphics.fillStyle(0x88b978, 1).fillRoundedRect(-15, -70, 30, 16, 6);
			graphics.lineStyle(2, 0xfff1c9, 0.92).strokeRoundedRect(-15, -70, 30, 16, 6);
			graphics.fillStyle(0xffd98d, 1).fillCircle(10, -61, 3);
			break;
		case "cafe_apron":
			graphics.fillStyle(0xf3b2bd, 1).fillRoundedRect(-17, -6, 34, 31, 7);
			graphics.lineStyle(2, 0xfff4e3, 0.94).strokeRoundedRect(-17, -6, 34, 31, 7);
			graphics.fillStyle(0xfff4e3, 1).fillRect(-12, 10, 24, 3);
			break;
	}
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
