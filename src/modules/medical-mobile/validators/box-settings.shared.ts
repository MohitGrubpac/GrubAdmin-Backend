import z from "zod";
import {
	MEDICAL_MOBILE_ZONE_TEMP_MAX,
	MEDICAL_MOBILE_ZONE_TEMP_MIN,
} from "@/modules/medical-mobile/constants/box-settings.ts";

const finiteZoneTargetTemp = z
	.number()
	.refine((n) => Number.isFinite(n), { message: "Temperature must be a finite number" })
	.min(MEDICAL_MOBILE_ZONE_TEMP_MIN, {
		message: `Temperature must be at least ${MEDICAL_MOBILE_ZONE_TEMP_MIN}`,
	})
	.max(MEDICAL_MOBILE_ZONE_TEMP_MAX, {
		message: `Temperature must be at most ${MEDICAL_MOBILE_ZONE_TEMP_MAX}`,
	});

export const medicalMobileBoxSettingsFields = {
	is_dual_zone: z.boolean().optional(),
	zone_1_target_temp: finiteZoneTargetTemp.optional(),
	zone_2_target_temp: finiteZoneTargetTemp.optional(),
	zone_1_status: z.boolean().optional(),
	zone_2_status: z.boolean().optional(),
	ioniser_enabled: z.boolean().optional(),
	advert_display_enabled: z.boolean().optional(),
	light_enabled: z.boolean().optional(),
};

export const medicalMobileBoxSettingsRefine = (data: Record<string, unknown>) =>
	Object.values(data).some((value) => value !== undefined);
