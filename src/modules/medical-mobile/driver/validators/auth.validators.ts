import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { validatorErrorHandler } from "@/utils/zod.ts";

const identityFields = {
	email: z.string().trim().email("Please provide a valid email address").optional(),
	phone: z.string().trim().optional(),
	type: z.enum(["email", "phone"]).optional(),
	body: z.string().trim().optional(),
};

const identityRefine = (data: any) => {
	const hasEmail = !!data.email;
	const hasPhone = !!data.phone;
	const hasTypeBody = !!(data.type && data.body);

	if ((data.type && !data.body) || (!data.type && data.body)) {
		return false;
	}

	const count = [hasEmail, hasPhone, hasTypeBody].filter(Boolean).length;
	return count === 1;
};


const identityRefineOptions = {
	message: "Please provide either email, phone, or a combination of type and body.",
	path: ["email"],
};

const identityTransform = (data: any) => {
	if (data.type && data.body) {
		if (data.type === "email") {
			data.email = String(data.body).trim().toLowerCase();
		} else if (data.type === "phone") {
			data.phone = String(data.body).trim();
		}
	}
	if (data.email) {
		data.email = String(data.email).trim().toLowerCase();
	}
	if (data.phone) {
		data.phone = String(data.phone).trim();
	}
	return data;
};

export const refreshTokenRequestBodyValidator = zValidator(
	"json",
	z.object({
		refresh_token: z.string().min(1, "Refresh token is required"),
	}),
	(response) => {
		if (!response.success) {
			validatorErrorHandler(response.error);
		}
	},
);

export const loginRequestBodyValidator = zValidator(
	"json",
	z
		.object({
			...identityFields,
			password: z
				.string({
					error: "Please provide a valid password",
				})
				.trim()
				.min(8, "Password must be at least 8 characters long!")
				.max(20, "Password must be at most 20 characters long!"),
		})
		.refine(identityRefine, identityRefineOptions)
		.transform(identityTransform),
	(response) => {
		if (!response.success) {
			validatorErrorHandler(response.error);
		}
	},
);


export const sendOtpRequestBodyValidator = zValidator(
	"json",
	z
		.object({
			...identityFields,
		})
		.refine(identityRefine, identityRefineOptions)
		.transform(identityTransform),
	(response) => {
		if (!response.success) {
			validatorErrorHandler(response.error);
		}
	},
);

export const verifyOtpRequestBodyValidator = zValidator(
	"json",
	z
		.object({
			...identityFields,
			otp: z
				.string({
					error: "Please provide an otp",
				})
				.trim()
				.min(4, {
					error: "Otp must be 4 characters long!",
				})
				.max(4, {
					error: "Otp must be 4 characters long!",
				}),
		})
		.refine(identityRefine, identityRefineOptions)
		.transform(identityTransform),
	(response) => {
		if (!response.success) {
			validatorErrorHandler(response.error);
		}
	},
);

export const sendForgetPasswordOtpRequestBodyValidator = zValidator(
	"json",
	z
		.object({
			...identityFields,
		})
		.refine(identityRefine, identityRefineOptions)
		.transform(identityTransform),
	(response) => {
		if (!response.success) {
			validatorErrorHandler(response.error);
		}
	},
);


export const resetPasswordRequestBodyValidator = zValidator(
	"json",
	z
		.object({
			...identityFields,
			otp: z
				.string({
					error: "Please provide an otp",
				})
				.trim()
				.min(4, {
					error: "Otp must be 4 characters long!",
				})
				.max(4, {
					error: "Otp must be 4 characters long!",
				}),
			password: z
				.string({
					error: "Please provide a password",
				})
				.trim()
				.min(8, {
					error: "Password must be at least 8 characters long",
				})
				.max(20, {
					error: "Password can be at max 20 characters long",
				}),
		})
		.refine(identityRefine, identityRefineOptions)
		.transform(identityTransform),
	(response) => {
		if (!response.success) {
			validatorErrorHandler(response.error);
		}
	},
);




export const setNewPasswordRequestBodyValidator = zValidator(
	"json",
	z
		.object({
			...identityFields,
			auth_token: z
				.string({
					error: "Please provide an auth token",
				})
				.optional(),
			"auth-token": z
				.string({
					error: "Please provide an auth token",
				})
				.optional(),
			token: z
				.string({
					error: "Please provide an auth token",
				})
				.optional(),
			password: z
				.string({
					error: "Please provide a password",
				})
				.trim()
				.min(8, {
					error: "Password must be at least 8 characters long",
				})
				.max(20, {
					error: "Password can be at max 20 characters long",
				}),
			confirm_password: z
				.string({
					error: "Please provide a confirm password",
				})
				.trim()
				.min(8, {
					error: "Password must be at least 8 characters long",
				})
				.max(20, {
					error: "Password can be at max 20 characters long",
				}),
		})
		.refine(identityRefine, identityRefineOptions)
		.transform(identityTransform)
		.refine((data) => data.password === data.confirm_password, {
			message: "Passwords do not match",
			path: ["confirm_password"],
		}),
	(response) => {
		if (!response.success) {
			validatorErrorHandler(response.error);
		}
	},
);


export const checkAccountRequestBodyValidator = zValidator(
	"json",
	z
		.object({
			...identityFields,
		})
		.refine(identityRefine, identityRefineOptions)
		.transform(identityTransform),
	(response) => {
		if (!response.success) {
			validatorErrorHandler(response.error);
		}
	},
);


