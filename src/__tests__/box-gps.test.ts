import { describe, expect, test } from "bun:test";
import { resolveBoxGpsCoords } from "@/utils/box-gps.ts";
import {
	isSimulatorGpsAvailable,
	resolveSimulatorLatitude,
	resolveSimulatorLongitude,
} from "@/utils/simulator-gps.ts";

describe("resolveBoxGpsCoords", () => {
	const freshGpsAt = new Date();

	test("returns coordinates when gps_status is off but lat/lng exist", () => {
		const result = resolveBoxGpsCoords({
			gps_status: "off",
			power_status: "on",
			latitude: 12.9716,
			longitude: 77.5946,
			gps_updated_at: freshGpsAt,
		} as never);

		expect(result).toEqual({
			lat: 12.9716,
			lng: 77.5946,
			gps_status: "off",
			updated_at: freshGpsAt.toISOString(),
			gps_updated_at: freshGpsAt.toISOString(),
		});
	});

	test("returns coordinates when box is powered off", () => {
		const result = resolveBoxGpsCoords({
			gps_status: "off",
			power_status: "off",
			latitude: 19.076,
			longitude: 72.8777,
			gps_updated_at: freshGpsAt,
		} as never);

		expect(result).toEqual({
			lat: 19.076,
			lng: 72.8777,
			gps_status: "off",
			updated_at: freshGpsAt.toISOString(),
			gps_updated_at: freshGpsAt.toISOString(),
		});
	});

	test("returns unavailable when coordinates are missing", () => {
		const result = resolveBoxGpsCoords({
			gps_status: "on",
			power_status: "on",
			latitude: null,
			longitude: null,
		} as never);

		expect(result).toEqual({
			lat: null,
			lng: null,
			gps_status: "unavailable",
			updated_at: null,
			gps_updated_at: null,
		});
	});
});

describe("simulator GPS helpers", () => {
	test("GPS is always reported available", () => {
		expect(isSimulatorGpsAvailable()).toBe(true);
	});

	test("returns telemetry coordinates without env defaults", () => {
		const telemetry = {
			latitude: 12.34,
			longitude: 56.78,
			gps_status: "off",
			power_status: "off",
		};

		expect(resolveSimulatorLatitude(telemetry as never)).toBe(12.34);
		expect(resolveSimulatorLongitude(telemetry as never)).toBe(56.78);
	});

	test("returns null when telemetry has no coordinates", () => {
		expect(resolveSimulatorLatitude({ gps_status: "off" } as never)).toBeNull();
		expect(resolveSimulatorLongitude({ gps_status: "off" } as never)).toBeNull();
	});
});
