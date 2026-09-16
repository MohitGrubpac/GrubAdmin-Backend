/**
 * Idempotent preprod seed: medical mobile test boxes (grub_preprod only).
 *
 * Ensures MOBILE-TEST-MED-001 has 2 GrubPacs + department links + driver assignments
 * + owner claims (employee_id null) so owner connect works without POST /boxes/claim.
 *
 * EC2:
 *   cd /home/ubuntu/grubadmin-backend-preprod/GrubAdmin-Backend
 *   export PATH="/home/ubuntu/.local/share/fnm/node-versions/v22.23.2/installation/bin:/home/ubuntu/.bun/bin:$PATH"
 *   set -a; source .env.production; set +a
 *   bun scripts/fix-medical-mobile-test-data-preprod.ts
 */
import { ulid } from "ulid";
import { prisma } from "@/db";
import { MEDICAL_VERTICAL_NAME } from "@/configs/constants";
import { assertTargetDb } from "./lib/assert-target-db";

const PREPROD_API_BASE = "https://preprod.43.204.34.10.nip.io/api/v1";
const CLIENT_DISPLAY_ID = "MOBILE-TEST-MED-001";
const DEPARTMENT_NAME = "Mobile Test Department";
const DRIVER_EMAIL = "medical.driver@grubpac.com";

const BOXES = [
	{ display_id: "MOB-MED-BOX-01", name: "Mobile Med Unit #1", vehicle: "TX-MOB-001" },
	{ display_id: "MOB-MED-BOX-02", name: "Mobile Med Unit #2", vehicle: "TX-MOB-002" },
] as const;

async function getMedicalVerticalId(): Promise<string> {
	const vertical = await prisma.vertical.findUnique({ where: { name: MEDICAL_VERTICAL_NAME } });
	if (!vertical) {
		throw new Error(`Vertical "${MEDICAL_VERTICAL_NAME}" not found — run seed-preprod-foundation first.`);
	}
	return vertical.id;
}

async function ensureBox(
	medicalVerticalId: string,
	clientId: string,
	def: (typeof BOXES)[number],
) {
	const existing = await prisma.box.findUnique({ where: { box_display_id: def.display_id } });
	const box = existing
		? await prisma.box.update({
				where: { id: existing.id },
				data: {
					name: def.name,
					vertical_id: medicalVerticalId,
					client_id: clientId,
					status: "active",
					vehicle_number: def.vehicle,
				},
			})
		: await prisma.box.create({
				data: {
					id: ulid(),
					name: def.name,
					box_display_id: def.display_id,
					vertical_id: medicalVerticalId,
					client_id: clientId,
					status: "active",
					vehicle_number: def.vehicle,
				},
			});

	const telemetry = await prisma.box_telemetry_latest.findUnique({ where: { box_id: box.id } });
	const telemetryData = {
		power_status: "on" as const,
		connection_status: "disconnected" as const,
		health_status: "healthy" as const,
		battery_percentage: 90,
		wifi_status: "on" as const,
		gps_status: "on" as const,
		ext_temp: 21,
		zone1_temp: 5,
	};
	if (telemetry) {
		await prisma.box_telemetry_latest.update({
			where: { box_id: box.id },
			data: telemetryData,
		});
	} else {
		await prisma.box_telemetry_latest.create({
			data: { id: ulid(), box_id: box.id, ...telemetryData },
		});
	}

	await prisma.box_lock.upsert({
		where: { box_id: box.id },
		create: { box_id: box.id, lock_status: "unlocked" },
		update: {},
	});

	return box;
}

async function ensureDepartmentBox(departmentId: string, boxId: string) {
	const existing = await prisma.vertical_medical_department_box.findFirst({
		where: { department_id: departmentId, box_id: boxId },
	});
	if (existing) {
		if (existing.status !== "shared") {
			await prisma.vertical_medical_department_box.update({
				where: { id: existing.id },
				data: { status: "shared" },
			});
		}
		return;
	}
	await prisma.vertical_medical_department_box.create({
		data: {
			id: ulid(),
			department_id: departmentId,
			box_id: boxId,
			status: "shared",
		},
	});
}

