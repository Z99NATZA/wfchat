import { describe, expect, it } from "vitest";
import {
	MistwaterWindModel,
	beerLambertTransmittance,
	deformGrassPoint,
	integrateGrassBend,
	integrateLeafMotion,
	leafPigmentTint,
	smoothValueNoise
} from "@/features/mistwater/game/mistwaterForestPhysics";

describe("Mistwater forest physics", () => {
	it("keeps grass roots and the base fixed while tips bend more than the middle", () => {
		const deform = (x: number, y: number) => deformGrassPoint(x, y, 0.5, 0.76, 0.03, 2, 0.6);
		expect(deform(0.5, 0.76)).toEqual({ x: 0.5, y: 0.76 });
		expect(deform(0.2, 0.9)).toEqual({ x: 0.2, y: 0.9 });
		const tip = Math.abs(deform(0.5, 0.2).x - 0.5);
		const middle = Math.abs(deform(0.5, 0.5).x - 0.5);
		expect(tip).toBeGreaterThan(middle * 2);
	});

	it("gives different leaf groups smooth, independent motion", () => {
		const displacement = (x: number, time: number) =>
			deformGrassPoint(x, 0.2, 0.5, 0.76, 0.01, time, 0.6).x - x;
		expect(Math.abs(displacement(0.2, 2) - displacement(0.8, 2))).toBeGreaterThan(0.001);
		let previous = displacement(0.2, 0);
		for (let frame = 1; frame <= 600; frame += 1) {
			const current = displacement(0.2, frame / 60);
			expect(Math.abs(current - previous)).toBeLessThan(0.0003);
			previous = current;
		}
	});

	it("bends grass gradually under wind and settles when the wind stops", () => {
		let state = { angle: 0, angularVelocity: 0 };
		const first = integrateGrassBend(state, 0.8, 1 / 60);
		expect(first.angle).toBeGreaterThan(0);
		expect(first.angle).toBeLessThan(0.01);
		for (let frame = 0; frame < 240; frame += 1) {
			state = integrateGrassBend(state, 0.8, 1 / 60);
		}
		expect(state.angle).toBeGreaterThan(0.04);
		expect(state.angle).toBeLessThanOrEqual(0.045);
		for (let frame = 0; frame < 360; frame += 1) {
			state = integrateGrassBend(state, 0, 1 / 60);
		}
		expect(Math.abs(state.angle)).toBeLessThan(0.0001);
		expect(Math.abs(state.angularVelocity)).toBeLessThan(0.0001);
	});

	it("keeps grass motion consistent across frame rates and caps stalled frames", () => {
		const simulate = (fps: number) => {
			let state = { angle: 0, angularVelocity: 0 };
			for (let frame = 0; frame < fps; frame += 1) {
				state = integrateGrassBend(state, -0.6, 1 / fps);
			}
			return state;
		};
		expect(simulate(30).angle).toBeCloseTo(simulate(120).angle, 5);
		const state = { angle: 0, angularVelocity: 0 };
		expect(integrateGrassBend(state, 1, 1)).toEqual(integrateGrassBend(state, 1, 0.05));
		expect(integrateGrassBend(state, 1, -1)).toEqual(state);
	});

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
