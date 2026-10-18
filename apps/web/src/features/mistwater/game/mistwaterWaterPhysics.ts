const DEFAULT_DAMPING = 0.982;

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

	writeDisplacementMap(pixels: Uint8ClampedArray) {
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
				const slope = (right - left) * 0.68 + (down - up) * 0.32;
				const shade = Math.round(clamp(128 + slope * 92, 8, 248));
				const pixelIndex = fieldIndex * 4;
				pixels[pixelIndex] = shade;
				pixels[pixelIndex + 1] = shade;
				pixels[pixelIndex + 2] = shade;
				pixels[pixelIndex + 3] = 255;
			}
		}
	}

	getHeight(column: number, row: number): number {
		return this.current[row * this.width + column] ?? 0;
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
