import { describe, expect, it } from "vitest";
import {
	MistwaterWindModel,
	beerLambertTransmittance,
	integrateLeafMotion,
	leafPigmentTint,
	smoothValueNoise
} from "@/features/mistwater/game/mistwaterForestPhysics";

describe("Mistwater forest physics", () => {
	it("produces deterministic calm periods and smooth intermittent gusts", () => {
		const first = new MistwaterWindModel(42);
		const second = new MistwaterWindModel(42);
		const gusts: number[] = [];

		for (let time = 0; time <= 40; time += 0.25) {
			first.update(time);
			second.update(time);
			const firstSample = first.sample(time, 0.4, 0.6);
			const secondSample = second.sample(time, 0.4, 0.6);
			expect(firstSample).toEqual(secondSample);
			expect(firstSample.strength).toBeGreaterThanOrEqual(0);
			expect(firstSample.strength).toBeLessThanOrEqual(1);
			gusts.push(firstSample.gust);
		}

		expect(gusts.some((gust) => gust === 0)).toBe(true);
		expect(gusts.some((gust) => gust > 0.25)).toBe(true);
	});

	it("attenuates light exponentially through denser canopy", () => {
		expect(beerLambertTransmittance(0)).toBe(1);
		expect(beerLambertTransmittance(1)).toBeCloseTo(Math.E ** -1);
		expect(beerLambertTransmittance(3)).toBeLessThan(beerLambertTransmittance(1));
	});

	it("reveals carotenoid color as chlorophyll decays", () => {
		const green = leafPigmentTint(0);
		const amber = leafPigmentTint(1);
		const greenRed = (green >> 16) & 0xff;
		const greenChannel = (green >> 8) & 0xff;
		const amberRed = (amber >> 16) & 0xff;

		expect(greenChannel).toBeGreaterThan(greenRed);
		expect(amberRed).toBeGreaterThan(greenChannel);
	});

	it("moves a leaf toward the wind while gravity increases downward velocity", () => {
		const next = integrateLeafMotion(
			{ x: 10, y: 20, velocityX: 0, velocityY: 0 },
			{ x: 0.8, y: -0.1, strength: 0.8, gust: 0.5 },
			0.05,
			0
		);

		expect(next.x).toBeGreaterThan(10);
		expect(next.velocityX).toBeGreaterThan(0);
		expect(next.velocityY).toBeGreaterThan(0);
	});

	it("keeps value noise deterministic and bounded", () => {
		const first = smoothValueNoise(2.35, -1.2, 17);
		expect(smoothValueNoise(2.35, -1.2, 17)).toBe(first);
		expect(first).toBeGreaterThanOrEqual(0);
		expect(first).toBeLessThanOrEqual(1);
	});
});
