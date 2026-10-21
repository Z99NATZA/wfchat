import * as THREE from "three";
import { canWalkSegment, findPath, START, type Point } from "./willowMap";
import {
	createCamera,
	positionCamera,
	CAMERA_YAW,
	terrainHeight,
	toMap,
	toWorld
} from "./willowTerrain";
import {
	disposeWorld,
	makeBench,
	makeMeadow,
	makePond,
	makeRocks,
	makeTerrain,
	makeTraveller,
	makeWoodland
} from "./willowModels";

type WorldCallbacks = {
	onMove: (point: Point) => void;
	onError: () => void;
	reducedMotion: boolean;
};
export const MOVEMENT_KEYS = new Set([
	"ArrowUp",
	"ArrowDown",
	"ArrowLeft",
	"ArrowRight",
	"KeyW",
	"KeyA",
	"KeyS",
	"KeyD"
]);

export default class WillowWorld {
	private scene = new THREE.Scene();
	private camera = createCamera(1);
	private renderer!: THREE.WebGLRenderer;
	private terrain!: ReturnType<typeof makeTerrain>;
	private traveller!: ReturnType<typeof makeTraveller>;
	private canopies: ReturnType<typeof makeWoodland> = [];
	private marker!: THREE.Mesh;
	private sun!: THREE.DirectionalLight;
	private resizeObserver?: ResizeObserver;
	private raycaster = new THREE.Raycaster();
	private position: Point = { ...START };
	private route: Point[] = [];
	private pressed = new Set<string>();
	private target = new THREE.Vector3();
	private wind = { value: 0 };
	private lastTime = 0;
	private lastReport = 0;
	private walkTime = 0;
	private disposed = false;
	private failed = false;
	private pointerStart: { x: number; y: number; id: number } | null = null;

	constructor(
		private host: HTMLElement,
		private callbacks: WorldCallbacks
	) {
		try {
			this.renderer = new THREE.WebGLRenderer({
				antialias: true,
				powerPreference: "high-performance"
			});
			this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
			this.renderer.outputColorSpace = THREE.SRGBColorSpace;
			this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
			this.renderer.toneMappingExposure = 1.08;
			this.renderer.shadowMap.enabled = true;
			this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
			this.renderer.shadowMap.autoUpdate = false;
			this.renderer.shadowMap.needsUpdate = true;
			this.host.appendChild(this.renderer.domElement);
			this.renderer.domElement.addEventListener("webglcontextlost", this.contextLost);
			this.scene.background = new THREE.Color("#cddbc2");
			this.scene.fog = new THREE.Fog("#cddbc2", 28, 64);
			this.scene.add(new THREE.HemisphereLight("#f2f0da", "#536b55", 2.2));
			this.sun = new THREE.DirectionalLight("#fff0cd", 2.7);
			this.sun.position.set(-9, 16, 8);
			this.sun.castShadow = true;
			this.sun.shadow.mapSize.set(2048, 2048);
			Object.assign(this.sun.shadow.camera, {
				left: -22,
				right: 22,
				top: 22,
				bottom: -22,
				near: 0.1,
				far: 65
			});
			this.sun.shadow.camera.updateProjectionMatrix();
			this.sun.shadow.normalBias = 0.035;
			this.sun.shadow.bias = -0.00015;
			this.scene.add(this.sun);
			this.terrain = makeTerrain();
			this.scene.add(this.terrain);
			this.canopies = makeWoodland(this.scene);
			makeMeadow(this.scene, this.wind);
			makeBench(this.scene);
			makeRocks(this.scene);
			makePond(this.scene, this.wind);
			this.traveller = makeTraveller();
			this.scene.add(this.traveller.root);
			this.traveller.root.rotation.y = CAMERA_YAW;
			const point = toWorld(this.position);
			this.traveller.root.position.set(point.x, terrainHeight(point.x, point.z), point.z);
			this.target.copy(this.traveller.root.position).add(new THREE.Vector3(0, 0.8, 0));
			this.marker = new THREE.Mesh(
				new THREE.RingGeometry(0.16, 0.19, 40),
				new THREE.MeshBasicMaterial({
					color: "#fff0c6",
					side: THREE.DoubleSide,
					transparent: true,
					opacity: 0.85,
					depthWrite: false
				})
			);
			this.marker.rotation.x = -Math.PI / 2;
			this.marker.visible = false;
			this.scene.add(this.marker);
			this.resizeObserver = new ResizeObserver(this.resize);
			this.resizeObserver.observe(this.host);
			this.resize();
			this.host.addEventListener("pointerdown", this.pointerDown);
			this.host.addEventListener("pointerup", this.pointerUp);
			this.host.addEventListener("pointercancel", this.pointerCancel);
			this.host.addEventListener("keydown", this.keyDown);
			this.host.addEventListener("keyup", this.keyUp);
			this.host.addEventListener("blur", this.clearKeys);
			window.addEventListener("blur", this.clearKeys);
			document.addEventListener("visibilitychange", this.clearKeys);
			this.report();
			this.fadeCanopies();
			this.renderer.render(this.scene, this.camera);
			this.renderer.setAnimationLoop(this.frame);
		} catch (error) {
			this.dispose();
			throw error;
		}
	}

