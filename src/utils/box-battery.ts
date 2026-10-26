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

/** ~24h runtime at 100% battery, scaled linearly. Null when unknown or charging. */
export const computeBatteryEstimatedHours = (
	batteryLevel: number | null,
	isCharging: boolean,
	isPowerOn: boolean,
): number | null => {
	if (batteryLevel == null || !isPowerOn || isCharging) return null;
	return Math.round((batteryLevel / 100) * 24 * 10) / 10;
};
