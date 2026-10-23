import { prisma } from "@/db";
import { actionGrubpac } from "@/db/actions/box.actions.ts";
import type { hardware_state } from "@/db/types";
import { APIError } from "@/types/error";
import type { MobileBoxSettingsPatch } from "@/types/mobile-box";
import {
	assertMedicalMobileZoneTargetTemp,
	MEDICAL_MOBILE_ZONE_TEMP_MAX,
	MEDICAL_MOBILE_ZONE_TEMP_MIN,
} from "@/modules/medical-mobile/constants/box-settings.ts";
import { boolToHardwareState } from "@/db/actions/medical-mobile/box.mapper.ts";

export const medicalMobileZoneTempCapabilities = {
	min_c: MEDICAL_MOBILE_ZONE_TEMP_MIN,
	max_c: MEDICAL_MOBILE_ZONE_TEMP_MAX,
};

const validateTargetTemp = (value: number | undefined, label: string) => {
	if (value === undefined) return;
	try {
		assertMedicalMobileZoneTargetTemp(value, label);
	} catch (err) {
		const message = err instanceof Error ? err.message : "Invalid temperature";
		throw new APIError(message, undefined, undefined, 400);
	}
};

export const validateMedicalMobileSettingsPatch = (patch: MobileBoxSettingsPatch): void => {
	validateTargetTemp(patch.zone_1_target_temp, "zone_1_target_temp");
	validateTargetTemp(patch.zone_2_target_temp, "zone_2_target_temp");

	if (patch.zone_1_temp !== undefined || patch.zone_2_temp !== undefined) {
		throw new APIError(
			"Use zone_1_target_temp and zone_2_target_temp to set cooling targets; measured temperatures are read-only",
			undefined,
			undefined,
			400,
		);
	}
};

export const mapMedicalMobileSettingsPatchToGrubpac = (patch: MobileBoxSettingsPatch) => {
	const payload: {
		dual_zone_status?: hardware_state;
		advert_screen_status?: hardware_state;
		ioniser_status?: hardware_state;
		light_status?: hardware_state;
	} = {};

	if (patch.is_dual_zone !== undefined) {
		payload.dual_zone_status = boolToHardwareState(patch.is_dual_zone);
	}
	if (patch.advert_display_enabled !== undefined) {
		payload.advert_screen_status = boolToHardwareState(patch.advert_display_enabled);
	}
	if (patch.ioniser_enabled !== undefined) {
		payload.ioniser_status = boolToHardwareState(patch.ioniser_enabled);
	}
	if (patch.light_enabled !== undefined) {
		payload.light_status = boolToHardwareState(patch.light_enabled);
	}

	return payload;
};

export const applyMedicalMobileTargetTelemetryPatch = async (args: {
	box_id: string;
	patch: MobileBoxSettingsPatch;
}) => {
	const data: {
		zone1_target_temp?: number;
		zone2_target_temp?: number;
		zone1_status?: hardware_state;
		zone2_status?: hardware_state;
	} = {};

	if (args.patch.zone_1_target_temp !== undefined) {
		data.zone1_target_temp = args.patch.zone_1_target_temp;
	}
	if (args.patch.zone_2_target_temp !== undefined) {
		data.zone2_target_temp = args.patch.zone_2_target_temp;
	}
	if (args.patch.zone_1_status !== undefined) {
		data.zone1_status = boolToHardwareState(args.patch.zone_1_status);
	}
	if (args.patch.zone_2_status !== undefined) {
		data.zone2_status = boolToHardwareState(args.patch.zone_2_status);
	}

	if (Object.keys(data).length === 0) return;

	await prisma.box_telemetry_latest.upsert({
		where: { box_id: args.box_id },
		create: { box_id: args.box_id, ...data },
		update: data,
	});
};

export const applyMedicalMobileBoxSettingsPatch = async (args: {
	box_id: string;
	client_id: string;
	patch: MobileBoxSettingsPatch;
}) => {
	validateMedicalMobileSettingsPatch(args.patch);

	const grubpacPayload = mapMedicalMobileSettingsPatchToGrubpac(args.patch);

	if (Object.keys(grubpacPayload).length > 0) {
		await actionGrubpac({
			ids: [args.box_id],
			client_id: args.client_id,
			...grubpacPayload,
		});
	}

	await applyMedicalMobileTargetTelemetryPatch({
		box_id: args.box_id,
		patch: args.patch,
	});
};

export const medicalMobileSettingsPatchHasField = (patch: MobileBoxSettingsPatch): boolean =>
	Object.values(patch).some((value) => value !== undefined);
