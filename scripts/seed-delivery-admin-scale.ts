/**

 * Delivery + Admin portal scale seed — realistic Indian demo data.

 *

 * Target (default): 500 clients, 50k employees (500 managers + 49.5k drivers),

 * 50k boxes, ~74k driver-box links. Marker: GRB-* display IDs + @grubdemo.in emails.

 *

 * Staging / pre-prod only — refuses grub_prod unless ALLOW_SCALE_SEED_ON_PROD=true.

 *

 * Dry run (read-only plan): SCALE_DRY_RUN=1 bun scripts/seed-delivery-admin-scale.ts

 * Re-seed after cleanup: SCALE_FORCE_RESEED=1 bun scripts/seed-delivery-admin-scale.ts

 *

 * Full run on EC2 staging:

 *   cd ~/grubadmin-backend-staging/GrubAdmin-Backend

 *   export PATH="/home/ubuntu/.local/share/fnm/node-versions/v22.23.2/installation/bin:/home/ubuntu/.bun/bin:$PATH"

 *   set -a; source .env.production; set +a

 *   bun scripts/seed-delivery-admin-scale.ts

 */

import { ulid } from "ulid";

import { prisma } from "@/db";

import { Bcrypt } from "@/utils/bcrypt";

import { DELIVERY_VERTICAL_NAME } from "@/configs/constants";

import { seedVerticals } from "@/cmd/seed-verticals";

import { seedRoles } from "@/cmd/seed-roles";



/** Display-ID prefix and email domain used for idempotent detection / cleanup. */

export const SEED_MARKER = "GRB";

export const EMAIL_DOMAIN = "grubdemo.in";



const DRY_RUN = process.env.SCALE_DRY_RUN === "1";

const FORCE_RESEED = process.env.SCALE_FORCE_RESEED === "1";

const BATCH_SIZE = DRY_RUN ? 100 : 500;



const CLIENT_COUNT = DRY_RUN ? 5 : 500;

const BOXES_PER_CLIENT = DRY_RUN ? 10 : 100;

const DRIVERS_PER_CLIENT = DRY_RUN ? 9 : 99;

const ADMIN_COUNT = DRY_RUN ? 2 : 20;



const TOTAL_BOXES = CLIENT_COUNT * BOXES_PER_CLIENT;

const TOTAL_MANAGERS = CLIENT_COUNT;

const TOTAL_DRIVERS = CLIENT_COUNT * DRIVERS_PER_CLIENT;

const TOTAL_EMPLOYEES = TOTAL_MANAGERS + TOTAL_DRIVERS;



const SHARED_EMPLOYEE_PASSWORD = "GrubScale2026!";

const SHARED_ADMIN_PASSWORD = "GrubScaleAdmin2026!";



const INDIAN_FIRST_NAMES = [

	"Raj", "Priya", "Amit", "Sneha", "Rahul", "Ananya", "Vikram", "Kavya",

	"Arjun", "Meera", "Sanjay", "Pooja", "Rohan", "Divya", "Karan", "Neha",

	"Aditya", "Isha", "Manish", "Shreya",

] as const;



const INDIAN_LAST_NAMES = [

	"Sharma", "Patel", "Mehta", "Reddy", "Iyer", "Gupta", "Singh", "Khan",

	"Desai", "Nair", "Joshi", "Kapoor", "Verma", "Malhotra", "Chopra", "Rao",

] as const;



const INDIAN_CITIES = [

	{ city: "Mumbai", state: "Maharashtra", rto: "MH" },

	{ city: "Delhi", state: "Delhi", rto: "DL" },

	{ city: "Bengaluru", state: "Karnataka", rto: "KA" },

	{ city: "Pune", state: "Maharashtra", rto: "MH" },

	{ city: "Hyderabad", state: "Telangana", rto: "TS" },

	{ city: "Chennai", state: "Tamil Nadu", rto: "TN" },

	{ city: "Kolkata", state: "West Bengal", rto: "WB" },

	{ city: "Ahmedabad", state: "Gujarat", rto: "GJ" },

] as const;



const RESTAURANT_PREFIXES = [

	"Spice Route Kitchen",

	"Tandoor Express",

	"Masala Junction",

	"Curry Leaf Cafe",

	"Desi Delight",

	"Royal Biryani House",

	"Street Zaika",

	"Green Bowl Kitchen",

] as const;



