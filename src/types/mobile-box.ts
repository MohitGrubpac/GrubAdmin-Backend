export interface MobileBoxSummary {
	id: string;
	box_display_id: string;
	name: string;
	is_connected: boolean;
	battery_level: number | null;
	is_locked: boolean;
}

export interface MobileBoxSettings {
	is_dual_zone: boolean;
	zone_1_temp: number | null;
	zone_2_temp: number | null;
	zone_1_target_temp: number | null;
	zone_2_target_temp: number | null;
	zone_1_status: boolean;
	zone_2_status: boolean;
	advert_display_enabled: boolean;
	ioniser_enabled: boolean;
	light_enabled: boolean;
}

export interface MobileBoxDetails extends MobileBoxSummary {
	zone_1_temp: number | null;
	zone_2_temp: number | null;
	ext_temp: number | null;
	connection_status: string | null;
	power_status: string | null;
	health_status: string | null;
	battery_1_level: number | null;
	battery_2_level: number | null;
	is_charging: boolean;
	wifi_connected: boolean;
	bluetooth_available: boolean;
	is_power_on: boolean;
	is_driver_connected: boolean;
	battery_estimated_hours: number | null;
	settings: MobileBoxSettings;
}

export interface MobileBoxSettingsPatch {
	is_dual_zone?: boolean;
	/** @deprecated Use zone_1_target_temp — measured temps are read-only on medical mobile */
	zone_1_temp?: number;
	/** @deprecated Use zone_2_target_temp — measured temps are read-only on medical mobile */
	zone_2_temp?: number;
	zone_1_target_temp?: number;
	zone_2_target_temp?: number;
	zone_1_status?: boolean;
	zone_2_status?: boolean;
	advert_display_enabled?: boolean;
	ioniser_enabled?: boolean;
	light_enabled?: boolean;
}

export interface MobileBoxSettingsUpdateResult {
	id: string;
	box_display_id: string;
	settings: MobileBoxSettings;
}

export interface MobileBoxConnectionResult {
	id: string;
	box_display_id: string;
	is_connected: boolean;
}

export type LockAction = "unlock" | "lock";
