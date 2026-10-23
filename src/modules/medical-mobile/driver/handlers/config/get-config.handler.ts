import { createHandlers } from "@/utils/hono-factory.ts";
import { getConfigs } from "@/db/actions/config.actions.ts";
import type { APIResponse } from "@/types/api";
import { medicalMobileZoneTempCapabilities } from "@/db/actions/medical-mobile/box-settings.helpers.ts";

interface MobileConfig {
	minAndroidVersion?: string;
	minIosVersion?: string;
	androidLinks?: string;
	iosLinks?: string;
	maintenanceMode?: string;
	imageUrls?: string;
	privacyPolicyLink?: string;
	termsAndConditionsLink?: string;
	support_email?: string;
	facility_emergency_phone?: string;
	privacy_url?: string;
	terms_url?: string;
}

interface ResponseData {
	config: MobileConfig;
	capabilities?: {
		zone_target_temp_c: { min: number; max: number };
	};
}

export const getConfigHandler = createHandlers(async (context) => {
	const configs = await getConfigs();

	const configMap: Record<string, string> = {};
	configs.forEach((config) => {
		configMap[config.key] = config.value;
	});

	const findConfigValue = (variants: string[]): string | undefined => {
		const normalize = (s: string) => s.replace(/[^a-z0-9]/gi, "").toLowerCase();
		const normalizedMap: Record<string, string> = {};
		for (const k of Object.keys(configMap)) {
			const val = configMap[k];
			if (val) normalizedMap[normalize(k)] = val;
		}
		for (const v of variants) {
			const n = normalize(v);
			if (n in normalizedMap) return normalizedMap[n];
		}
		return undefined;
	};

	const mobileConfig: MobileConfig = {
		minAndroidVersion: findConfigValue([
			"minAndroidVersion",
			"min_android_version",
			"min-android-version",
		]),
		minIosVersion: findConfigValue(["minIosVersion", "min_ios_version", "min-ios-version"]),
		androidLinks: findConfigValue(["androidLinks", "android_links", "android-links"]),
		iosLinks: findConfigValue(["iosLinks", "ios_links", "ios-links"]),
		maintenanceMode: findConfigValue(["maintenanceMode", "maintenance_mode", "maintenance-mode"]),
		imageUrls: findConfigValue(["imageUrls", "image_urls", "image-urls"]),
		privacyPolicyLink: findConfigValue([
			"privacyPolicyLink",
			"privacy_policy_link",
			"privacy-policy-link",
		]),
		termsAndConditionsLink: findConfigValue([
			"termsAndConditionsLink",
			"terms_and_conditions_link",
			"terms-and-conditions-link",
		]),
		support_email: findConfigValue(["support_email", "supportEmail", "medical_support_email"]),
		facility_emergency_phone: findConfigValue([
			"facility_emergency_phone",
			"facilityEmergencyPhone",
			"medical_emergency_phone",
		]),
		privacy_url: findConfigValue(["privacy_url", "privacyPolicyLink", "privacy_policy_link"]),
		terms_url: findConfigValue([
			"terms_url",
			"termsAndConditionsLink",
			"terms_and_conditions_link",
		]),
	};

	return context.json<APIResponse<ResponseData>>(
		{
			success: true,
			code: 200,
			data: {
				config: mobileConfig,
				capabilities: {
					zone_target_temp_c: medicalMobileZoneTempCapabilities,
				},
			},
		},
		{ status: 200 },
	);
});
