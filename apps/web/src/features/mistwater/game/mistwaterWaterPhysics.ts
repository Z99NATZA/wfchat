const DEFAULT_DAMPING = 0.982;
const TAU = Math.PI * 2;

const AMBIENT_SURFACE_WAVES = [
	{
		directionX: 0.94,
		directionY: 0.34,
		frequency: 1.15,
		speed: 0.032,
		strength: 3.2,
		phase: 0.3
	},
	{
		directionX: 0.58,
		directionY: -0.81,
		frequency: 1.85,
		speed: -0.024,
		strength: 1.8,
		phase: 2.4
	},
	{ directionX: 0.99, directionY: -0.14, frequency: 3.1, speed: 0.046, strength: 0.8, phase: 4.7 }
] as const;

export class MistwaterWaterPhysics {
	readonly width: number;
	readonly height: number;
	private current: Float32Array;
	private previous: Float32Array;
	private next: Float32Array;
	private readonly damping: number;

	constructor(width: number, height: number, damping = DEFAULT_DAMPING) {
		if (width < 3 || height < 3) {
			throw new Error("Mistwater water physics requires at least a 3x3 field");
		}
		this.width = width;
		this.height = height;
		this.damping = damping;
		const cellCount = width * height;
		this.current = new Float32Array(cellCount);
		this.previous = new Float32Array(cellCount);
		this.next = new Float32Array(cellCount);
	}

	disturb(normalizedX: number, normalizedY: number, strength: number, radius = 2) {
		const centerX = Math.round(clamp(normalizedX, 0, 1) * (this.width - 1));
		const centerY = Math.round(clamp(normalizedY, 0, 1) * (this.height - 1));
		const safeRadius = Math.max(1, Math.round(radius));

		for (let y = -safeRadius; y <= safeRadius; y += 1) {
			for (let x = -safeRadius; x <= safeRadius; x += 1) {
				const targetX = centerX + x;
				const targetY = centerY + y;
				if (
					targetX <= 0 ||
					targetX >= this.width - 1 ||
					targetY <= 0 ||
					targetY >= this.height - 1
				) {
					continue;
				}
				const distance = Math.hypot(x, y);
				if (distance > safeRadius) {
					continue;
				}
				const falloff = 0.5 + Math.cos((distance / safeRadius) * Math.PI) * 0.5;
				this.current[targetY * this.width + targetX] += strength * falloff;
			}
		}
	}

	step() {
		this.next.fill(0);
		for (let y = 1; y < this.height - 1; y += 1) {
			for (let x = 1; x < this.width - 1; x += 1) {
				const index = y * this.width + x;
				const neighborWave =
					(this.current[index - 1] +
						this.current[index + 1] +
						this.current[index - this.width] +
						this.current[index + this.width]) *
					0.5;
				this.next[index] = (neighborWave - this.previous[index]) * this.damping;
			}
		}

		const retired = this.previous;
		this.previous = this.current;
		this.current = this.next;
		this.next = retired;
	}

	writeDisplacementMap(pixels: Uint8ClampedArray, ambientTimeSeconds?: number) {
		if (pixels.length !== this.width * this.height * 4) {
			throw new Error("Displacement pixel buffer does not match the water field");
		}

		for (let y = 0; y < this.height; y += 1) {
			for (let x = 0; x < this.width; x += 1) {
				const fieldIndex = y * this.width + x;
				const left = this.current[y * this.width + Math.max(0, x - 1)];
				const right = this.current[y * this.width + Math.min(this.width - 1, x + 1)];
				const up = this.current[Math.max(0, y - 1) * this.width + x];
				const down = this.current[Math.min(this.height - 1, y + 1) * this.width + x];
				const horizontalSlope = right - left;
				const verticalSlope = down - up;
				let ambientNormalX = 0;
				let ambientNormalY = 0;
				if (ambientTimeSeconds !== undefined) {
					const normalizedX = x / (this.width - 1);
					const normalizedY = y / (this.height - 1);
					const aspectRatio = this.width / this.height;
					for (const wave of AMBIENT_SURFACE_WAVES) {
						const phase =
							TAU *
								(wave.frequency *
									(normalizedX * aspectRatio * wave.directionX +
										normalizedY * wave.directionY) -
									ambientTimeSeconds * wave.speed) +
							wave.phase;
						const normal = Math.cos(phase) * wave.strength;
						ambientNormalX += normal * wave.directionX;
						ambientNormalY += normal * wave.directionY;
					}
				}
				const pixelIndex = fieldIndex * 4;
				pixels[pixelIndex] = Math.round(
					clamp(128 + horizontalSlope * 92 + ambientNormalX, 8, 248)
				);
				pixels[pixelIndex + 1] = Math.round(
					clamp(128 + verticalSlope * 92 + ambientNormalY, 8, 248)
				);
				pixels[pixelIndex + 2] = 128;
				pixels[pixelIndex + 3] = 255;
			}
		}
	}

	getHeight(column: number, row: number): number {
		return this.current[row * this.width + column] ?? 0;
	}

	sampleHeight(normalizedX: number, normalizedY: number): number {
		const fieldX = clamp(normalizedX, 0, 1) * (this.width - 1);
		const fieldY = clamp(normalizedY, 0, 1) * (this.height - 1);
		const left = Math.floor(fieldX);
		const top = Math.floor(fieldY);
		const right = Math.min(left + 1, this.width - 1);
		const bottom = Math.min(top + 1, this.height - 1);
		const horizontalMix = fieldX - left;
		const verticalMix = fieldY - top;
		const topHeight = lerp(
			this.current[top * this.width + left],
			this.current[top * this.width + right],
			horizontalMix
		);
		const bottomHeight = lerp(
			this.current[bottom * this.width + left],
			this.current[bottom * this.width + right],
			horizontalMix
		);
		return lerp(topHeight, bottomHeight, verticalMix);
	}

	getPeak(): number {
		let peak = 0;
		for (const value of this.current) {
			peak = Math.max(peak, Math.abs(value));
		}
		return peak;
	}

	reset() {
		this.current.fill(0);
		this.previous.fill(0);
		this.next.fill(0);
	}
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function lerp(start: number, end: number, amount: number): number {
	return start + (end - start) * amount;
}
