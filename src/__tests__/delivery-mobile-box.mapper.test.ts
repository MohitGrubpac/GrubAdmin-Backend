import { describe, expect, test } from "bun:test";
import {
	boolToHardwareState,
	hardwareStateToBool,
	mergeSettingsPatch,
	toMobileBoxDetails,
	toMobileBoxSettings,
	toMobileBoxSummary,
} from "@/db/actions/delivery-mobile/box.mapper.ts";

describe("delivery-mobile box mappers", () => {
	const driverId = "driver-ulid-1";

	const sampleBox = {
		id: "01JBOXULID556102",
		box_display_id: "GP-BOX-556102",
		name: "Box #556102",
		connection_employee_id: driverId,
		telemetry: {
			connection_status: "connected",
			battery_percentage: 88,
			battery_1_percentage: 90,
			battery_2_percentage: 80,
			dual_zone_status: "on",
			zone1_temp: -5,
			zone2_temp: 25,
			ext_temp: 30,
			power_status: "on",
			health_status: "healthy",
			advert_screen_status: "on",
			ioniser_status: "off",
			light_status: "on",
		},
		lock: {
			lock_status: "locked",
		},
	};

	test("toMobileBoxSummary exposes id and box_display_id", () => {
		const summary = toMobileBoxSummary(sampleBox as any, driverId);
		expect(summary.id).toBe("01JBOXULID556102");
		expect(summary.box_display_id).toBe("GP-BOX-556102");
		expect(summary.name).toBe("Box #556102");
		expect(summary.is_connected).toBe(true);
		// Overall battery is the mean of the two cells (90 + 80) / 2 = 85,
		// derived from the cells and not the stored battery_percentage (88).
		expect(summary.battery_level).toBe(85);
		expect(summary.is_locked).toBe(true);
	});

	test("toMobileBoxSummary averages the two battery cells", () => {
		const summary = toMobileBoxSummary(
			{ ...sampleBox, telemetry: { battery_1_percentage: 60, battery_2_percentage: 40 } } as any,
			driverId,
		);
		expect(summary.battery_level).toBe(50);
	});

	test("toMobileBoxSummary uses the only reported cell when one is missing", () => {
		const summary = toMobileBoxSummary(
			{ ...sampleBox, telemetry: { battery_1_percentage: 73, battery_2_percentage: null } } as any,
			driverId,
		);
		expect(summary.battery_level).toBe(73);
	});

	test("toMobileBoxSummary falls back to battery_percentage when cells are missing", () => {
		const summary = toMobileBoxSummary(
			{ ...sampleBox, telemetry: { battery_percentage: 88 } } as any,
			driverId,
		);
		expect(summary.battery_level).toBe(88);
	});

	test("toMobileBoxSummary returns null when no battery fields exist", () => {
		const summary = toMobileBoxSummary(
			{ ...sampleBox, telemetry: { connection_status: "connected" } } as any,
			driverId,
		);
		expect(summary.battery_level).toBeNull();
	});

	test("toMobileBoxDetails includes telemetry and settings", () => {
		const details = toMobileBoxDetails(sampleBox as any, driverId);
		expect(details.id).toBe("01JBOXULID556102");
		expect(details.box_display_id).toBe("GP-BOX-556102");
		expect(details.zone_1_temp).toBe(-5);
		expect(details.settings.is_dual_zone).toBe(true);
		expect(details.settings.ioniser_enabled).toBe(false);
	});

	test("hardware state helpers map booleans correctly", () => {
		expect(boolToHardwareState(true)).toBe("on");
		expect(boolToHardwareState(false)).toBe("off");
		expect(hardwareStateToBool("on")).toBe(true);
		expect(hardwareStateToBool("off")).toBe(false);
	});

	test("toMobileBoxSettings reads light_enabled from light_status", () => {
		const settings = toMobileBoxSettings(sampleBox.telemetry as any);
		expect(settings.light_enabled).toBe(true);
	});

	test("mergeSettingsPatch applies partial updates", () => {
		const current = toMobileBoxSettings(sampleBox.telemetry as any);
		const merged = mergeSettingsPatch(current, {
			light_enabled: true,
			zone_1_temp: 0,
		});
		expect(merged.light_enabled).toBe(true);
		expect(merged.zone_1_temp).toBe(0);
		expect(merged.zone_2_temp).toBe(25);
	});
});
