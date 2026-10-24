export type MistwaterWindSample = {
	x: number;
	y: number;
	strength: number;
	gust: number;
};

export type MistwaterLeafKinematics = {
	x: number;
	y: number;
	velocityX: number;
	velocityY: number;
};

export type MistwaterGrassBend = {
	angle: number;
	angularVelocity: number;
};

export function integrateGrassBend(
	state: MistwaterGrassBend,
	windForce: number,
	deltaSeconds: number
): MistwaterGrassBend {
	const target = clamp(windForce * 0.055, -0.045, 0.045);
	let remaining = clamp(deltaSeconds, 0, 0.05);
	let { angle, angularVelocity } = state;
	while (remaining > 0) {
		const step = Math.min(remaining, 1 / 120);
		const acceleration = (target - angle) * 18 - angularVelocity * 6.5;
		angularVelocity += acceleration * step;
		angle += angularVelocity * step;
		remaining -= step;
	}
	return { angle, angularVelocity };
}

// Coordinates are normalized to the source sprite. Everything at or below
// the root stays fixed; flexibility grows quadratically toward the tips.
export function deformGrassPoint(
	x: number,
	y: number,
	rootX: number,
	rootY: number,
	bendAngle: number,
	timeSeconds: number,
	phase: number
): { x: number; y: number } {
	const height = clamp((rootY - y) / rootY, 0, 1);
	const flexibility = height * height;
	const groupPhase = (x - rootX) * 7.2 + phase;
	const flutter =
		Math.sin(timeSeconds * 0.95 - height * 1.7 + groupPhase) * 0.009 +
		Math.sin(timeSeconds * 1.65 + groupPhase * 1.6) * 0.003;
	return {
		x: x + flexibility * (bendAngle * 1.5 + flutter),
		y:
			y +
			flexibility *
				(Math.sin(timeSeconds * 0.8 + groupPhase) * 0.002 + Math.abs(bendAngle) * 0.08)
	};
}

type Gust = {
	start: number;
	duration: number;
	strength: number;
	directionOffset: number;
};

export class MistwaterWindModel {
	private readonly random: () => number;
	private nextGustAt: number;
	private gust?: Gust;

	constructor(seed = 0x71adf00d) {
		this.random = createSeededRandom(seed);
		this.nextGustAt = 2.5 + this.random() * 3.5;
	}

	update(timeSeconds: number) {
		if (this.gust && timeSeconds > this.gust.start + this.gust.duration) {
			const endedAt = this.gust.start + this.gust.duration;
			this.gust = undefined;
			this.nextGustAt = endedAt + 4.5 + this.random() * 7;
		}
		if (!this.gust && timeSeconds >= this.nextGustAt) {
			this.gust = {
				start: timeSeconds,
				duration: 2.8 + this.random() * 3.8,
				strength: 0.34 + this.random() * 0.42,
				directionOffset: (this.random() - 0.5) * 0.38
			};
		}
	}

	sample(timeSeconds: number, normalizedX = 0.5, normalizedY = 0.5): MistwaterWindSample {
		const baseStrength = 0.105 + Math.sin(timeSeconds * 0.31 + normalizedY * 2.1) * 0.025;
		let gustStrength = 0;
		let directionOffset = 0;
		if (this.gust) {
			const progress = clamp((timeSeconds - this.gust.start) / this.gust.duration, 0, 1);
			const envelope = Math.sin(progress * Math.PI) ** 2;
			const spatialVariation =
				0.82 + Math.sin(normalizedX * 5.3 - normalizedY * 3.1 + timeSeconds * 0.72) * 0.18;
			gustStrength = envelope * this.gust.strength * spatialVariation;
			directionOffset = this.gust.directionOffset * envelope;
		}

		const strength = clamp(baseStrength + gustStrength, 0, 1);
		const direction = -0.22 + Math.sin(timeSeconds * 0.12) * 0.09 + directionOffset;
		return {
			x: Math.cos(direction) * strength,
			y: Math.sin(direction) * strength,
			strength,
			gust: gustStrength
		};
	}
}

export function beerLambertTransmittance(opticalDepth: number, extinctionCoefficient = 1): number {
	return Math.exp(-Math.max(0, opticalDepth) * Math.max(0, extinctionCoefficient));
}

export function leafPigmentTint(senescence: number): number {
	const progress = clamp(senescence, 0, 1);
	const chlorophyll = Math.exp(-3.2 * progress);
	const red = Math.round(194 + (58 - 194) * chlorophyll);
	const green = Math.round(128 + (139 - 128) * chlorophyll);
	const blue = Math.round(38 + (62 - 38) * chlorophyll);
	return (red << 16) | (green << 8) | blue;
}

export function integrateLeafMotion(
	state: MistwaterLeafKinematics,
	wind: MistwaterWindSample,
	deltaSeconds: number,
	flutter: number
): MistwaterLeafKinematics {
	const safeDelta = clamp(deltaSeconds, 0, 0.05);
	const targetVelocityX = wind.x * 92 + flutter * 13;
	const targetVelocityY = wind.y * 42 + 15;
	const drag = 1 - Math.exp(-1.7 * safeDelta);
	const velocityX = state.velocityX + (targetVelocityX - state.velocityX) * drag;
	const velocityY =
		state.velocityY + (targetVelocityY - state.velocityY) * drag + 8.5 * safeDelta;
	return {
		x: state.x + velocityX * safeDelta,
		y: state.y + velocityY * safeDelta,
		velocityX,
		velocityY
	};
}

export function smoothValueNoise(x: number, y: number, seed: number): number {
	const left = Math.floor(x);
	const top = Math.floor(y);
	const mixX = smootherStep(x - left);
	const mixY = smootherStep(y - top);
	const topValue = lerp(hashUnit(left, top, seed), hashUnit(left + 1, top, seed), mixX);
	const bottomValue = lerp(
		hashUnit(left, top + 1, seed),
		hashUnit(left + 1, top + 1, seed),
		mixX
	);
	return lerp(topValue, bottomValue, mixY);
}

function createSeededRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state += 0x6d2b79f5;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
	};
}

function hashUnit(x: number, y: number, seed: number): number {
	let value = Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca77) ^ seed;
	value ^= value >>> 16;
	value = Math.imul(value, 0x7feb352d);
	value ^= value >>> 15;
	return (value >>> 0) / 4_294_967_295;
}

function smootherStep(value: number): number {
	return value * value * value * (value * (value * 6 - 15) + 10);
}

function lerp(start: number, end: number, amount: number): number {
	return start + (end - start) * amount;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}