	private resize = () => {
		if (this.disposed) return;
		const width = Math.max(1, this.host.clientWidth),
			height = Math.max(1, this.host.clientHeight);
		this.camera.aspect = width / height;
		this.camera.updateProjectionMatrix();
		this.renderer.setSize(width, height);
		positionCamera(this.camera, this.target, width < 600);
	};

	private pointerDown = (event: PointerEvent) => {
		if (event.button !== 0) return;
		this.host.focus({ preventScroll: true });
		this.pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
	};

	private pointerCancel = () => {
		this.pointerStart = null;
	};

	private pointerUp = (event: PointerEvent) => {
		const down = this.pointerStart;
		this.pointerStart = null;
		if (
			!down ||
			event.pointerId !== down.id ||
			Math.hypot(event.clientX - down.x, event.clientY - down.y) > 12
		)
			return;
		const rect = this.host.getBoundingClientRect();
		const pointer = new THREE.Vector2(
			((event.clientX - rect.left) / rect.width) * 2 - 1,
			-((event.clientY - rect.top) / rect.height) * 2 + 1
		);
		this.raycaster.setFromCamera(pointer, this.camera);
		const hit = this.raycaster.intersectObject(this.terrain)[0];
		if (!hit) return;
		this.route = findPath(this.position, toMap(hit.point.x, hit.point.z));
		const destination = this.route.at(-1);
		this.marker.visible = Boolean(destination);
		if (destination) {
			const world = toWorld(destination);
			this.marker.position.set(world.x, terrainHeight(world.x, world.z) + 0.03, world.z);
		}
	};

	private keyDown = (event: KeyboardEvent) => {
		if (!MOVEMENT_KEYS.has(event.code) || event.altKey || event.ctrlKey || event.metaKey)
			return;
		event.preventDefault();
		this.pressed.add(event.code);
		this.route = [];
		this.marker.visible = false;
	};

	private keyUp = (event: KeyboardEvent) => {
		this.pressed.delete(event.code);
	};
	private clearKeys = () => {
		this.pressed.clear();
	};

