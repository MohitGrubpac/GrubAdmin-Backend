/**
 * Remove delivery admin scale / demo seed data (legacy PILOT50K + new GRB/@grubdemo.in).
 *
 * Staging / pre-prod only — refuses grub_prod unless ALLOW_SCALE_CLEANUP_ON_PROD=true.
 *
 * Dry run: CLEANUP_DRY_RUN=1 bun scripts/cleanup-delivery-admin-scale.ts
 */
import { prisma } from "@/db";

const LEGACY_PREFIX = "PILOT50K";
const DEMO_PREFIX = "GRB";
const LEGACY_EMAIL_DOMAIN = "@scale.test.grubpac.com";
const DEMO_EMAIL_DOMAIN = "@grubdemo.in";
const DEMO_SUBDOMAIN_SUFFIX = `.${DEMO_EMAIL_DOMAIN.replace("@", "")}`;

const DRY_RUN = process.env.CLEANUP_DRY_RUN === "1";
const BATCH_SIZE = 500;

const SCALE_CLIENT_WHERE = {
	OR: [
		{ client_display_id: { startsWith: `${LEGACY_PREFIX}-CLT-` } },
		{ client_display_id: { startsWith: `${DEMO_PREFIX}-CLT-` } },
		{ email: { endsWith: LEGACY_EMAIL_DOMAIN } },
		{ email: { endsWith: DEMO_EMAIL_DOMAIN } },
		{ email: { contains: DEMO_SUBDOMAIN_SUFFIX } },
	],
} as const;

const SCALE_ADMIN_WHERE = {
	OR: [
		{ email: { endsWith: LEGACY_EMAIL_DOMAIN } },
		{ email: { endsWith: DEMO_EMAIL_DOMAIN } },
		{ employee_id: { startsWith: `${LEGACY_PREFIX}-ADM-` } },
		{ employee_id: { startsWith: `${DEMO_PREFIX}-ADM-` } },
	],
} as const;

const SCALE_BOX_DISPLAY_PREFIXES = [`${LEGACY_PREFIX}-BOX-`, `${DEMO_PREFIX}-BOX-`] as const;

const assertSafeDatabase = (databaseUrl: string) => {
	const dbName = databaseUrl.match(/\/([^/?]+)(\?|$)/)?.[1] ?? "";
	if (
		dbName === "grub_prod" &&
		process.env.ALLOW_SCALE_CLEANUP_ON_PROD !== "true"
	) {
		throw new Error(
			"Refusing scale cleanup on grub_prod. Use staging/pre-prod only, or set ALLOW_SCALE_CLEANUP_ON_PROD=true.",
		);
	}
	return dbName;
};

async function countScaleRows() {
	const scaleClients = await prisma.client.findMany({
		where: SCALE_CLIENT_WHERE,
		select: { id: true },
	});
	const clientIds = scaleClients.map((row) => row.id);

	const boxWhere = clientIds.length
		? {
				OR: [
					{ client_id: { in: clientIds } },
					...SCALE_BOX_DISPLAY_PREFIXES.map((prefix) => ({
						box_display_id: { startsWith: prefix },
					})),
				],
			}
		: {
				OR: SCALE_BOX_DISPLAY_PREFIXES.map((prefix) => ({
					box_display_id: { startsWith: prefix },
				})),
			};

	const [
		admins,
		clients,
		restaurants,
		employees,
		employeeBoxes,
		restaurantBoxes,
		telemetry,
		boxes,
	] = await Promise.all([
		prisma.admin.count({ where: SCALE_ADMIN_WHERE }),
		prisma.client.count({ where: SCALE_CLIENT_WHERE }),
		prisma.restaurant.count({
			where: clientIds.length ? { client_id: { in: clientIds } } : { id: "__none__" },
		}),
		prisma.vertical_delivery_employee.count({
			where: clientIds.length ? { client_id: { in: clientIds } } : { id: "__none__" },
		}),
		prisma.vertical_delivery_employee_box.count({
			where: clientIds.length
				? {
						OR: [
							{ employee: { client_id: { in: clientIds } } },
							{ box: { client_id: { in: clientIds } } },
						],
					}
				: { id: "__none__" },
		}),
		prisma.restaurant_box.count({
			where: clientIds.length
				? { restaurant: { client_id: { in: clientIds } } }
				: { id: "__none__" },
		}),
		prisma.box_telemetry_latest.count({
			where: clientIds.length
				? { box: { client_id: { in: clientIds } } }
				: { box_id: "__none__" },
		}),
		prisma.box.count({ where: boxWhere }),
	]);

	return {
		clientIds,
		admins,
		clients,
		restaurants,
		employees,
		employeeBoxes,
		restaurantBoxes,
		telemetry,
		boxes,
	};
}