const ORG_SUFFIXES = ["Foods Pvt Ltd", "Hospitality Services", "Catering Co", "Restaurants Group"] as const;



const pad = (n: number, width: number) => String(n).padStart(width, "0");



const pick = <T,>(pool: readonly T[], index: number): T => pool[index % pool.length]!;



const slugify = (value: string) =>

	value

		.toLowerCase()

		.replace(/pvt\.?\s*ltd\.?/gi, "")

		.replace(/[^a-z0-9]+/g, "")

		.slice(0, 24) || "demoorg";



const indianName = (index: number) => ({

	first: pick(INDIAN_FIRST_NAMES, index),

	last: pick(INDIAN_LAST_NAMES, index + 3),

});



const cityForClient = (clientIdx: number) => pick(INDIAN_CITIES, clientIdx - 1);



const clientDisplayId = (clientIdx: number) => {

	const { rto } = cityForClient(clientIdx);

	return `${SEED_MARKER}-CLT-${rto}-${pad(clientIdx, 6)}`;

};



const managerDisplayId = (clientIdx: number) => {

	const { rto } = cityForClient(clientIdx);

	return `${SEED_MARKER}-MGR-${rto}-${pad(clientIdx, 6)}`;

};



const driverDisplayId = (clientIdx: number, driverIdx: number) => {

	const { rto } = cityForClient(clientIdx);

	return `${SEED_MARKER}-DRV-${rto}-${pad(clientIdx, 4)}-${pad(driverIdx, 3)}`;

};



const boxDisplayId = (clientIdx: number, boxNum: number) => {

	const { rto } = cityForClient(clientIdx);

	return `${SEED_MARKER}-BOX-${rto}-${pad((clientIdx - 1) * BOXES_PER_CLIENT + boxNum, 6)}`;

};



const restaurantNameFor = (clientIdx: number) => {

	const location = cityForClient(clientIdx);

	return `${pick(RESTAURANT_PREFIXES, clientIdx)} — ${location.city}`;

};



const organizationNameFor = (clientIdx: number) => {

	const { last } = indianName(clientIdx);

	return `${last} ${pick(ORG_SUFFIXES, clientIdx)}`;

};



const orgSlugFor = (clientIdx: number) => slugify(organizationNameFor(clientIdx));



const restaurantSlugFor = (clientIdx: number) => slugify(pick(RESTAURANT_PREFIXES, clientIdx));



const adminEmail = (index: number) => `admin${pad(index, 2)}@${EMAIL_DOMAIN}`;



const clientEmailFor = (clientIdx: number) =>
	`accounts.${pad(clientIdx, 6)}@${orgSlugFor(clientIdx)}.${EMAIL_DOMAIN}`;



const managerEmailFor = (clientIdx: number) => {

	const { first, last } = indianName(clientIdx);

	return `${first.toLowerCase()}.${last.toLowerCase()}.mgr${pad(clientIdx, 6)}@${restaurantSlugFor(clientIdx)}.${EMAIL_DOMAIN}`;

};



const driverEmailFor = (clientIdx: number, driverNum: number) => {

	const driver = indianName(clientIdx * 100 + driverNum);

	return `${driver.first.toLowerCase()}.${driver.last.toLowerCase()}.${pad(driverNum, 3)}@${orgSlugFor(clientIdx)}.${EMAIL_DOMAIN}`;

};



const indianMobile = (clientIdx: number, slot: number) => {

	const base = 9000000000 + ((clientIdx * 997 + slot * 13) % 999999999);

	return String(base).slice(0, 10);

};



const vehicleNumberFor = (clientIdx: number, boxNum: number) => {

	const { rto } = cityForClient(clientIdx);

	const series =

		String.fromCharCode(65 + (boxNum % 26)) +

		String.fromCharCode(65 + ((boxNum + 7) % 26));

	return `${rto}-12-${series}-${pad(boxNum, 4)}`;

};



const boxNameFor = (clientIdx: number, boxNum: number) => {

	const location = cityForClient(clientIdx);

	if (boxNum % 2 === 0) {

		return `GrubPac ${location.rto}-${pad(boxNum, 3)}`;

	}

	return `Fleet Unit ${location.city} ${pad(boxNum, 3)}`;

};