/** Owner claim row — required for list/connect/lock owner APIs (see claimOwnerBox). */
async function ensureOwnerBoxClaim(boxId: string) {
	const existing = await prisma.vertical_medical_employee_box.findFirst({
		where: { box_id: boxId, employee_id: null },
	});
	if (existing) {
		if (existing.status !== "shared" || existing.access !== "direct") {
			await prisma.vertical_medical_employee_box.update({
				where: { id: existing.id },
				data: { status: "shared", access: "direct" },
			});
		}
		return existing.id;
	}
	const created = await prisma.vertical_medical_employee_box.create({
		data: {
			id: ulid(),
			box_id: boxId,
			employee_id: null,
			status: "shared",
			access: "direct",
		},
	});
	return created.id;
}

async function ensureEmployeeBox(employeeId: string, boxId: string) {
	const existing = await prisma.vertical_medical_employee_box.findFirst({
		where: { employee_id: employeeId, box_id: boxId },
	});
	if (existing) {
		if (existing.status !== "shared") {
			await prisma.vertical_medical_employee_box.update({
				where: { id: existing.id },
				data: { status: "shared" },
			});
		}
		return existing.id;
	}
	const created = await prisma.vertical_medical_employee_box.create({
		data: {
			id: ulid(),
			employee_id: employeeId,
			box_id: boxId,
			status: "shared",
			access: "direct",
		},
	});
	return created.id;
}

async function main() {
	assertTargetDb("grub_preprod");
	console.log("\n[fix-medical-mobile-test-data-preprod]\n");

	const medicalVerticalId = await getMedicalVerticalId();

	const client = await prisma.client.findFirst({
		where: { client_display_id: CLIENT_DISPLAY_ID, vertical_id: medicalVerticalId },
	});
	if (!client) {
		throw new Error(`Client ${CLIENT_DISPLAY_ID} not found — run seed-mobile-vertical-preprod-users.ts first.`);
	}

	const department = await prisma.vertical_medical_department.findFirst({
		where: { client_id: client.id, name: DEPARTMENT_NAME },
	});
	if (!department) {
		throw new Error(`Department "${DEPARTMENT_NAME}" not found for ${CLIENT_DISPLAY_ID}.`);
	}

	const driver = await prisma.vertical_medical_employee.findFirst({
		where: { client_id: client.id, email: DRIVER_EMAIL },
	});
	if (!driver) {
		throw new Error(`Driver ${DRIVER_EMAIL} not found — run seed-mobile-vertical-preprod-users.ts first.`);
	}

	const boxRows: Array<{ display_id: string; id: string; name: string | null }> = [];
	for (const def of BOXES) {
		const box = await ensureBox(medicalVerticalId, client.id, def);
		await ensureDepartmentBox(department.id, box.id);
		await ensureOwnerBoxClaim(box.id);
		await ensureEmployeeBox(driver.id, box.id);
		boxRows.push({ display_id: def.display_id, id: box.id, name: box.name });
	}

	await prisma.box.update({
		where: { id: boxRows[0]!.id },
		data: { medical_connection_employee_id: driver.id },
	});

	console.log("=== Medical mobile test data (idempotent) ===\n");
	console.table([
		{
			client_display_id: CLIENT_DISPLAY_ID,
			department: DEPARTMENT_NAME,
			driver_email: DRIVER_EMAIL,
			driver_id: driver.id,
			owner_email: "medical.owner@grubpac.com",
		},
	]);
	console.log("\nGrubPacs:\n");
	console.table(boxRows);
	console.log(`\nDriver list: GET ${PREPROD_API_BASE}/medical-mobile/driver/boxes`);
	console.log(`Owner login: POST ${PREPROD_API_BASE}/medical-mobile/owner/auth/login`);
	console.log("Done.\n");
}

main()
	.catch((err) => {
		console.error("[fix-medical-mobile-test-data-preprod] FAILED:", err);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
