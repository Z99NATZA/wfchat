const TAU = Math.PI * 2;
const OPTICAL_SOFTNESS = 0.004;

export type MistwaterHeightSampler = (normalizedX: number, normalizedY: number) => number;

export type MistwaterSurfaceWave = {
	angle: number;
	frequency: number;
	amplitude: number;
	speed: number;
	phase: number;
};

type PreparedWave = {
	phase: number;
	angularSpeed: number;
	stepY: number;
	sinStepX: number;
	cosStepX: number;
	curvatureXScale: number;
	curvatureYScale: number;
	crossCurvatureScale: number;
};

const SURFACE_WAVES: ReadonlyArray<MistwaterSurfaceWave> = [
	{ angle: 0.12, frequency: 3, amplitude: 0.00225, speed: 0.025, phase: 0.4 },
	{ angle: 1.33, frequency: 4.5, amplitude: 0.00113, speed: -0.022, phase: 2.1 },
	{ angle: -0.76, frequency: 6, amplitude: 0.00056, speed: 0.028, phase: 4.7 },
	{ angle: 2.51, frequency: 8, amplitude: 0.0003, speed: -0.026, phase: 1.3 },
	{ angle: 0.73, frequency: 10, amplitude: 0.000165, speed: 0.032, phase: 5.4 },
	{ angle: -1.34, frequency: 13, amplitude: 0.000082, speed: -0.035, phase: 3.2 },
	{ angle: 2.95, frequency: 16, amplitude: 0.000045, speed: 0.039, phase: 0.9 },
	{ angle: 1.91, frequency: 20, amplitude: 0.000022, speed: -0.044, phase: 4.1 },
	{ angle: -2.18, frequency: 25, amplitude: 0.00001, speed: 0.05, phase: 2.8 }
];

export class MistwaterCaustics {
	readonly width: number;
	readonly height: number;
	private readonly waves: ReadonlyArray<PreparedWave>;
	private readonly curvatureX: Float32Array;
	private readonly curvatureY: Float32Array;
	private readonly crossCurvature: Float32Array;
	private readonly rippleHeight: Float32Array;

	constructor(
		width: number,
		height: number,
		aspectRatio: number,
		waves: ReadonlyArray<MistwaterSurfaceWave> = SURFACE_WAVES
	) {
		if (width < 3 || height < 3) {
			throw new Error("Mistwater caustics requires at least a 3x3 field");
		}
		this.width = width;
		this.height = height;
		this.waves = waves.map((wave) => prepareWave(wave, width, height, aspectRatio));
		const sampleCount = width * height;
		this.curvatureX = new Float32Array(sampleCount);
		this.curvatureY = new Float32Array(sampleCount);
		this.crossCurvature = new Float32Array(sampleCount);
		this.rippleHeight = new Float32Array(sampleCount);
	}

