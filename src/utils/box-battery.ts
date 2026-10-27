/**
 * A GrubPac box carries two battery cells. The overall level is the mean of cells
 * that have reported a reading. When no cell data exists, falls back to the legacy
 * aggregate `battery_percentage` (seeds and older telemetry rows). Null only when
 * no battery field is present.
 */
export const computeOverallBatteryLevel = (
	telemetry:
		| {
				battery_1_percentage?: number | null;
				battery_2_percentage?: number | null;
				battery_percentage?: number | null;
		  }
		| null
		| undefined,
): number | null => {
	const cells = [
		telemetry?.battery_1_percentage,
		telemetry?.battery_2_percentage,
	].filter((value): value is number => typeof value === "number");

	if (cells.length > 0) {
		const total = cells.reduce((sum, value) => sum + value, 0);
		return Math.round(total / cells.length);
	}

	if (typeof telemetry?.battery_percentage === "number") {
		return telemetry.battery_percentage;
	}

	return null;
};

export type BoxBatteryTelemetry =
	| {
			battery_1_percentage?: number | null;
			battery_2_percentage?: number | null;
			battery_percentage?: number | null;
	  }
	| null
	| undefined;

/** Mobile/simulator API shape: aggregate plus per-cell levels with legacy single-field fallback. */
export const resolveMobileBatteryLevels = (
	telemetry: BoxBatteryTelemetry,
): {
	battery_level: number | null;
	battery_1_level: number | null;
	battery_2_level: number | null;
} => {
	const battery_level = computeOverallBatteryLevel(telemetry);

	let battery_1_level: number | null =
		typeof telemetry?.battery_1_percentage === "number"
			? telemetry.battery_1_percentage
			: null;
	let battery_2_level: number | null =
		typeof telemetry?.battery_2_percentage === "number"
			? telemetry.battery_2_percentage
			: null;

	if (
		battery_1_level === null &&
		battery_2_level === null &&
		typeof battery_level === "number"
	) {
		battery_1_level = battery_level;
		battery_2_level = battery_level;
	}

	return { battery_level, battery_1_level, battery_2_level };
};

/** ~24h runtime at 100% battery, scaled linearly. Null when unknown or charging. */
export const computeBatteryEstimatedHours = (
	batteryLevel: number | null,
	isCharging: boolean,
	isPowerOn: boolean,
): number | null => {
	if (batteryLevel == null || !isPowerOn || isCharging) return null;
	return Math.round((batteryLevel / 100) * 24 * 10) / 10;
};