async function deleteInBatches<T extends { id: string }>(
	label: string,
	fetchBatch: () => Promise<T[]>,
	deleteBatch: (ids: string[]) => Promise<{ count: number }>,
) {
	let total = 0;
	for (;;) {
		const rows = await fetchBatch();
		if (rows.length === 0) break;

		const ids = rows.map((row) => row.id);
		for (let i = 0; i < ids.length; i += BATCH_SIZE) {
			const chunk = ids.slice(i, i + BATCH_SIZE);
			const result = await deleteBatch(chunk);
			total += result.count;
		}

		if (rows.length < BATCH_SIZE) break;
	}

	console.log(`[demo-cleanup] ${label}: ${total}`);
	return total;
}

async function runCleanup(clientIds: string[]) {
	if (clientIds.length === 0) {
		console.log("[demo-cleanup] No scale/demo clients found — checking orphaned boxes/admins only.");
	}

	const boxWhere = clientIds.length
		? {
				OR: [
					{ client_id: { in: clientIds } },
					...SCALE_BOX_DISPLAY_PREFIXES.map((prefix) => ({
						box_display_id: { startsWith: prefix },
					})),
				],
			}
		: {
				OR: SCALE_BOX_DISPLAY_PREFIXES.map((prefix) => ({
					box_display_id: { startsWith: prefix },
				})),
			};

	await deleteInBatches(
		"vertical_delivery_employee_box",
		() =>
			prisma.vertical_delivery_employee_box.findMany({
				where: clientIds.length
					? {
							OR: [
								{ employee: { client_id: { in: clientIds } } },
								{ box: { client_id: { in: clientIds } } },
							],
						}
					: { id: "__none__" },
				select: { id: true },
				take: BATCH_SIZE,
			}),
		(ids) => prisma.vertical_delivery_employee_box.deleteMany({ where: { id: { in: ids } } }),
	);

	await deleteInBatches(
		"restaurant_box",
		() =>
			prisma.restaurant_box.findMany({
				where: clientIds.length
					? { restaurant: { client_id: { in: clientIds } } }
					: { id: "__none__" },
				select: { id: true },
				take: BATCH_SIZE,
			}),
		(ids) => prisma.restaurant_box.deleteMany({ where: { id: { in: ids } } }),
	);

	await deleteInBatches(
		"box_telemetry_latest",
		() =>
			prisma.box_telemetry_latest.findMany({
				where: clientIds.length
					? { box: { client_id: { in: clientIds } } }
					: { box_id: "__none__" },
				select: { id: true },
				take: BATCH_SIZE,
			}),
		(ids) => prisma.box_telemetry_latest.deleteMany({ where: { id: { in: ids } } }),
	);

	await deleteInBatches(
		"box",
		() =>
			prisma.box.findMany({
				where: boxWhere,
				select: { id: true },
				take: BATCH_SIZE,
			}),
		(ids) => prisma.box.deleteMany({ where: { id: { in: ids } } }),
	);

	await deleteInBatches(
		"vertical_delivery_employee",
		() =>
			prisma.vertical_delivery_employee.findMany({
				where: clientIds.length ? { client_id: { in: clientIds } } : { id: "__none__" },
				select: { id: true },
				take: BATCH_SIZE,
			}),
		(ids) =>
			prisma.vertical_delivery_employee.deleteMany({ where: { id: { in: ids } } }),
	);

	await deleteInBatches(
		"restaurant",
		() =>
			prisma.restaurant.findMany({
				where: clientIds.length ? { client_id: { in: clientIds } } : { id: "__none__" },
				select: { id: true },
				take: BATCH_SIZE,
			}),
		(ids) => prisma.restaurant.deleteMany({ where: { id: { in: ids } } }),
	);

	const clientsDeleted = await prisma.client.deleteMany({
		where: SCALE_CLIENT_WHERE,
	});
	console.log(`[demo-cleanup] client: ${clientsDeleted.count}`);

	const adminsDeleted = await prisma.admin.deleteMany({
		where: SCALE_ADMIN_WHERE,
	});
	console.log(`[demo-cleanup] admin: ${adminsDeleted.count}`);
}

async function main() {
	const dbUrl = process.env.DATABASE_URL ?? "";
	if (!dbUrl) {
		throw new Error("DATABASE_URL is required");
	}
	const dbName = assertSafeDatabase(dbUrl);
	const started = Date.now();

	console.log(`\n[demo-cleanup] DATABASE: ${dbName}`);
	console.log(`[demo-cleanup] DRY_RUN=${DRY_RUN}\n`);

	const counts = await countScaleRows();
	console.table({
		scale_clients: counts.clients,
		scale_admins: counts.admins,
		restaurants: counts.restaurants,
		employees: counts.employees,
		employee_box_links: counts.employeeBoxes,
		restaurant_box_links: counts.restaurantBoxes,
		box_telemetry: counts.telemetry,
		boxes: counts.boxes,
	});

	if (DRY_RUN) {
		console.log("\n[demo-cleanup] Dry run complete — no rows deleted.");
		return;
	}

	await runCleanup(counts.clientIds);

	const elapsedSec = Math.round((Date.now() - started) / 1000);
	console.log(`\n[demo-cleanup] Done in ${elapsedSec}s`);
}

main()
	.catch((err) => {
		console.error("[demo-cleanup] FAILED:", err);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
