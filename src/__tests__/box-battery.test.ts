import { describe, expect, test } from "bun:test";
import {
	computeOverallBatteryLevel,
	resolveMobileBatteryLevels,
} from "@/utils/box-battery.ts";

describe("resolveMobileBatteryLevels", () => {
	test("uses per-cell readings and mean for aggregate when both cells present", () => {
		const result = resolveMobileBatteryLevels({
			battery_1_percentage: 80,
			battery_2_percentage: 60,
		});

		expect(result).toEqual({
			battery_level: 70,
			battery_1_level: 80,
			battery_2_level: 60,
		});
		expect(computeOverallBatteryLevel({ battery_1_percentage: 80, battery_2_percentage: 60 })).toBe(
			70,
		);
	});

	test("legacy battery_percentage fills all three when cells missing", () => {
		const result = resolveMobileBatteryLevels({ battery_percentage: 42 });

		expect(result).toEqual({
			battery_level: 42,
			battery_1_level: 42,
			battery_2_level: 42,
		});
	});

	test("returns all null when no battery telemetry", () => {
		expect(resolveMobileBatteryLevels(null)).toEqual({
			battery_level: null,
			battery_1_level: null,
			battery_2_level: null,
		});
		expect(resolveMobileBatteryLevels(undefined)).toEqual({
			battery_level: null,
			battery_1_level: null,
			battery_2_level: null,
		});
		expect(resolveMobileBatteryLevels({})).toEqual({
			battery_level: null,
			battery_1_level: null,
			battery_2_level: null,
		});
	});

	test("single cell present does not duplicate aggregate to missing cell", () => {
		const result = resolveMobileBatteryLevels({ battery_1_percentage: 55 });

		expect(result).toEqual({
			battery_level: 55,
			battery_1_level: 55,
			battery_2_level: null,
		});
	});
});