const assertSafeDatabase = (databaseUrl: string) => {

	const dbName = databaseUrl.match(/\/([^/?]+)(\?|$)/)?.[1] ?? "";

	if (dbName === "grub_prod" && process.env.ALLOW_SCALE_SEED_ON_PROD !== "true") {

		throw new Error(

			"Refusing scale seed on grub_prod. Use staging/pre-prod only, or set ALLOW_SCALE_SEED_ON_PROD=true.",

		);

	}

	return dbName;

};



async function ensureFoundation() {

	await seedVerticals();

	const roleIds = await seedRoles();

	const deliveryVertical = await prisma.vertical.findUnique({

		where: { name: DELIVERY_VERTICAL_NAME },

	});

	if (!deliveryVertical) {

		throw new Error(`Delivery vertical not found after seedVerticals()`);

	}

	return { deliveryVerticalId: deliveryVertical.id, roleIds };

}



async function isAlreadySeeded(): Promise<boolean> {

	const count = await prisma.client.count({

		where: { client_display_id: { startsWith: `${SEED_MARKER}-CLT-` } },

	});

	return count >= CLIENT_COUNT;

}



async function seedScaleAdmins(

	roleIds: Record<string, string>,

	adminPasswordHash: string,

) {

	const adminRoleId = roleIds.admin;

	const superAdminRoleId = roleIds["super admin"];

	if (!adminRoleId || !superAdminRoleId) {

		throw new Error("Admin roles missing — run seedRoles first.");

	}



	for (let i = 1; i <= ADMIN_COUNT; i++) {

		const { first, last } = indianName(i + 50);

		const email = adminEmail(i);

		const employeeId = `${SEED_MARKER}-ADM-${pad(i, 4)}`;

		const isPrimary = i === 1;



		await prisma.admin.upsert({

			where: { email },

			update: {

				first_name: first,

				last_name: last,

				password: adminPasswordHash,

				status: "active",

				role_id: isPrimary ? superAdminRoleId : adminRoleId,

				employee_id: employeeId,

				country_code: "+91",

				mobile_number: indianMobile(i, 1),

			},

			create: {

				id: ulid(),

				first_name: first,

				last_name: last,

				email,

				password: adminPasswordHash,

				status: "active",

				role_id: isPrimary ? superAdminRoleId : adminRoleId,

				country_code: "+91",

				mobile_number: indianMobile(i, 1),

				employee_id: employeeId,

			},

		});

	}

	console.log(

		`[demo-seed] Admins: ${ADMIN_COUNT} (admin01 = super admin, admins 02-${pad(ADMIN_COUNT, 2)} = admin role, password login)`,

	);

}



type ClientBundle = {

	clientId: string;

	restaurantId: string;

	managerId: string;

	driverIds: string[];

	boxIds: string[];

};