	writeLightMap(
		pixels: Uint8ClampedArray,
		timeSeconds: number,
		sampleRipple: MistwaterHeightSampler = () => 0
	) {
		if (pixels.length !== this.width * this.height * 4) {
			throw new Error("Caustic pixel buffer does not match the optical field");
		}

		this.calculateSurfaceCurvature(timeSeconds);
		this.sampleRippleField(sampleRipple);
		const rippleStepX = Math.max(1, Math.round(this.width / 96));
		const rippleStepY = Math.max(1, Math.round(this.height / 44));
		for (let y = 0; y < this.height; y += 1) {
			const normalizedY = (y + 0.5) / this.height;
			for (let x = 0; x < this.width; x += 1) {
				const normalizedX = (x + 0.5) / this.width;
				const index = y * this.width + x;
				const leftX = Math.max(0, x - rippleStepX);
				const rightX = Math.min(this.width - 1, x + rippleStepX);
				const topY = Math.max(0, y - rippleStepY);
				const bottomY = Math.min(this.height - 1, y + rippleStepY);
				const center = this.rippleHeight[index];
				const left = this.rippleHeight[y * this.width + leftX];
				const right = this.rippleHeight[y * this.width + rightX];
				const up = this.rippleHeight[topY * this.width + x];
				const down = this.rippleHeight[bottomY * this.width + x];
				const upLeft = this.rippleHeight[topY * this.width + leftX];
				const upRight = this.rippleHeight[topY * this.width + rightX];
				const downLeft = this.rippleHeight[bottomY * this.width + leftX];
				const downRight = this.rippleHeight[bottomY * this.width + rightX];
				const curvatureX = this.curvatureX[index] + (left - center * 2 + right) * 18;
				const curvatureY = this.curvatureY[index] + (up - center * 2 + down) * 18;
				const crossCurvature =
					this.crossCurvature[index] + (upLeft - upRight - downLeft + downRight) * 4.5;

				const shallowFactor = clamp(normalizedY * 0.68 + normalizedX * 0.32, 0, 1);
				const refractionStrength = 0.3 + shallowFactor * 0.08;
				const jacobianX = 1 - refractionStrength * curvatureX;
				const jacobianY = 1 - refractionStrength * curvatureY;
				const determinant =
					jacobianX * jacobianY -
					refractionStrength * refractionStrength * crossCurvature * crossCurvature;
				const focusedLight = 1 / Math.sqrt(Math.abs(determinant) + OPTICAL_SOFTNESS);
				const excessLight = Math.max(0, focusedLight - 0.98);
				const normalizedFocus = clamp(excessLight / 14.83, 0, 1);
				const intensity =
					Math.pow(normalizedFocus, 0.65) * 0.55 + Math.pow(normalizedFocus, 2) * 0.45;
				const attenuation = 0.32 + shallowFactor * 0.68;
				const alpha = Math.round(intensity * attenuation * 580);
				const pixel = index * 4;
				pixels[pixel] = Math.round(150 + shallowFactor * 45);
				pixels[pixel + 1] = Math.round(232 + shallowFactor * 23);
				pixels[pixel + 2] = Math.round(225 + shallowFactor * 24);
				pixels[pixel + 3] = alpha;
			}
		}
	}

	private calculateSurfaceCurvature(timeSeconds: number) {
		this.curvatureX.fill(0);
		this.curvatureY.fill(0);
		this.crossCurvature.fill(0);

		for (const wave of this.waves) {
			const firstPhase = wave.phase + timeSeconds * wave.angularSpeed;
			for (let y = 0; y < this.height; y += 1) {
				let sine = Math.sin(firstPhase + y * wave.stepY);
				let cosine = Math.cos(firstPhase + y * wave.stepY);
				for (let x = 0; x < this.width; x += 1) {
					const index = y * this.width + x;
					this.curvatureX[index] += sine * wave.curvatureXScale;
					this.curvatureY[index] += sine * wave.curvatureYScale;
					this.crossCurvature[index] += sine * wave.crossCurvatureScale;
					const nextSine = sine * wave.cosStepX + cosine * wave.sinStepX;
					cosine = cosine * wave.cosStepX - sine * wave.sinStepX;
					sine = nextSine;
				}
			}
		}
	}

	private sampleRippleField(sampleRipple: MistwaterHeightSampler) {
		for (let y = 0; y < this.height; y += 1) {
			const normalizedY = (y + 0.5) / this.height;
			for (let x = 0; x < this.width; x += 1) {
				this.rippleHeight[y * this.width + x] = sampleRipple(
					(x + 0.5) / this.width,
					normalizedY
				);
			}
		}
	}
}

function prepareWave(
	wave: MistwaterSurfaceWave,
	width: number,
	height: number,
	aspectRatio: number
): PreparedWave {
	const directionX = Math.cos(wave.angle);
	const directionY = Math.sin(wave.angle);
	const waveNumber = TAU * wave.frequency;
	const curvatureScale = -wave.amplitude * waveNumber * waveNumber;
	const stepX = (waveNumber * aspectRatio * directionX) / width;
	const stepY = (waveNumber * directionY) / height;
	return {
		phase: wave.phase + stepX * 0.5 + stepY * 0.5,
		angularSpeed: wave.speed * waveNumber,
		stepY,
		sinStepX: Math.sin(stepX),
		cosStepX: Math.cos(stepX),
		curvatureXScale: curvatureScale * directionX * directionX,
		curvatureYScale: curvatureScale * directionY * directionY,
		crossCurvatureScale: curvatureScale * directionX * directionY
	};
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}
