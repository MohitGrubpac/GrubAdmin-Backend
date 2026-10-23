/** Medical mobile zone target temperature bounds (°C). */
export const MEDICAL_MOBILE_ZONE_TEMP_MIN = -20;
export const MEDICAL_MOBILE_ZONE_TEMP_MAX = 70;

export const MEDICAL_MOBILE_OTP_TTL_SECONDS = 600;

export const assertMedicalMobileZoneTargetTemp = (value: number, fieldLabel: string): void => {
	if (!Number.isFinite(value)) {
		throw new Error(`${fieldLabel} must be a finite number`);
	}
	if (value < MEDICAL_MOBILE_ZONE_TEMP_MIN || value > MEDICAL_MOBILE_ZONE_TEMP_MAX) {
		throw new Error(
			`${fieldLabel} must be between ${MEDICAL_MOBILE_ZONE_TEMP_MIN} and ${MEDICAL_MOBILE_ZONE_TEMP_MAX}`,
		);
	}
};