async function seedClientsAndStructure(

	deliveryVerticalId: string,

	employeePasswordHash: string,

): Promise<ClientBundle[]> {

	const bundles: ClientBundle[] = [];



	for (let c = 1; c <= CLIENT_COUNT; c++) {

		const clientId = ulid();

		const restaurantId = ulid();

		const managerId = ulid();

		const driverIds = Array.from({ length: DRIVERS_PER_CLIENT }, () => ulid());

		const boxIds = Array.from({ length: BOXES_PER_CLIENT }, () => ulid());

		const location = cityForClient(c);

		const manager = indianName(c);

		const clientName = `${manager.first} ${manager.last} — ${location.city}`;



		await prisma.client.create({

			data: {

				id: clientId,

				name: clientName,

				client_display_id: clientDisplayId(c),

				organization_name: organizationNameFor(c),

				country: "India",

				state: location.state,

				email: clientEmailFor(c),

				country_code: "+91",

				mobile_number: indianMobile(c, 2),

				status: "active",

				vertical_id: deliveryVerticalId,

			},

		});



		await prisma.restaurant.create({

			data: {

				id: restaurantId,

				name: restaurantNameFor(c),

				client_id: clientId,

				city: location.city,

				state: location.state,

				status: "active",

			},

		});



		await prisma.vertical_delivery_employee.create({

			data: {

				id: managerId,

				first_name: manager.first,

				last_name: manager.last,

				country_code: "+91",

				mobile_number: indianMobile(c, 3),

				email: managerEmailFor(c),

				password: employeePasswordHash,

				employee_display_id: managerDisplayId(c),

				client_id: clientId,

				restaurant_id: restaurantId,

				role: "manager",

				status: "active",

			},

		});



		for (let batchStart = 0; batchStart < DRIVERS_PER_CLIENT; batchStart += BATCH_SIZE) {

			const batchEnd = Math.min(batchStart + BATCH_SIZE, DRIVERS_PER_CLIENT);

			const rows = [];

			for (let d = batchStart; d < batchEnd; d++) {

				const driverNum = d + 1;

				const driver = indianName(c * 100 + driverNum);

				rows.push({

					id: driverIds[d]!,

					first_name: driver.first,

					last_name: driver.last,

					country_code: "+91",

					mobile_number: indianMobile(c * 100 + driverNum, 4),

					email: driverEmailFor(c, driverNum),

					password: employeePasswordHash,

					employee_display_id: driverDisplayId(c, driverNum),

					client_id: clientId,

					restaurant_id: restaurantId,

					role: "delivery" as const,

					status: "active" as const,

				});

			}

			await prisma.vertical_delivery_employee.createMany({ data: rows });

		}



		for (let batchStart = 0; batchStart < BOXES_PER_CLIENT; batchStart += BATCH_SIZE) {

			const batchEnd = Math.min(batchStart + BATCH_SIZE, BOXES_PER_CLIENT);

			const boxRows = [];

			const telemetryRows = [];

			for (let b = batchStart; b < batchEnd; b++) {

				const boxNum = b + 1;

				const boxId = boxIds[b]!;

				boxRows.push({

					id: boxId,

					name: boxNameFor(c, boxNum),

					box_display_id: boxDisplayId(c, boxNum),

					vertical_id: deliveryVerticalId,

					client_id: clientId,

					status: "active" as const,

					vehicle_number: vehicleNumberFor(c, boxNum),

				});

				telemetryRows.push({

					id: ulid(),

					box_id: boxId,

					power_status: "on" as const,

					connection_status: "disconnected" as const,

					health_status: "healthy" as const,

					battery_percentage: 70 + (boxNum % 30),

					wifi_status: "on" as const,

					gps_status: "on" as const,

					ext_temp: 28 + (boxNum % 8),

					zone1_temp: 4,

				});

			}

			await prisma.box.createMany({ data: boxRows });

			await prisma.box_telemetry_latest.createMany({ data: telemetryRows });

		}



		const restaurantBoxRows = boxIds.map((boxId) => ({

			id: ulid(),

			restaurant_id: restaurantId,

			box_id: boxId,

			status: "shared" as const,

		}));

		for (let i = 0; i < restaurantBoxRows.length; i += BATCH_SIZE) {

			await prisma.restaurant_box.createMany({

				data: restaurantBoxRows.slice(i, i + BATCH_SIZE),

			});

		}



		bundles.push({ clientId, restaurantId, managerId, driverIds, boxIds });



		if (c % 50 === 0 || c === CLIENT_COUNT) {

			console.log(`[demo-seed] Clients ${c}/${CLIENT_COUNT}`);

		}

	}



	return bundles;

}



async function seedDriverBoxLinks(bundles: ClientBundle[]) {

	let linkCount = 0;

	for (let c = 0; c < bundles.length; c++) {

		const bundle = bundles[c]!;

		const linkRows: Array<{

			id: string;

			employee_id: string;

			box_id: string;

			status: "shared";

			access: "direct";

		}> = [];



		for (let d = 0; d < bundle.driverIds.length; d++) {

			const employeeId = bundle.driverIds[d]!;

			const primaryBox = bundle.boxIds[d % BOXES_PER_CLIENT]!;

			linkRows.push({

				id: ulid(),

				employee_id: employeeId,

				box_id: primaryBox,

				status: "shared",

				access: "direct",

			});

			if (d % 2 === 0) {

				const secondaryBox = bundle.boxIds[(d + 1) % BOXES_PER_CLIENT]!;

				linkRows.push({

					id: ulid(),

					employee_id: employeeId,

					box_id: secondaryBox,

					status: "shared",

					access: "direct",

				});

			}

		}



		for (let i = 0; i < linkRows.length; i += BATCH_SIZE) {

			await prisma.vertical_delivery_employee_box.createMany({

				data: linkRows.slice(i, i + BATCH_SIZE),

				skipDuplicates: true,

			});

		}

		linkCount += linkRows.length;



		if ((c + 1) % 50 === 0 || c + 1 === bundles.length) {

			console.log(`[demo-seed] Driver-box links through client ${c + 1}/${bundles.length}`);

		}

	}

	return linkCount;

}



