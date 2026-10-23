import type {
	MedicalBoxLocation,
	MedicalBoxLocationShareResponse,
} from "@/types/medical-mobile/location";

export const buildGoogleMapsUrl = (lat: number, lng: number): string =>
	`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

export const buildAppleMapsUrl = (lat: number, lng: number): string =>
	`https://maps.apple.com/?ll=${lat},${lng}`;

export const buildMedicalLocationSharePayload = (
	location: MedicalBoxLocation,
	box_label: string,
): MedicalBoxLocationShareResponse => {
	if (location.lat == null || location.lng == null) {
		return {
			...location,
			maps_url: "",
			share_text: `GrubPac box ${box_label} location is unavailable (no GPS fix).`,
		};
	}

	const maps_url = buildGoogleMapsUrl(location.lat, location.lng);
	const apple_maps_url = buildAppleMapsUrl(location.lat, location.lng);
	const share_text = `GrubPac box ${box_label} location: ${maps_url} (Apple Maps: ${apple_maps_url})`;

	return {
		...location,
		maps_url,
		share_text,
	};
};
