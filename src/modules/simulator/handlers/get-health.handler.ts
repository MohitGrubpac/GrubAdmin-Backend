import { createHandlers } from "@/utils/hono-factory.ts";
import { boxIdParamValidator } from "../validators/simulator.validators.ts";
import { prisma } from "@/db";
import {
	buildSimulatorConnectedUser,
	enforceSimulatorHeartbeatTimeout,
	isSimulatorDriverConnected,
	recordSimulatorHeartbeat,
	resolveSimulatorActiveConnectionEmployeeId,
	simulatorBoxConnectionInclude,
} from "@/db/actions/simulator.connection.actions.ts";
import { computeOverallBatteryLevel } from "@/utils/box-battery.ts";
import {
	isSimulatorGpsAvailable,
	resolveSimulatorLatitude,
	resolveSimulatorLongitude,
} from "@/utils/simulator-gps.ts";

export const getHealthHandler = createHandlers(
	boxIdParamValidator,
	async (context) => {
		const { box_id } = context.req.valid("param");

		await enforceSimulatorHeartbeatTimeout(box_id);

		const box = await prisma.box.findUnique({
			where: { id: box_id },
			include: {
				telemetry: true,
				lock: true,
				...simulatorBoxConnectionInclude,
			},
		});

		if (!box) {
			return context.json<any>({ status: "error", message: "Box not found" }, { status: 404 });
		}

		recordSimulatorHeartbeat(box_id);

		const connected_user = buildSimulatorConnectedUser(box);
		const gpsAvailable = isSimulatorGpsAvailable();

		return context.json<any>(
			{
				status: "success",
				data: {
					box_id: box.id,
					display_id: box.box_display_id,
					is_locked: box.lock?.lock_status === "locked",
					driver_id: resolveSimulatorActiveConnectionEmployeeId(box),
					connected_user,
					restaurant_id: null,
					is_driver_connected: isSimulatorDriverConnected(box),
					connection_status: box.telemetry?.cellular_signal || box.telemetry?.connection_status || "strong",
					battery_1_level: box.telemetry?.battery_1_percentage ?? null,
					battery_2_level: box.telemetry?.battery_2_percentage ?? null,
					battery_level: computeOverallBatteryLevel(box.telemetry),
					ambient_temp: box.telemetry?.ext_temp ?? 32,
					zone_1_temp: box.telemetry?.zone1_temp ?? 4.2,
					zone_2_temp: box.telemetry?.zone2_temp ?? 4.5,
					gps_available: gpsAvailable,
					bluetooth_available: box.telemetry?.bluetooth_status === "on",
					wifi_connected: box.telemetry?.wifi_status === "on",
					is_power_on: box.telemetry?.power_status === "on",
					latitude: resolveSimulatorLatitude(box.telemetry),
					longitude: resolveSimulatorLongitude(box.telemetry),
					solar_panel: box.telemetry?.solar_status === "on",
					"220V_110V_port": box.telemetry?.port_big_status === "on",
					Memorycard_used: box.telemetry?.memory_percentage ? box.telemetry.memory_percentage / 100 : 0.15,
					gyrosensor: box.telemetry?.gyrosensor_status === "on" ? "detected" : "not_detected",
					turn_signals: box.telemetry?.turn_signal_status === "on" ? "detected" : "not_detected",
					is_dual_zone: box.telemetry?.dual_zone_status === "on",
					settings: {
						is_power_on: box.telemetry?.power_status === "on",
						is_charging: box.telemetry?.charging_status === "on",
						is_dual_zone: box.telemetry?.dual_zone_status === "on",
						zone_1_target_temp: box.telemetry?.zone1_target_temp ?? 4,
						zone_2_target_temp: box.telemetry?.zone2_target_temp ?? 4,
						zone_1_status: box.telemetry?.zone1_status === "on",
						zone_2_status: box.telemetry?.zone2_status === "on",
						saveToCard: box.telemetry?.save_to_memory_status === "on",
						Adas: box.telemetry?.adas_status === "on",
						BoxCam: box.telemetry?.camera_status === "on",
						advert_screen: box.telemetry?.advert_screen_status === "on",
						ioniser: box.telemetry?.ioniser_status === "on",
						light_status: box.telemetry?.light_status === "on",
					},
				},
			},
			{ status: 200 },
		);
	},
);
