import type { box_telemetry_latest } from "@/db/types";

export type BoxGpsStatus = "on" | "off" | "unavailable" | "stale";

/** GPS fix older than this is reported as stale (mobile medical semantics). */
export const BOX_GPS_STALE_MS = 15 * 60 * 1000;

export interface BoxGpsCoords {
	lat: number | null;
	lng: number | null;
	gps_status: BoxGpsStatus;
	updated_at: string | null;
	gps_updated_at: string | null;
}

const isNullIsland = (lat: number, lng: number): boolean =>
	Math.abs(lat) < 0.000_001 && Math.abs(lng) < 0.000_001;

/**
 * Resolve box GPS coordinates from telemetry.
 * GPS remains active for location even when the box is powered off;
 * coordinates are returned whenever latitude/longitude are present and valid.
 */
export const resolveBoxGpsCoords = (
	telemetry: box_telemetry_latest | null | undefined,
): BoxGpsCoords => {
	const latRaw = telemetry?.latitude != null ? Number(telemetry.latitude) : null;
	const lngRaw = telemetry?.longitude != null ? Number(telemetry.longitude) : null;
	const gpsUpdatedAt = telemetry?.gps_updated_at?.toISOString() ?? null;
	const updatedAt =
		gpsUpdatedAt ?? telemetry?.updated_at?.toISOString() ?? null;

	const coordsMissing =
		latRaw == null ||
		lngRaw == null ||
		Number.isNaN(latRaw) ||
		Number.isNaN(lngRaw) ||
		isNullIsland(latRaw, lngRaw);

	if (coordsMissing) {
		return {
			lat: null,
			lng: null,
			gps_status: "unavailable",
			updated_at: updatedAt,
			gps_updated_at: gpsUpdatedAt,
		};
	}

	const hardwareGpsOff = telemetry?.gps_status === "off";
	let gps_status: BoxGpsStatus = hardwareGpsOff ? "off" : "on";

	if (gpsUpdatedAt) {
		const ageMs = Date.now() - new Date(gpsUpdatedAt).getTime();
		if (ageMs > BOX_GPS_STALE_MS) {
			gps_status = "stale";
		}
	}

	return {
		lat: latRaw,
		lng: lngRaw,
		gps_status,
		updated_at: updatedAt,
		gps_updated_at: gpsUpdatedAt,
	};
};
