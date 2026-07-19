import Phaser from "phaser";
import type {
	CafeDirection,
	CafeEmote,
	CafePlayerState,
	CafeRoomState
} from "@/features/cafe/types";

const MAP_WIDTH = 1280;
const MAP_HEIGHT = 800;
const PLAYER_SPEED = 210;
const PLAYER_RADIUS = 22;
const INTERACTION_DISTANCE = 94;
const AIKO_INTERACTION_DISTANCE = 134;
const COLLIDERS = [
	new Phaser.Geom.Rectangle(414, 92, 452, 142),
	new Phaser.Geom.Rectangle(198, 360, 176, 102),
	new Phaser.Geom.Rectangle(906, 360, 176, 102),
	new Phaser.Geom.Rectangle(504, 526, 272, 104)
];

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
};

type DirectionInput = { x: number; y: number };

export class CafeScene extends Phaser.Scene {
	private readonly callbacks: CafeSceneCallbacks;
	private readonly playerVisuals = new Map<string, PlayerVisual>();
	private readonly teaVisuals = new Map<string, Phaser.GameObjects.Container>();
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
	private aiko?: Phaser.GameObjects.Image;
	private aikoQuestMarker?: Phaser.GameObjects.Container;

	constructor(callbacks: CafeSceneCallbacks) {
		super("aiko-cafe");
		this.callbacks = callbacks;
	}

	preload() {
		this.load.image("cafe-room", "/images/aiko-cafe/cafe-room-v1.png");
		this.load.image("aiko-host", "/images/aiko-cafe/aiko-host-v1.png");
	}

	create() {
		this.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
		this.add.image(0, 0, "cafe-room").setOrigin(0).setDisplaySize(MAP_WIDTH, MAP_HEIGHT);
		this.aiko = this.add
			.image(640, 272, "aiko-host")
			.setOrigin(0.5, 0.9)
			.setDisplaySize(112, 168)
			.setDepth(420);
		this.tweens.add({
			targets: this.aiko,
			y: 268,
			duration: 1800,
			yoyo: true,
			repeat: -1,
			ease: "Sine.easeInOut"
		});
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
			.container(640, 112, [markerBackground, markerLabel])
			.setDepth(2200)
			.setVisible(false);
		this.tweens.add({
			targets: this.aikoQuestMarker,
			y: 104,
			duration: 700,
			yoyo: true,
			repeat: -1,
			ease: "Sine.easeInOut"
		});

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
	}

	applyRoomState(room: CafeRoomState, selfPlayerId: string | null, resetLocalPosition = false) {
		if (resetLocalPosition) {
			this.hasLocalPosition = false;
		}
		this.room = room;
		this.selfPlayerId = selfPlayerId;
		if (
			this.interactionTarget?.startsWith("tea-") &&
			!room.activity.teaLeaves.some(
				(leaf) => leaf.id === this.interactionTarget && leaf.available
			)
		) {
			this.changeInteractionTarget(null);
		}
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
			visual.label.setText(player.name);
			if (player.id === this.selfPlayerId) {
				this.localVisual = visual;
				if (!this.hasLocalPosition) {
					visual.container.setPosition(player.x, player.y);
					this.hasLocalPosition = true;
					this.cameras.main.startFollow(visual.container, true, 0.12, 0.12);
					this.updateCameraZoom();
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
		const selfPlayer = room.players.find((player) => player.id === this.selfPlayerId);
		this.aikoQuestMarker?.setVisible(
			!room.activity.completed && (selfPlayer?.carriedTea ?? 0) > 0
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
			.text(0, -58, player.name, {
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
			color: player.color
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
		if (!this.localVisual) {
			return;
		}
		const clampedX = Phaser.Math.Clamp(nextX, PLAYER_RADIUS, MAP_WIDTH - PLAYER_RADIUS);
		const clampedY = Phaser.Math.Clamp(nextY, PLAYER_RADIUS, MAP_HEIGHT - PLAYER_RADIUS);
		if (!collides(clampedX, this.localVisual.container.y)) {
			this.localVisual.container.x = clampedX;
		}
		if (!collides(this.localVisual.container.x, clampedY)) {
			this.localVisual.container.y = clampedY;
		}
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
			if (distance <= INTERACTION_DISTANCE && distance < nearestDistance) {
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
		if (aikoDistance <= AIKO_INTERACTION_DISTANCE && aikoDistance < nearestDistance) {
			nextTarget = "aiko";
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
		this.interactionTarget = nextTarget;
		if (nextTarget?.startsWith("tea-")) {
			this.teaVisuals.get(nextTarget)?.setScale(1.16);
		}
		this.callbacks.onInteractionTargetChange(nextTarget);
	}

	private updateCameraZoom() {
		const width = this.scale.width;
		const zoom = width < 640 ? 1.12 : width < 960 ? 0.9 : 0.78;
		this.cameras.main.setZoom(zoom);
	}
}

function collides(x: number, y: number) {
	return COLLIDERS.some(
		(rectangle) =>
			x + PLAYER_RADIUS > rectangle.left &&
			x - PLAYER_RADIUS < rectangle.right &&
			y + PLAYER_RADIUS > rectangle.top &&
			y - PLAYER_RADIUS < rectangle.bottom
	);
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
