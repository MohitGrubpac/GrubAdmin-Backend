import { Hono } from "hono";
import { commonRouter } from "./common";
import { adminRouter } from "./admin";
import { deliveryRouter } from "@/modules/delivery";
import { deliveryMobileRouter } from "@/modules/delivery-mobile";
import { medicalRouter } from "@/modules/medical";
import { hospitalityRouter } from "@/modules/hospitality";
import { simulatorRouter } from "@/modules/simulator";
import { medicalMobileAuthRouter } from "@/modules/medical-mobile/auth";
import { medicalMobileDriverRouter } from "@/modules/medical-mobile/driver";
import { medicalMobileOwnerRouter } from "@/modules/medical-mobile/owner";
import { campConsumerRouter } from "@/modules/camp-consumer";

export const router = new Hono();

router.route("/common", commonRouter);
router.route("/admin", adminRouter);
router.route("/delivery", deliveryRouter);
router.route("/delivery-mobile", deliveryMobileRouter);
router.route("/medical", medicalRouter);
router.route("/hospitality", hospitalityRouter);
router.route("/simulator", simulatorRouter);
router.route("/medical-mobile", medicalMobileAuthRouter);
router.route("/medical-mobile/driver", medicalMobileDriverRouter);
router.route("/medical-mobile/owner", medicalMobileOwnerRouter);
router.route("/camp-consumer", campConsumerRouter);

