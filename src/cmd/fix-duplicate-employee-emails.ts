import { prisma } from "../db/index.ts";

async function main() {
	console.log("Checking for duplicate employee emails...");
	const tableRows = await prisma.$queryRaw<Array<{ cnt: bigint }>>`
		SELECT COUNT(*) AS cnt FROM information_schema.tables
		WHERE table_schema = DATABASE() AND table_name = 'vertical_delivery_employee'
	`;
	if (!tableRows[0]?.cnt || Number(tableRows[0].cnt) === 0) {
		console.log("Table vertical_delivery_employee not present yet. Skipping.");
		await prisma.$disconnect();
		return;
	}

	try {
		const duplicates = await prisma.vertical_delivery_employee.groupBy({
			by: ["email"],
			_count: { email: true },
			having: { email: { _count: { gt: 1 } } },
		});

		if (duplicates.length === 0) {
			console.log("No duplicate employee emails found.");
			return;
		}

		console.log(`Found ${duplicates.length} duplicate email groups. Fixing...`);

		for (const group of duplicates) {
			const employees = await prisma.vertical_delivery_employee.findMany({
				where: { email: group.email },
				orderBy: { joining_date: "asc" },
			});

			const [keep, ...toFix] = employees;
			console.log(`  Keeping: ${keep!.email} (id: ${keep!.id})`);

			for (let i = 0; i < toFix.length; i++) {
				const emp = toFix[i]!;
				const newEmail = `${emp.email}+fix_${i + 1}_${emp.id.slice(0, 8)}`;
				await prisma.vertical_delivery_employee.update({
					where: { id: emp.id },
					data: { email: newEmail },
				});
				console.log(`  Fixed: ${emp.email} -> ${newEmail} (id: ${emp.id})`);
			}
		}

		console.log("All duplicate employee emails fixed successfully!");
	} catch (error) {
		console.error("Error fixing duplicate employee emails:", error);
		process.exit(1);
	} finally {
		process.exit(0);
	}
}

main();
