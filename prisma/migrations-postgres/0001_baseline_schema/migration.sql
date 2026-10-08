-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "vertical_email_owner_type" AS ENUM ('client', 'delivery_employee', 'medical_employee', 'hospitality_employee');

-- CreateEnum
CREATE TYPE "employee_status" AS ENUM ('active', 'suspended', 'unassigned');

-- CreateEnum
CREATE TYPE "faq_category_status" AS ENUM ('active', 'suspended', 'deleted');

-- CreateEnum
CREATE TYPE "faq_question_publishing_status" AS ENUM ('draft', 'published');

-- CreateEnum
CREATE TYPE "role_status" AS ENUM ('active', 'deleted');

-- CreateEnum
CREATE TYPE "box_status" AS ENUM ('active', 'suspended', 'unassigned');

-- CreateEnum
CREATE TYPE "box_lock_status" AS ENUM ('locked', 'unlocked', 'not_available', 'offline');

-- CreateEnum
CREATE TYPE "box_health_status" AS ENUM ('critical', 'healthy', 'attention');

-- CreateEnum
CREATE TYPE "box_connection_status" AS ENUM ('connected', 'disconnected', 'unknown');

-- CreateEnum
CREATE TYPE "client_employee_role" AS ENUM ('manager', 'delivery');

-- CreateEnum
CREATE TYPE "client_status" AS ENUM ('active', 'inactive', 'suspended');

-- CreateEnum
CREATE TYPE "restaurant_status" AS ENUM ('active', 'suspended');

-- CreateEnum
CREATE TYPE "restaurant_box_status" AS ENUM ('shared', 'not_shared', 'blocked');

-- CreateEnum
CREATE TYPE "employee_box_status" AS ENUM ('shared', 'blocked', 'unlinked');

-- CreateEnum
CREATE TYPE "employee_box_access" AS ENUM ('direct', 'public', 'all_employees');

-- CreateEnum
CREATE TYPE "hardware_state" AS ENUM ('on', 'off', 'unknown');

-- CreateEnum
CREATE TYPE "hospitality_employee_role" AS ENUM ('admin');

-- CreateEnum
CREATE TYPE "hospitality_employee_box_status" AS ENUM ('shared', 'blocked');

-- CreateEnum
CREATE TYPE "hospitality_employee_box_access" AS ENUM ('direct', 'public', 'all_employees');

-- CreateEnum
CREATE TYPE "medical_department_status" AS ENUM ('active', 'suspended');

-- CreateEnum
CREATE TYPE "medical_department_box_status" AS ENUM ('shared', 'not_shared', 'blocked');

-- CreateEnum
CREATE TYPE "medical_employee_role" AS ENUM ('manager', 'delivery', 'handler');

-- CreateEnum
CREATE TYPE "medical_employee_box_status" AS ENUM ('shared', 'blocked');

-- CreateEnum
CREATE TYPE "medical_employee_box_access" AS ENUM ('direct', 'public', 'all_employees');

-- CreateEnum
CREATE TYPE "medical_consumer_status" AS ENUM ('pending', 'delivered', 'cancelled');

-- CreateEnum
CREATE TYPE "delivery_consumer_status" AS ENUM ('pending', 'delivered', 'cancelled');

-- CreateEnum
CREATE TYPE "camping_consumer_status" AS ENUM ('pending', 'active', 'suspended');

-- CreateEnum
CREATE TYPE "camping_consumer_box_status" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "notification_category" AS ENUM ('camera', 'battery', 'lock', 'display', 'other');

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('warning', 'error', 'success', 'notification');

-- CreateEnum
CREATE TYPE "vertical_status" AS ENUM ('active', 'deleted');

-- CreateEnum
CREATE TYPE "hospitality_floor_status" AS ENUM ('active', 'suspended');

-- CreateEnum
CREATE TYPE "hospitality_floor_box_status" AS ENUM ('shared', 'not_shared', 'blocked');

-- CreateEnum
CREATE TYPE "hospitality_employee_otp_for_what" AS ENUM ('login', 'forget_password', 'set_new_password', 'delete_account');

-- CreateEnum
CREATE TYPE "hospitality_outbox_kind" AS ENUM ('notification', 'log');

