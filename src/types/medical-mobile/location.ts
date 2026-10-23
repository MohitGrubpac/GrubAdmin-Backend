export interface MedicalBoxLocation {
	lat: number | null;
	lng: number | null;
	updated_at: string | null;
	address_hint: string | null;
	gps_status: "on" | "off" | "unavailable" | "stale";
	gps_updated_at?: string | null;
}

/** Native OS share payload for POST .../location/share (Option A — no web share page). */
export interface MedicalBoxLocationShareResponse extends MedicalBoxLocation {
	maps_url: string;
	share_text: string;
}
