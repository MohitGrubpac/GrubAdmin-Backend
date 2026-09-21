import { createHandlers } from "@/utils/hono-factory.ts";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { validatorErrorHandler } from "@/utils/zod";
import { prisma } from "@/db";
import {
	buildSimulatorConnectedUser,
	isSimulatorDriverConnected,
	resolveSimulatorActiveConnectionEmployeeId,
	simulatorBoxConnectionInclude,
} from "@/db/actions/simulator.connection.actions.ts";

export const getBoxByDisplayIdHandler = createHandlers(
	zValidator(
		"param",
		z.object({ display_id: z.string().min(1, "Display ID is required") }),
		(r) => {
			if (!r.success) validatorErrorHandler(r.error);
		}
	),
	async (context) => {
		const { display_id } = context.req.valid("param");

		const box = await prisma.box.findUnique({
			where: { box_display_id: display_id },
			include: { telemetry: true, lock: true, ...simulatorBoxConnectionInclude },
		});

		if (!box) {
			return context.json<any>(
				{ status: "error", message: "Box not found" },
				{ status: 404 }
			);
		}

		const connected_user = buildSimulatorConnectedUser(box);

		return context.json<any>(
			{
				status: "success",
				data: {
					box_id: box.id,
					display_id: box.box_display_id,
					is_locked: box.lock?.lock_status === "locked",
					driver_id: resolveSimulatorActiveConnectionEmployeeId(box),
					connected_user,
					is_driver_connected: isSimulatorDriverConnected(box),
					restaurant_id: null,
					settings: {
						is_power_on: box.telemetry?.power_status === "on",
						is_dual_zone: false,
						zone_1_target_temp: box.telemetry?.zone1_temp || 4,
						zone_2_target_temp: box.telemetry?.zone2_temp || 4,
						zone_1_status: true,
						zone_2_status: false,
						saveToCard: true,
						Adas: true,
						BoxCam: box.telemetry?.camera_status === "on",
						advert_screen: box.telemetry?.advert_screen_status === "on",
						ioniser: box.telemetry?.ioniser_status === "on",
						light_status: box.telemetry?.light_status === "on"
					}
				}
			},
			{ status: 200 }
		);
	}
);