-- CreateEnum
CREATE TYPE "hospitality_outbox_status" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- CreateTable
CREATE TABLE "admin" (
    "id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT,
    "password" TEXT,
    "mobile_number" TEXT,
    "country_code" TEXT,
    "email" TEXT NOT NULL,
    "location" TEXT,
    "joining_date" TIMESTAMP(3),
    "role_id" TEXT,
    "status" "employee_status" DEFAULT 'unassigned',
    "avatar" TEXT,
    "employee_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_dismissed" (
    "id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT,
    "password" TEXT,
    "mobile_number" TEXT,
    "country_code" TEXT,
    "email" TEXT NOT NULL,
    "is_super_admin" BOOLEAN NOT NULL DEFAULT true,
    "location" TEXT,
    "joining_date" TIMESTAMP(3),
    "role" TEXT,
    "employee_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_dismissed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_config" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icon" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "bucket_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "icon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vertical" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "vertical_status" NOT NULL DEFAULT 'active',
    "display_order" INTEGER NOT NULL DEFAULT 999,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vertical_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vertical_email_registry" (
    "id" TEXT NOT NULL,
    "vertical_id" TEXT NOT NULL,
    "email" VARCHAR(191) NOT NULL,
    "owner_type" "vertical_email_owner_type" NOT NULL,
    "owner_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vertical_email_registry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "client_display_id" TEXT NOT NULL,
    "organization_name" TEXT,
    "country" TEXT,
    "state" TEXT,
    "email" TEXT,
    "password" TEXT,
    "mobile_number" TEXT,
    "country_code" TEXT,
    "status" "client_status" NOT NULL DEFAULT 'active',
    "auth_token_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "vertical_id" TEXT,
    "profile_pic" TEXT,

    CONSTRAINT "client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_deleted" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "client_display_id" TEXT NOT NULL,
    "organization_name" TEXT,
    "country" TEXT,
    "state" TEXT,
    "email" TEXT,
    "mobile_number" TEXT,
    "country_code" TEXT,
    "vertical_id" TEXT,
    "vertical_name" TEXT,
    "profile_pic" TEXT,
    "x_primary_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_deleted_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faq_category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_normalized" TEXT NOT NULL,
    "icon_id" TEXT,
    "vertical_id" TEXT NOT NULL,
    "description" TEXT,
    "status" "faq_category_status" NOT NULL DEFAULT 'active',
    "index" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faq_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faq_question" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "publishing_status" "faq_question_publishing_status" NOT NULL DEFAULT 'draft',
    "status" "faq_category_status" NOT NULL DEFAULT 'active',
    "attachments" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faq_question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faq_question_category" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faq_question_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_normalized" TEXT NOT NULL,
    "is_super_admin" BOOLEAN NOT NULL DEFAULT false,
    "permissions_json" JSONB NOT NULL,
    "status" "role_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "box" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "box_display_id" TEXT NOT NULL,
    "vertical_id" TEXT,
    "customer_id" TEXT,
    "status" "box_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "vehicle_number" TEXT,
    "connection_employee_id" TEXT,
    "medical_connection_employee_id" TEXT,
    "hospitality_connection_employee_id" TEXT,

    CONSTRAINT "box_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "client_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "city" TEXT,
    "google_place_id" TEXT,
    "latitude" DOUBLE PRECISION,
    "line_one" TEXT,
    "line_two" TEXT,
    "longitude" DOUBLE PRECISION,
    "pincode" TEXT,
    "state" TEXT,
    "status" "restaurant_status" NOT NULL DEFAULT 'active',

    CONSTRAINT "restaurant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vertical_delivery_employee" (
    "id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "mobile_number" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "employee_display_id" TEXT NOT NULL,
    "joining_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "client_id" TEXT,
    "restaurant_id" TEXT,
    "role" "client_employee_role" NOT NULL,
    "status" "employee_status" NOT NULL DEFAULT 'unassigned',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "profile_pic" TEXT,
    "last_connected_box_id" TEXT,

    CONSTRAINT "vertical_delivery_employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vertical_delivery_employee_box" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT,
    "box_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "unlinked_at" TIMESTAMP(3),
    "status" "employee_box_status" NOT NULL DEFAULT 'shared',
    "access" "employee_box_access" NOT NULL DEFAULT 'direct',

    CONSTRAINT "vertical_delivery_employee_box_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_box" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "box_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "status" "restaurant_box_status" NOT NULL DEFAULT 'shared',

    CONSTRAINT "restaurant_box_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vertical_delivery_employee_deleted" (
    "id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "mobile_number" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "employee_display_id" TEXT NOT NULL,
    "joining_date" TIMESTAMP(3) NOT NULL,
    "client_name" TEXT NOT NULL,
    "role_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "profile_pic" TEXT,
    "client_id" TEXT,
    "x_primary_key" TEXT,

    CONSTRAINT "vertical_delivery_employee_deleted_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_deleted" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "client_id" TEXT,
    "client_name" TEXT,
    "manager_id" TEXT,
    "manager_name" TEXT,
    "city" TEXT,
    "google_place_id" TEXT,
    "latitude" DOUBLE PRECISION,
    "line_one" TEXT,
    "line_two" TEXT,
    "longitude" DOUBLE PRECISION,
    "pincode" TEXT,
    "state" TEXT,
    "x_primary_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_deleted_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "box_deleted" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "box_display_id" TEXT NOT NULL,
    "vertical_id" TEXT,
    "vertical_name" TEXT,
    "client_id" TEXT,
    "client_name" TEXT,
    "vehicle_number" TEXT,
    "x_primary_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "box_deleted_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vertical_delivery_consumer" (
    "id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" "delivery_consumer_status" NOT NULL DEFAULT 'pending',
    "client_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vertical_delivery_consumer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vertical_delivery_consumer_box" (
    "id" TEXT NOT NULL,
    "consumer_id" TEXT NOT NULL,
    "box_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vertical_delivery_consumer_box_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "box_lock" (
    "id" TEXT NOT NULL,
    "box_id" TEXT NOT NULL,
    "lock_status" "box_lock_status" NOT NULL DEFAULT 'unlocked',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_status" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "box_lock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "vertical_id" TEXT,
    "box_id" TEXT,
    "box_display_id" TEXT,
    "box_name" TEXT,
    "restaurant_name" TEXT,
    "category" "notification_category",
    "type" "notification_type" NOT NULL DEFAULT 'notification',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "is_dismissed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "box_telemetry_latest" (
    "id" TEXT NOT NULL,
    "box_id" TEXT NOT NULL,
    "health_status" "box_health_status" DEFAULT 'healthy',
    "power_status" "hardware_state" DEFAULT 'unknown',
    "battery_percentage" INTEGER,
    "memory_percentage" INTEGER,
    "ext_temp" INTEGER,
    "zone1_temp" INTEGER,
    "zone2_temp" INTEGER,
    "ioniser_status" "hardware_state" DEFAULT 'unknown',
    "adas_status" "hardware_state" DEFAULT 'unknown',
    "bluetooth_status" "hardware_state" DEFAULT 'unknown',
    "camera_status" "hardware_state" DEFAULT 'unknown',
    "gps_status" "hardware_state" DEFAULT 'unknown',
    "gyrosensor_status" "hardware_state" DEFAULT 'unknown',
    "port_big_status" "hardware_state" DEFAULT 'unknown',
    "port_small_status" "hardware_state" DEFAULT 'unknown',
    "save_to_memory_status" "hardware_state" DEFAULT 'unknown',
    "sim_status" "hardware_state" DEFAULT 'unknown',
    "solar_status" "hardware_state" DEFAULT 'unknown',
    "turn_signal_status" "hardware_state" DEFAULT 'unknown',
    "wifi_status" "hardware_state" DEFAULT 'unknown',
    "advert_screen_status" "hardware_state" DEFAULT 'unknown',
    "light_status" "hardware_state" DEFAULT 'unknown',
    "dual_zone_status" "hardware_state" DEFAULT 'unknown',
    "connection_status" "box_connection_status" DEFAULT 'unknown',
    "battery_1_percentage" INTEGER,
    "battery_2_percentage" INTEGER,
    "zone1_target_temp" INTEGER,
    "zone2_target_temp" INTEGER,
    "charging_status" "hardware_state" DEFAULT 'unknown',
    "zone1_status" "hardware_state" DEFAULT 'unknown',
    "zone2_status" "hardware_state" DEFAULT 'unknown',
    "cellular_signal" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "gps_updated_at" TIMESTAMP(3),
    "surveillance_enabled" BOOLEAN,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "box_telemetry_latest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "camp_camera_feed" (
    "id" TEXT NOT NULL,
    "box_id" TEXT NOT NULL,
    "cam_id" INTEGER NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "s3_key" TEXT NOT NULL,
    "duration_sec" INTEGER,
    "thumbnail_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "camp_camera_feed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vertical_medical_department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "client_id" TEXT,
    "status" "medical_department_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vertical_medical_department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vertical_medical_department_box" (
    "id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "box_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "status" "medical_department_box_status" NOT NULL DEFAULT 'shared',

    CONSTRAINT "vertical_medical_department_box_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vertical_medical_employee" (
    "id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "mobile_number" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "employee_display_id" TEXT NOT NULL,
    "joining_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "client_id" TEXT,
    "department_id" TEXT,
    "role" "medical_employee_role" NOT NULL,
    "status" "employee_status" NOT NULL DEFAULT 'unassigned',
    "profile_pic" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vertical_medical_employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vertical_medical_employee_box" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT,
    "box_id" TEXT NOT NULL,
    "status" "medical_employee_box_status" NOT NULL DEFAULT 'shared',
    "access" "medical_employee_box_access" NOT NULL DEFAULT 'direct',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vertical_medical_employee_box_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vertical_medical_consumer" (
    "id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" "medical_consumer_status" NOT NULL DEFAULT 'pending',
    "client_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vertical_medical_consumer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vertical_medical_consumer_box" (
    "id" TEXT NOT NULL,
    "consumer_id" TEXT NOT NULL,
    "box_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vertical_medical_consumer_box_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vertical_camping_consumer" (
    "id" TEXT NOT NULL,
    "full_name" TEXT,
    "email" TEXT NOT NULL,
    "country_code" TEXT,
    "phone" TEXT,
    "password" TEXT,
    "auth_token_version" INTEGER NOT NULL DEFAULT 0,
    "status" "camping_consumer_status" NOT NULL DEFAULT 'pending',
    "client_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vertical_camping_consumer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vertical_camping_consumer_box" (
    "id" TEXT NOT NULL,
    "consumer_id" TEXT NOT NULL,
    "box_id" TEXT NOT NULL,
    "status" "camping_consumer_box_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vertical_camping_consumer_box_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vertical_medical_employee_deleted" (
    "id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "mobile_number" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "employee_display_id" TEXT NOT NULL,
    "joining_date" TIMESTAMP(3) NOT NULL,
    "client_name" TEXT NOT NULL,
    "role_name" TEXT NOT NULL,
    "department_name" TEXT,
    "profile_pic" TEXT,
    "client_id" TEXT,
    "x_primary_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vertical_medical_employee_deleted_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vertical_medical_department_deleted" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "client_id" TEXT,
    "client_name" TEXT,
    "x_primary_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vertical_medical_department_deleted_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vertical_hospitality_employee" (
    "id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "mobile_number" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "employee_display_id" TEXT NOT NULL,
    "joining_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "client_id" TEXT,
    "role" "hospitality_employee_role" NOT NULL,
    "status" "employee_status" NOT NULL DEFAULT 'unassigned',
    "profile_pic" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vertical_hospitality_employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vertical_hospitality_employee_box" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT,
    "box_id" TEXT NOT NULL,
    "status" "hospitality_employee_box_status" NOT NULL DEFAULT 'shared',
    "access" "hospitality_employee_box_access" NOT NULL DEFAULT 'direct',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vertical_hospitality_employee_box_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vertical_hospitality_employee_deleted" (
    "id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "mobile_number" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "employee_display_id" TEXT NOT NULL,
    "joining_date" TIMESTAMP(3) NOT NULL,
    "client_id" TEXT,
    "client_name" TEXT,
    "role_name" TEXT,
    "profile_pic" TEXT,
    "x_primary_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vertical_hospitality_employee_deleted_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vertical_hospitality_floor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "client_id" TEXT,
    "status" "hospitality_floor_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vertical_hospitality_floor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vertical_hospitality_floor_box" (
    "id" TEXT NOT NULL,
    "floor_id" TEXT NOT NULL,
    "box_id" TEXT NOT NULL,
    "room" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "status" "hospitality_floor_box_status" NOT NULL DEFAULT 'shared',

    CONSTRAINT "vertical_hospitality_floor_box_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vertical_hospitality_floor_deleted" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "client_id" TEXT,
    "client_name" TEXT,
    "x_primary_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vertical_hospitality_floor_deleted_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospitality_employee_otp" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(191) NOT NULL,
    "role" "hospitality_employee_role" NOT NULL,
    "otp" TEXT NOT NULL,
    "otp_id" VARCHAR(32) NOT NULL,
    "for_what" "hospitality_employee_otp_for_what" NOT NULL DEFAULT 'login',
    "metadata" JSONB,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospitality_employee_otp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospitality_otp_attempt" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(191) NOT NULL,
    "scope" VARCHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_attempt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "lock_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospitality_otp_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospitality_outbox_event" (
    "id" TEXT NOT NULL,
    "client_id" VARCHAR(32) NOT NULL,
    "kind" "hospitality_outbox_kind" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "hospitality_outbox_status" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospitality_outbox_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_email_key" ON "admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "admin_employee_id_key" ON "admin"("employee_id");

-- CreateIndex
CREATE INDEX "admin_role_id_idx" ON "admin"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_dismissed_email_key" ON "admin_dismissed"("email");

-- CreateIndex
CREATE UNIQUE INDEX "system_config_key_key" ON "system_config"("key");

-- CreateIndex
CREATE INDEX "icon_name_idx" ON "icon"("name");

-- CreateIndex
CREATE UNIQUE INDEX "vertical_name_key" ON "vertical"("name");

-- CreateIndex
CREATE INDEX "vertical_name_idx" ON "vertical"("name");

-- CreateIndex
CREATE INDEX "vertical_email_registry_email_idx" ON "vertical_email_registry"("email");

-- CreateIndex
CREATE UNIQUE INDEX "vertical_email_registry_vertical_id_email_key" ON "vertical_email_registry"("vertical_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "vertical_email_registry_owner_type_owner_id_key" ON "vertical_email_registry"("owner_type", "owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_client_display_id_key" ON "client"("client_display_id");

-- CreateIndex
CREATE INDEX "client_name_idx" ON "client"("name");

-- CreateIndex
CREATE INDEX "client_organization_name_idx" ON "client"("organization_name");

-- CreateIndex
CREATE INDEX "client_country_idx" ON "client"("country");

-- CreateIndex
CREATE INDEX "client_state_idx" ON "client"("state");

-- CreateIndex
CREATE INDEX "client_email_idx" ON "client"("email");

-- CreateIndex
CREATE INDEX "client_mobile_number_idx" ON "client"("mobile_number");

-- CreateIndex
CREATE UNIQUE INDEX "client_vertical_id_email_key" ON "client"("vertical_id", "email");

-- CreateIndex
CREATE INDEX "faq_category_name_idx" ON "faq_category"("name");

-- CreateIndex
CREATE INDEX "faq_category_description_idx" ON "faq_category"("description");

-- CreateIndex
CREATE INDEX "faq_category_icon_id_idx" ON "faq_category"("icon_id");

-- CreateIndex
CREATE INDEX "faq_category_vertical_id_idx" ON "faq_category"("vertical_id");

-- CreateIndex
CREATE UNIQUE INDEX "faq_category_vertical_id_name_normalized_key" ON "faq_category"("vertical_id", "name_normalized");

-- CreateIndex
CREATE INDEX "faq_question_question_idx" ON "faq_question"("question");

-- CreateIndex
CREATE INDEX "faq_question_category_category_id_idx" ON "faq_question_category"("category_id");

-- CreateIndex
CREATE INDEX "faq_question_category_question_id_idx" ON "faq_question_category"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_name_normalized_key" ON "role"("name_normalized");

-- CreateIndex
CREATE INDEX "role_name_idx" ON "role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "box_box_display_id_key" ON "box"("box_display_id");

-- CreateIndex
CREATE INDEX "box_client_id_idx" ON "box"("customer_id");

-- CreateIndex
CREATE INDEX "box_client_vertical_status_idx" ON "box"("customer_id", "vertical_id", "status");

-- CreateIndex
CREATE INDEX "box_vertical_id_idx" ON "box"("vertical_id");

-- CreateIndex
CREATE INDEX "box_connection_employee_id_idx" ON "box"("connection_employee_id");

-- CreateIndex
CREATE INDEX "box_medical_connection_employee_id_idx" ON "box"("medical_connection_employee_id");

-- CreateIndex
CREATE INDEX "box_hospitality_connection_employee_id_idx" ON "box"("hospitality_connection_employee_id");

-- CreateIndex
CREATE INDEX "restaurant_client_id_idx" ON "restaurant"("client_id");

-- CreateIndex
CREATE INDEX "vertical_delivery_employee_client_id_idx" ON "vertical_delivery_employee"("client_id");

-- CreateIndex
CREATE INDEX "vertical_delivery_employee_restaurant_id_idx" ON "vertical_delivery_employee"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "vertical_delivery_employee_client_id_email_key" ON "vertical_delivery_employee"("client_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "vertical_delivery_employee_client_id_employee_display_id_key" ON "vertical_delivery_employee"("client_id", "employee_display_id");

-- CreateIndex
CREATE UNIQUE INDEX "vertical_delivery_employee_client_id_country_code_mobile_nu_key" ON "vertical_delivery_employee"("client_id", "country_code", "mobile_number");

-- CreateIndex
CREATE INDEX "vertical_delivery_employee_box_box_id_idx" ON "vertical_delivery_employee_box"("box_id");

-- CreateIndex
CREATE INDEX "vertical_delivery_employee_box_employee_id_idx" ON "vertical_delivery_employee_box"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "vertical_delivery_employee_box_employee_id_box_id_key" ON "vertical_delivery_employee_box"("employee_id", "box_id");

-- CreateIndex
CREATE INDEX "restaurant_box_box_id_idx" ON "restaurant_box"("box_id");

-- CreateIndex
CREATE INDEX "restaurant_box_restaurant_id_idx" ON "restaurant_box"("restaurant_id");

-- CreateIndex
CREATE INDEX "vertical_delivery_consumer_client_id_idx" ON "vertical_delivery_consumer"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "vertical_delivery_consumer_phone_country_code_key" ON "vertical_delivery_consumer"("phone", "country_code");

-- CreateIndex
CREATE INDEX "vertical_delivery_consumer_box_box_id_idx" ON "vertical_delivery_consumer_box"("box_id");

-- CreateIndex
CREATE INDEX "vertical_delivery_consumer_box_consumer_id_idx" ON "vertical_delivery_consumer_box"("consumer_id");

-- CreateIndex
CREATE UNIQUE INDEX "box_lock_box_id_key" ON "box_lock"("box_id");

-- CreateIndex
CREATE INDEX "notification_client_id_idx" ON "notification"("client_id");

-- CreateIndex
CREATE INDEX "notification_vertical_id_idx" ON "notification"("vertical_id");

-- CreateIndex
CREATE INDEX "notification_box_id_idx" ON "notification"("box_id");

-- CreateIndex
CREATE INDEX "notification_is_read_idx" ON "notification"("is_read");

-- CreateIndex
CREATE INDEX "notification_is_dismissed_idx" ON "notification"("is_dismissed");

-- CreateIndex
CREATE INDEX "notification_client_id_vertical_id_is_dismissed_created_at_idx" ON "notification"("client_id", "vertical_id", "is_dismissed", "created_at");

-- CreateIndex
CREATE INDEX "notification_client_id_vertical_id_is_dismissed_is_read_idx" ON "notification"("client_id", "vertical_id", "is_dismissed", "is_read");

-- CreateIndex
CREATE UNIQUE INDEX "box_telemetry_latest_box_id_key" ON "box_telemetry_latest"("box_id");

-- CreateIndex
CREATE INDEX "camp_camera_feed_box_id_recorded_at_idx" ON "camp_camera_feed"("box_id", "recorded_at");

-- CreateIndex
CREATE INDEX "camp_camera_feed_box_id_cam_id_idx" ON "camp_camera_feed"("box_id", "cam_id");

-- CreateIndex
CREATE INDEX "vertical_medical_department_client_id_idx" ON "vertical_medical_department"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "vertical_medical_department_client_id_name_key" ON "vertical_medical_department"("client_id", "name");

-- CreateIndex
CREATE INDEX "vertical_medical_department_box_box_id_idx" ON "vertical_medical_department_box"("box_id");

-- CreateIndex
CREATE INDEX "vertical_medical_department_box_department_id_idx" ON "vertical_medical_department_box"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "vertical_medical_department_box_department_id_box_id_key" ON "vertical_medical_department_box"("department_id", "box_id");

-- CreateIndex
CREATE INDEX "vertical_medical_employee_client_id_idx" ON "vertical_medical_employee"("client_id");

-- CreateIndex
CREATE INDEX "vertical_medical_employee_department_id_idx" ON "vertical_medical_employee"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "vertical_medical_employee_client_id_email_key" ON "vertical_medical_employee"("client_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "vertical_medical_employee_client_id_employee_display_id_key" ON "vertical_medical_employee"("client_id", "employee_display_id");

-- CreateIndex
CREATE UNIQUE INDEX "vertical_medical_employee_client_id_country_code_mobile_num_key" ON "vertical_medical_employee"("client_id", "country_code", "mobile_number");

-- CreateIndex
CREATE INDEX "vertical_medical_employee_box_box_id_idx" ON "vertical_medical_employee_box"("box_id");

-- CreateIndex
CREATE INDEX "vertical_medical_employee_box_employee_id_idx" ON "vertical_medical_employee_box"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "vertical_medical_employee_box_employee_id_box_id_key" ON "vertical_medical_employee_box"("employee_id", "box_id");

-- CreateIndex
CREATE INDEX "vertical_medical_consumer_client_id_idx" ON "vertical_medical_consumer"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "vertical_medical_consumer_phone_country_code_key" ON "vertical_medical_consumer"("phone", "country_code");

-- CreateIndex
CREATE INDEX "vertical_medical_consumer_box_box_id_idx" ON "vertical_medical_consumer_box"("box_id");

-- CreateIndex
CREATE INDEX "vertical_medical_consumer_box_consumer_id_idx" ON "vertical_medical_consumer_box"("consumer_id");

-- CreateIndex
CREATE UNIQUE INDEX "vertical_camping_consumer_email_key" ON "vertical_camping_consumer"("email");

-- CreateIndex
CREATE INDEX "vertical_camping_consumer_client_id_idx" ON "vertical_camping_consumer"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "vertical_camping_consumer_phone_country_code_key" ON "vertical_camping_consumer"("phone", "country_code");

-- CreateIndex
CREATE INDEX "vertical_camping_consumer_box_box_id_idx" ON "vertical_camping_consumer_box"("box_id");

-- CreateIndex
CREATE INDEX "vertical_camping_consumer_box_consumer_id_idx" ON "vertical_camping_consumer_box"("consumer_id");

-- CreateIndex
CREATE INDEX "vertical_hospitality_employee_client_id_idx" ON "vertical_hospitality_employee"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "vertical_hospitality_employee_client_id_email_key" ON "vertical_hospitality_employee"("client_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "vertical_hospitality_employee_client_id_employee_display_id_key" ON "vertical_hospitality_employee"("client_id", "employee_display_id");

-- CreateIndex
CREATE UNIQUE INDEX "vertical_hospitality_employee_client_id_country_code_mobile_key" ON "vertical_hospitality_employee"("client_id", "country_code", "mobile_number");

-- CreateIndex
CREATE INDEX "vertical_hospitality_employee_box_box_id_idx" ON "vertical_hospitality_employee_box"("box_id");

-- CreateIndex
CREATE INDEX "vertical_hospitality_employee_box_employee_id_idx" ON "vertical_hospitality_employee_box"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "vertical_hospitality_employee_box_employee_id_box_id_key" ON "vertical_hospitality_employee_box"("employee_id", "box_id");

-- CreateIndex
CREATE INDEX "vertical_hospitality_floor_client_id_idx" ON "vertical_hospitality_floor"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "vertical_hospitality_floor_client_id_name_key" ON "vertical_hospitality_floor"("client_id", "name");

-- CreateIndex
CREATE INDEX "vertical_hospitality_floor_box_box_id_idx" ON "vertical_hospitality_floor_box"("box_id");

-- CreateIndex
CREATE INDEX "vertical_hospitality_floor_box_floor_id_idx" ON "vertical_hospitality_floor_box"("floor_id");

-- CreateIndex
CREATE UNIQUE INDEX "vertical_hospitality_floor_box_floor_id_box_id_key" ON "vertical_hospitality_floor_box"("floor_id", "box_id");

-- CreateIndex
CREATE UNIQUE INDEX "hospitality_employee_otp_otp_id_key" ON "hospitality_employee_otp"("otp_id");

-- CreateIndex
CREATE INDEX "hospitality_employee_otp_email_created_at_idx" ON "hospitality_employee_otp"("email", "created_at");

-- CreateIndex
CREATE INDEX "hospitality_otp_attempt_lock_until_idx" ON "hospitality_otp_attempt"("lock_until");

-- CreateIndex
CREATE UNIQUE INDEX "hospitality_otp_attempt_email_scope_key" ON "hospitality_otp_attempt"("email", "scope");

-- CreateIndex
CREATE INDEX "hospitality_outbox_status_created_idx" ON "hospitality_outbox_event"("status", "created_at");

-- CreateIndex
CREATE INDEX "hospitality_outbox_client_kind_idx" ON "hospitality_outbox_event"("client_id", "kind");

-- AddForeignKey
ALTER TABLE "admin" ADD CONSTRAINT "admin_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vertical_email_registry" ADD CONSTRAINT "vertical_email_registry_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "vertical"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client" ADD CONSTRAINT "client_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "vertical"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faq_category" ADD CONSTRAINT "faq_category_icon_id_fkey" FOREIGN KEY ("icon_id") REFERENCES "icon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faq_category" ADD CONSTRAINT "faq_category_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "vertical"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faq_question_category" ADD CONSTRAINT "faq_question_category_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "faq_category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faq_question_category" ADD CONSTRAINT "faq_question_category_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "faq_question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "box" ADD CONSTRAINT "box_connection_employee_id_fkey" FOREIGN KEY ("connection_employee_id") REFERENCES "vertical_delivery_employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "box" ADD CONSTRAINT "box_medical_connection_employee_id_fkey" FOREIGN KEY ("medical_connection_employee_id") REFERENCES "vertical_medical_employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "box" ADD CONSTRAINT "box_hospitality_connection_employee_id_fkey" FOREIGN KEY ("hospitality_connection_employee_id") REFERENCES "vertical_hospitality_employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "box" ADD CONSTRAINT "box_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "box" ADD CONSTRAINT "box_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "vertical"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant" ADD CONSTRAINT "restaurant_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vertical_delivery_employee" ADD CONSTRAINT "vertical_delivery_employee_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vertical_delivery_employee" ADD CONSTRAINT "vertical_delivery_employee_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vertical_delivery_employee_box" ADD CONSTRAINT "vertical_delivery_employee_box_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "box"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vertical_delivery_employee_box" ADD CONSTRAINT "vertical_delivery_employee_box_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "vertical_delivery_employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_box" ADD CONSTRAINT "restaurant_box_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "box"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_box" ADD CONSTRAINT "restaurant_box_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vertical_delivery_consumer" ADD CONSTRAINT "vertical_delivery_consumer_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vertical_delivery_consumer_box" ADD CONSTRAINT "vertical_delivery_consumer_box_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "box"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vertical_delivery_consumer_box" ADD CONSTRAINT "vertical_delivery_consumer_box_consumer_id_fkey" FOREIGN KEY ("consumer_id") REFERENCES "vertical_delivery_consumer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "box_lock" ADD CONSTRAINT "box_lock_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "box"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "box_telemetry_latest" ADD CONSTRAINT "box_telemetry_latest_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "box"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camp_camera_feed" ADD CONSTRAINT "camp_camera_feed_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "box"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vertical_medical_department" ADD CONSTRAINT "vertical_medical_department_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vertical_medical_department_box" ADD CONSTRAINT "vertical_medical_department_box_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "vertical_medical_department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vertical_medical_department_box" ADD CONSTRAINT "vertical_medical_department_box_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "box"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vertical_medical_employee" ADD CONSTRAINT "vertical_medical_employee_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vertical_medical_employee" ADD CONSTRAINT "vertical_medical_employee_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "vertical_medical_department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vertical_medical_employee_box" ADD CONSTRAINT "vertical_medical_employee_box_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "box"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vertical_medical_employee_box" ADD CONSTRAINT "vertical_medical_employee_box_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "vertical_medical_employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vertical_medical_consumer" ADD CONSTRAINT "vertical_medical_consumer_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vertical_medical_consumer_box" ADD CONSTRAINT "vertical_medical_consumer_box_box_fkey" FOREIGN KEY ("box_id") REFERENCES "box"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vertical_medical_consumer_box" ADD CONSTRAINT "vertical_medical_consumer_box_consumer_fkey" FOREIGN KEY ("consumer_id") REFERENCES "vertical_medical_consumer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vertical_camping_consumer" ADD CONSTRAINT "vertical_camping_consumer_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vertical_camping_consumer_box" ADD CONSTRAINT "vertical_camping_consumer_box_box_fkey" FOREIGN KEY ("box_id") REFERENCES "box"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vertical_camping_consumer_box" ADD CONSTRAINT "vertical_camping_consumer_box_consumer_fkey" FOREIGN KEY ("consumer_id") REFERENCES "vertical_camping_consumer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vertical_hospitality_employee" ADD CONSTRAINT "vertical_hospitality_employee_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vertical_hospitality_employee_box" ADD CONSTRAINT "vertical_hospitality_employee_box_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "box"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vertical_hospitality_employee_box" ADD CONSTRAINT "vertical_hospitality_employee_box_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "vertical_hospitality_employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vertical_hospitality_floor" ADD CONSTRAINT "vertical_hospitality_floor_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vertical_hospitality_floor_box" ADD CONSTRAINT "vertical_hospitality_floor_box_floor_id_fkey" FOREIGN KEY ("floor_id") REFERENCES "vertical_hospitality_floor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vertical_hospitality_floor_box" ADD CONSTRAINT "vertical_hospitality_floor_box_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "box"("id") ON DELETE CASCADE ON UPDATE CASCADE;