	private frame = (time: number) => {
		if (this.disposed || this.failed) return;
		if (time - this.lastTime < 1000 / 30) return;
		const dt = this.lastTime ? Math.min(0.05, (time - this.lastTime) / 1000) : 0;
		this.lastTime = time;
		if (document.hidden) return;
		const right =
			Number(this.pressed.has("ArrowRight") || this.pressed.has("KeyD")) -
			Number(this.pressed.has("ArrowLeft") || this.pressed.has("KeyA"));
		const down =
			Number(this.pressed.has("ArrowDown") || this.pressed.has("KeyS")) -
			Number(this.pressed.has("ArrowUp") || this.pressed.has("KeyW"));
		const keyboard = right !== 0 || down !== 0;
		let dx = Math.cos(CAMERA_YAW) * right + Math.sin(CAMERA_YAW) * down;
		let dy = -Math.sin(CAMERA_YAW) * right + Math.cos(CAMERA_YAW) * down;
		if (!keyboard && this.route.length) {
			dx = this.route[0].x - this.position.x;
			dy = this.route[0].y - this.position.y;
		}
		const distance = Math.hypot(dx, dy);
		let moving = false;
		if (distance > 0) {
			const step = keyboard ? dt * 140 : Math.min(dt * 140, distance);
			const next = {
				x: this.position.x + (dx / distance) * step,
				y: this.position.y + (dy / distance) * step
			};
			if (canWalkSegment(this.position, next)) {
				this.position = next;
				moving = true;
			} else if (keyboard) {
				const xOnly = { x: next.x, y: this.position.y },
					yOnly = { x: this.position.x, y: next.y };
				if (xOnly.x !== this.position.x && canWalkSegment(this.position, xOnly)) {
					this.position = xOnly;
					moving = true;
				} else if (yOnly.y !== this.position.y && canWalkSegment(this.position, yOnly)) {
					this.position = yOnly;
					moving = true;
				}
			} else {
				this.route = [];
				this.marker.visible = false;
			}
			if (!keyboard && distance <= step + 0.01) this.route.shift();
			if (!this.route.length) this.marker.visible = false;
			if (moving) {
				const angle = Math.atan2(dx, dy);
				const difference = Math.atan2(
					Math.sin(angle - this.traveller.root.rotation.y),
					Math.cos(angle - this.traveller.root.rotation.y)
				);
				this.traveller.root.rotation.y += difference * (1 - Math.exp(-dt * 14));
			}
		}
		this.walkTime = moving ? this.walkTime + dt * 10 : 0;
		this.traveller.legs.forEach(
			(leg, i) =>
				(leg.rotation.x = Math.sin(this.walkTime + i * Math.PI) * (moving ? 0.6 : 0))
		);
		this.traveller.arms.forEach(
			(arm, i) =>
				(arm.rotation.x = Math.sin(this.walkTime + i * Math.PI) * (moving ? -0.4 : 0))
		);
		this.traveller.body.position.y = moving ? Math.abs(Math.sin(this.walkTime)) * 0.035 : 0;
		const world = toWorld(this.position);
		this.traveller.root.position.set(world.x, terrainHeight(world.x, world.z), world.z);
		if (moving) this.renderer.shadowMap.needsUpdate = true;
		const desired = new THREE.Vector3(
			THREE.MathUtils.clamp(world.x, -8, 8),
			terrainHeight(world.x, world.z) + 0.8,
			THREE.MathUtils.clamp(world.z, -6, 6)
		);
		this.target.lerp(desired, 1 - Math.exp(-dt * 5));
		positionCamera(this.camera, this.target, this.host.clientWidth < 600);
		this.wind.value = this.callbacks.reducedMotion ? 0 : time / 1000;
		if (time - this.lastReport > 120) {
			this.report();
			this.fadeCanopies();
			this.lastReport = time;
		}
		this.renderer.render(this.scene, this.camera);
	};

	private fadeCanopies() {
		const head = this.traveller.root.position.clone().add(new THREE.Vector3(0, 1.3, 0));
		const direction = head.clone().sub(this.camera.position);
		const distance = direction.length();
		const ray = new THREE.Ray(this.camera.position, direction.normalize());
		for (const canopy of this.canopies) {
			const along = canopy.center.clone().sub(this.camera.position).dot(direction);
			const occludes =
				along > 0 && along < distance && ray.distanceToPoint(canopy.center) < canopy.radius;
			canopy.mesh.material.opacity = occludes ? 0.22 : 1;
			canopy.mesh.material.depthWrite = !occludes;
			if (canopy.mesh.castShadow === occludes) this.renderer.shadowMap.needsUpdate = true;
			canopy.mesh.castShadow = !occludes;
		}
	}

	private report() {
		this.callbacks.onMove(this.position);
		this.host.dataset.worldHeight = this.traveller.root.position.y.toFixed(3);
	}

	private contextLost = (event: Event) => {
		event.preventDefault();
		this.failed = true;
		this.renderer.setAnimationLoop(null);
		this.clearKeys();
		this.callbacks.onError();
	};

	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.resizeObserver?.disconnect();
		this.host.removeEventListener("pointerdown", this.pointerDown);
		this.host.removeEventListener("pointerup", this.pointerUp);
		this.host.removeEventListener("pointercancel", this.pointerCancel);
		this.host.removeEventListener("keydown", this.keyDown);
		this.host.removeEventListener("keyup", this.keyUp);
		this.host.removeEventListener("blur", this.clearKeys);
		window.removeEventListener("blur", this.clearKeys);
		document.removeEventListener("visibilitychange", this.clearKeys);
		disposeWorld(this.scene);
		this.sun?.shadow.dispose();
		if (this.renderer) {
			this.renderer.setAnimationLoop(null);
			this.renderer.domElement.removeEventListener("webglcontextlost", this.contextLost);
			this.renderer.dispose();
			this.renderer.forceContextLoss();
			this.renderer.domElement.remove();
		}
		this.pressed.clear();
	}
}
