import { createHandlers } from "@/utils/hono-factory.ts";
import { updateTelemetryValidator, boxIdParamValidator } from "../validators/simulator.validators.ts";
import {
	createSimulatorNotifications,
	evaluateSimulatorTelemetryNotifications,
	updateBoxTelemetry,
} from "@/db/actions/simulator.actions.ts";
import { prisma } from "@/db";
import {
	buildSimulatorConnectedUser,
	disconnectSimulatorBoxOnPowerOff,
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

export const updateStateHandler = createHandlers(
	boxIdParamValidator,
	updateTelemetryValidator,
	async (context) => {
		const { box_id } = context.req.valid("param");
		const body = context.req.valid("json");

		await enforceSimulatorHeartbeatTimeout(box_id);
		recordSimulatorHeartbeat(box_id);

		const existingBox = await prisma.box.findUnique({
			where: { id: box_id },
			select: {
				client_id: true,
				vertical_id: true,
				telemetry: true,
			},
		});
		if (!existingBox) {
			return context.json<any>(
				{ status: "error", message: "Box not found" },
				{ status: 404 },
			);
		}
		if (!existingBox.client_id || !existingBox.vertical_id) {
			return context.json<any>(
				{ status: "error", message: "Box client or vertical metadata is unavailable" },
				{ status: 409 },
			);
		}

		// Map simulator payload to DB schema
		const mappedData: any = {};

		if (body.connection_status !== undefined) {
			if (body.connection_status === "strong" || body.connection_status === "weak") {
				mappedData.connection_status = "connected";
				mappedData.cellular_signal = body.connection_status;
			}
			else if (body.connection_status === "offline") {
				mappedData.connection_status = "disconnected";
				mappedData.cellular_signal = body.connection_status;
			}
			else {
				mappedData.connection_status = "unknown";
				mappedData.cellular_signal = body.connection_status;
			}
		}
		if (body.battery_level !== undefined) mappedData.battery_percentage = body.battery_level;
		if (body.battery_1_level !== undefined) mappedData.battery_1_percentage = body.battery_1_level;
		if (body.battery_2_level !== undefined) mappedData.battery_2_percentage = body.battery_2_level;
		if (body.zone_1_temp !== undefined) mappedData.zone1_temp = body.zone_1_temp;
		if (body.zone_2_temp !== undefined) mappedData.zone2_temp = body.zone_2_temp;
		if (body.zone_1_target_temp !== undefined) mappedData.zone1_target_temp = body.zone_1_target_temp;
		if (body.zone_2_target_temp !== undefined) mappedData.zone2_target_temp = body.zone_2_target_temp;
		if (body.ambient_temp !== undefined) mappedData.ext_temp = body.ambient_temp;

		if (body.is_power_on !== undefined) mappedData.power_status = body.is_power_on ? "on" : "off";
		if (body.is_charging !== undefined) mappedData.charging_status = body.is_charging ? "on" : "off";
		if (body.zone_1_status !== undefined) mappedData.zone1_status = body.zone_1_status ? "on" : "off";
		if (body.zone_2_status !== undefined) mappedData.zone2_status = body.zone_2_status ? "on" : "off";
		if (body.is_dual_zone !== undefined) mappedData.dual_zone_status = body.is_dual_zone ? "on" : "off";

		if (body.bluetooth_available !== undefined) mappedData.bluetooth_status = body.bluetooth_available ? "on" : "off";
		if (body.wifi_connected !== undefined) mappedData.wifi_status = body.wifi_connected ? "on" : "off";
		if (body.latitude !== undefined) mappedData.latitude = body.latitude;
		if (body.longitude !== undefined) mappedData.longitude = body.longitude;

		// GPS stays active for location even when the box is powered off.
		if (
			body.is_power_on === false ||
			body.gps_available !== undefined ||
			body.latitude !== undefined ||
			body.longitude !== undefined ||
			existingBox.telemetry?.gps_status !== "on"
		) {
			mappedData.gps_status = "on";
		}

		if (body.is_power_on === false) {
			if (body.latitude === undefined && existingBox.telemetry?.latitude != null) {
				mappedData.latitude = Number(existingBox.telemetry.latitude);
			}
			if (body.longitude === undefined && existingBox.telemetry?.longitude != null) {
				mappedData.longitude = Number(existingBox.telemetry.longitude);
			}
		}

		if (
			body.latitude !== undefined ||
			body.longitude !== undefined ||
			mappedData.latitude !== undefined ||
			mappedData.longitude !== undefined
		) {
			mappedData.gps_updated_at = new Date();
		}
		if (body.solar_panel !== undefined) mappedData.solar_status = body.solar_panel ? "on" : "off";
		if (body["220V_110V_port"] !== undefined) mappedData.port_big_status = body["220V_110V_port"] ? "on" : "off";
		if (body.Memorycard_used !== undefined) mappedData.memory_percentage = Math.round(body.Memorycard_used * 100);
		if (body.saveToCard !== undefined) mappedData.save_to_memory_status = body.saveToCard ? "on" : "off";
		if (body.Adas !== undefined) mappedData.adas_status = body.Adas ? "on" : "off";

		if (body.BoxCam !== undefined) mappedData.camera_status = body.BoxCam ? "on" : "off";
		if (body.advert_screen !== undefined) mappedData.advert_screen_status = body.advert_screen ? "on" : "off";
		if (body.ioniser !== undefined) mappedData.ioniser_status = body.ioniser ? "on" : "off";
		if (body.light_status !== undefined) mappedData.light_status = body.light_status ? "on" : "off";

		if (body.gyrosensor !== undefined) mappedData.gyrosensor_status = (body.gyrosensor === "detected" || body.gyrosensor === "ok") ? "on" : "off";
		if (body.turn_signals !== undefined) mappedData.turn_signal_status = (body.turn_signals === "detected" || body.turn_signals === "ok") ? "on" : "off";

		const updatedTelemetry = await updateBoxTelemetry(box_id, mappedData);

		if (body.is_power_on === false) {
			await disconnectSimulatorBoxOnPowerOff(box_id);
		}

		const box = await prisma.box.findUnique({
			where: { id: box_id },
			include: {
				telemetry: true,
				lock: true,
				...simulatorBoxConnectionInclude,
			},
		});

		if (!box) {
			return context.json<any>(
				{ status: "error", message: "Box not found" },
				{ status: 404 }
			);
		}

		const notifications = evaluateSimulatorTelemetryNotifications(
			existingBox.telemetry,
			updatedTelemetry,
			body,
		);
		await createSimulatorNotifications(box.id, notifications);

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
						light_status: box.telemetry?.light_status === "on"
					}
				}
			},
			{ status: 200 }
		);
	}
);
