import { prisma } from "@/db";
import { randomUUID } from "crypto";
import type {
	MedicalEmergencyAlertRequest,
	MedicalEmergencyAlertResponse,
	MedicalEmergencyCallMetadata,
} from "@/types/medical-mobile/emergency";
import { resolveHandlerBoxById } from "@/db/actions/medical-mobile/box.actions.ts";
import { resolveOwnerBoxById } from "@/db/actions/medical-mobile/owner-box.actions.ts";
import { loggerService } from "@/services/system-log.ts";

const toE164 = (country_code?: string | null, mobile_number?: string | null): string => {
	const cc = (country_code ?? "").replace(/\D/g, "");
	const num = (mobile_number ?? "").replace(/\D/g, "");
	if (!num) return "";
	return cc ? `+${cc}${num}` : num;
};

export const getEmergencyCallMetadata = async (
	client_id: string,
): Promise<MedicalEmergencyCallMetadata> => {
	const client = await prisma.client.findUnique({
		where: { id: client_id },
		select: {
			organization_name: true,
			name: true,
			country_code: true,
			mobile_number: true,
		},
	});

	return {
		facility_name: client?.organization_name || client?.name || "",
		phone_e164: toE164(client?.country_code, client?.mobile_number),
	};
};

export const postEmergencyAlert = async (args: {
	client_id: string;
	employee_id: string;
	employee_email: string;
	actor_role: "handler" | "owner";
	payload: MedicalEmergencyAlertRequest;
}): Promise<MedicalEmergencyAlertResponse> => {
	if (args.payload.box_id) {
		if (args.actor_role === "owner") {
			await resolveOwnerBoxById({
				box_id: args.payload.box_id,
				client_id: args.client_id,
			});
		} else {
			await resolveHandlerBoxById({
				box_id: args.payload.box_id,
				client_id: args.client_id,
				employee_id: args.employee_id,
			});
		}
	}

	const incident_id = randomUUID();
	const dispatched_at = new Date().toISOString();

	try {
		await loggerService.log({
			category: "GrubLock",
			type: "Alerts",
			actor: {
				id: args.employee_id,
				name: args.employee_email || "Handler",
				role: args.actor_role === "owner" ? "owner" : "handler",
				table: args.actor_role === "owner" ? "client" : "vertical_medical_employee",
			},
			client_id: args.client_id,
			subject: args.payload.box_id
				? { id: args.payload.box_id, name: args.payload.box_id, type: "box" }
				: undefined,
			metadata: {
				incident_id,
				lat: args.payload.lat,
				lng: args.payload.lng,
				note: args.payload.note ?? null,
			},
		});
	} catch {
		// logging must not block SOS response
	}

	return { incident_id, dispatched_at };
};