async function main() {

	const dbUrl = process.env.DATABASE_URL ?? "";

	if (!dbUrl) {

		throw new Error("DATABASE_URL is required");

	}

	const dbName = assertSafeDatabase(dbUrl);

	const started = Date.now();



	console.log(`\n[demo-seed] DATABASE: ${dbName}`);

	console.log(`[demo-seed] DRY_RUN=${DRY_RUN} FORCE_RESEED=${FORCE_RESEED}`);

	console.log(

		`[demo-seed] Plan: ${CLIENT_COUNT} clients, ${TOTAL_EMPLOYEES} employees, ${TOTAL_BOXES} boxes\n`,

	);



	if (!FORCE_RESEED && (await isAlreadySeeded())) {

		console.log(`[demo-seed] Already seeded (${SEED_MARKER} clients present). Exiting.`);

		console.log("  Set SCALE_FORCE_RESEED=1 after cleanup to re-run.");

		return;

	}



	if (DRY_RUN) {

		const sampleCity = cityForClient(1);

		const samplePerson = indianName(1);

		console.log("[demo-seed] DRY_RUN — no database writes.");

		console.log("\nSample records that would be created:");

		console.log(`  Admin: ${adminEmail(1)} / ${SHARED_ADMIN_PASSWORD} (super admin, password login)`);

		console.log(

			`  Client: ${clientDisplayId(1)} — ${samplePerson.first} ${samplePerson.last} — ${sampleCity.city}`,

		);

		console.log(`  Org: ${organizationNameFor(1)}`);

		console.log(`  Client email: ${clientEmailFor(1)}`);

		console.log(`  Restaurant: ${restaurantNameFor(1)}`);

		console.log(`  Manager: ${managerEmailFor(1)}`);

		console.log(`  Driver: ${driverEmailFor(1, 1)}`);

		console.log(`  Box: ${boxDisplayId(1, 1)} — ${boxNameFor(1, 1)} — vehicle ${vehicleNumberFor(1, 1)}`);

		console.log("");

		return;

	}



	const { deliveryVerticalId, roleIds } = await ensureFoundation();

	const employeePasswordHash = await Bcrypt.generateHash({

		data: SHARED_EMPLOYEE_PASSWORD,

		saltLength: 10,

	});

	const adminPasswordHash = await Bcrypt.generateHash({

		data: SHARED_ADMIN_PASSWORD,

		saltLength: 10,

	});



	await seedScaleAdmins(roleIds, adminPasswordHash);

	const bundles = await seedClientsAndStructure(deliveryVerticalId, employeePasswordHash);

	const linkCount = await seedDriverBoxLinks(bundles);



	const sampleCity = cityForClient(1);

	const sampleManager = indianName(1);

	const elapsedSec = Math.round((Date.now() - started) / 1000);

	console.log("\n=== Demo seed complete ===");

	console.table({

		clients: CLIENT_COUNT,

		managers: TOTAL_MANAGERS,

		drivers: TOTAL_DRIVERS,

		boxes: TOTAL_BOXES,

		restaurant_box_links: TOTAL_BOXES,

		driver_box_links: linkCount,

		admins: ADMIN_COUNT,

		elapsed_seconds: elapsedSec,

	});

	console.log("\nSample records:");

	console.log(`  Client: ${clientDisplayId(1)} — ${sampleManager.first} ${sampleManager.last} — ${sampleCity.city}, ${sampleCity.state}`);

	console.log(`  Org: ${organizationNameFor(1)}`);

	console.log(`  Restaurant: ${restaurantNameFor(1)}`);

	console.log(`  Box: ${boxDisplayId(1, 1)} — ${boxNameFor(1, 1)} — ${vehicleNumberFor(1, 1)}`);

	console.log("\nSample logins:");

	console.log(`  Admin: ${adminEmail(1)} / ${SHARED_ADMIN_PASSWORD} (super admin, password login)`);

	console.log(`  Manager: ${managerEmailFor(1)} / ${SHARED_EMPLOYEE_PASSWORD}`);

	console.log(`  Driver: ${driverEmailFor(1, 1)} / ${SHARED_EMPLOYEE_PASSWORD}`);

	console.log("");

}



main()

	.catch((err) => {

		console.error("[demo-seed] FAILED:", err);

		process.exit(1);

	})

	.finally(async () => {

		await prisma.$disconnect();

	});


