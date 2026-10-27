import type {
	MobileBoxDetails,
	MobileBoxSettings,
	MobileBoxSummary,
} from "@/types/delivery-mobile-box";
import type { box_lock, box_telemetry_latest } from "@/db/types";
import { computeOverallBatteryLevel, resolveMobileBatteryLevels } from "@/utils/box-battery.ts";

type BoxWithRelations = {
	id: string;
	box_display_id: string;
	name: string;
	connection_employee_id: string | null;
	telemetry?: box_telemetry_latest | null;
	lock?: { lock_status?: string | null } | box_lock | null;
};

export type { BoxWithRelations };

export const boolToHardwareState = (value: boolean): "on" | "off" =>
	value ? "on" : "off";

export const hardwareStateToBool = (value: string | null | undefined): boolean =>
	value === "on";

export const toMobileBoxSettings = (
	telemetry: box_telemetry_latest | null | undefined,
): MobileBoxSettings => ({
	is_dual_zone: hardwareStateToBool(telemetry?.dual_zone_status),
	zone_1_temp: telemetry?.zone1_temp ?? null,
	zone_2_temp: telemetry?.zone2_temp ?? null,
	zone_1_target_temp: telemetry?.zone1_target_temp ?? null,
	zone_2_target_temp: telemetry?.zone2_target_temp ?? null,
	zone_1_status: hardwareStateToBool(telemetry?.zone1_status),
	zone_2_status: hardwareStateToBool(telemetry?.zone2_status),
	advert_display_enabled: hardwareStateToBool(telemetry?.advert_screen_status),
	ioniser_enabled: hardwareStateToBool(telemetry?.ioniser_status),
	light_enabled: hardwareStateToBool(telemetry?.light_status),
});

export const toMobileBoxSummary = (
	box: BoxWithRelations,
	driverEmployeeId: string,
): MobileBoxSummary => {
	const telemetry = box.telemetry;
	const isConnected =
		telemetry?.connection_status === "connected" ||
		box.connection_employee_id === driverEmployeeId;

	return {
		id: box.id,
		box_display_id: box.box_display_id,
		name: box.name,
		is_connected: isConnected,
		battery_level: computeOverallBatteryLevel(telemetry),
		is_locked: box.lock?.lock_status === "locked",
	};
};

export const toMobileBoxDetails = (
	box: BoxWithRelations,
	driverEmployeeId: string,
): MobileBoxDetails => {
	const summary = toMobileBoxSummary(box, driverEmployeeId);
	const telemetry = box.telemetry;
	const batteryLevels = resolveMobileBatteryLevels(telemetry);

	return {
		...summary,
		zone_1_temp: telemetry?.zone1_temp ?? null,
		zone_2_temp: telemetry?.zone2_temp ?? null,
		ext_temp: telemetry?.ext_temp ?? null,
		connection_status: telemetry?.cellular_signal ?? telemetry?.connection_status ?? null,
		power_status: telemetry?.power_status ?? null,
		health_status: telemetry?.health_status ?? null,
		battery_1_level: batteryLevels.battery_1_level,
		battery_2_level: batteryLevels.battery_2_level,
		is_charging: hardwareStateToBool(telemetry?.charging_status),
		wifi_connected: hardwareStateToBool(telemetry?.wifi_status),
		bluetooth_available: hardwareStateToBool(telemetry?.bluetooth_status),
		is_power_on: hardwareStateToBool(telemetry?.power_status),
		is_driver_connected: !!box.connection_employee_id,
		settings: toMobileBoxSettings(telemetry),
	};
};

export const mergeSettingsPatch = (
	current: MobileBoxSettings,
	patch: Partial<MobileBoxSettings>,
): MobileBoxSettings => ({
	is_dual_zone: patch.is_dual_zone ?? current.is_dual_zone,
	zone_1_temp: patch.zone_1_temp ?? current.zone_1_temp,
	zone_2_temp: patch.zone_2_temp ?? current.zone_2_temp,
	zone_1_target_temp: patch.zone_1_target_temp ?? current.zone_1_target_temp,
	zone_2_target_temp: patch.zone_2_target_temp ?? current.zone_2_target_temp,
	zone_1_status: patch.zone_1_status ?? current.zone_1_status,
	zone_2_status: patch.zone_2_status ?? current.zone_2_status,
	advert_display_enabled:
		patch.advert_display_enabled ?? current.advert_display_enabled,
	ioniser_enabled: patch.ioniser_enabled ?? current.ioniser_enabled,
	light_enabled: patch.light_enabled ?? current.light_enabled,
});
