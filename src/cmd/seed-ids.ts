import { ulid } from "ulid";

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let _ulidCounter = 0;
export function deterministicUlid(): string {
  const idx = _ulidCounter++;
  const prng = mulberry32(1700000000 + idx);
  return ulid(1700000000000 + idx, prng);
}

export const SEED_IDS = {
  VERTICAL_MEDICAL: deterministicUlid(),
  VERTICAL_CAMPING: deterministicUlid(),
  VERTICAL_HOSPITALITY: deterministicUlid(),
  VERTICAL_DELIVERY: deterministicUlid(),

  ICON_DEFAULT: deterministicUlid(),
  ICON_MEDICAL: deterministicUlid(),
  ICON_CAMPING: deterministicUlid(),
  ICON_HOSPITALITY: deterministicUlid(),
  ICON_DELIVERY: deterministicUlid(),
  ICON_SETUP: deterministicUlid(),
  ICON_TROUBLESHOOT: deterministicUlid(),
  ICON_DEVICE_CONNECT: deterministicUlid(),
  ICON_ALERT: deterministicUlid(),
  ICON_ACCOUNT: deterministicUlid(),
  ICON_OTHERS: deterministicUlid(),

  ROLE_SUPER_ADMIN: deterministicUlid(),
  ROLE_ADMIN: deterministicUlid(),
  ROLE_SUPPORT_MANAGER: deterministicUlid(),
  ROLE_VIEWER: deterministicUlid(),

  ADMIN_SUPER: deterministicUlid(),
  ADMIN_ATUL: deterministicUlid(),
  ADMIN_ONE: deterministicUlid(),
  ADMIN_TWO: deterministicUlid(),
  ADMIN_SUPPORT: deterministicUlid(),
  ADMIN_VIEWER: deterministicUlid(),

  CLIENT_ACTIVE_1: deterministicUlid(),
  CLIENT_ACTIVE_2: deterministicUlid(),
  CLIENT_ACTIVE_3: deterministicUlid(),
  CLIENT_SUSPENDED: deterministicUlid(),
  CLIENT_INACTIVE: deterministicUlid(),

  RESTAURANT_ACTIVE_1: deterministicUlid(),
  RESTAURANT_ACTIVE_2: deterministicUlid(),
  RESTAURANT_ACTIVE_3: deterministicUlid(),
  RESTAURANT_SUSPENDED: deterministicUlid(),

  BOX_001: deterministicUlid(),
  BOX_002: deterministicUlid(),
  BOX_003: deterministicUlid(),
  BOX_004: deterministicUlid(),
  BOX_005: deterministicUlid(),
  BOX_006: deterministicUlid(),
  BOX_007: deterministicUlid(),
  BOX_008: deterministicUlid(),

  EMPLOYEE_MANAGER_1: deterministicUlid(),
  EMPLOYEE_MANAGER_2: deterministicUlid(),
  EMPLOYEE_DELIVERY_1: deterministicUlid(),
  EMPLOYEE_DELIVERY_2: deterministicUlid(),
  EMPLOYEE_SUSPENDED: deterministicUlid(),
  EMPLOYEE_UNASSIGNED: deterministicUlid(),
  EMPLOYEE_MEDICAL_DELIVERY: deterministicUlid(),

  MEDICAL_DEPARTMENT_1: deterministicUlid(),
  MEDICAL_DEPARTMENT_2: deterministicUlid(),
  MEDICAL_DEPARTMENT_3: deterministicUlid(),

  MEDICAL_EMPLOYEE_MANAGER_1: deterministicUlid(),
  MEDICAL_EMPLOYEE_MANAGER_2: deterministicUlid(),
  MEDICAL_EMPLOYEE_DELIVERY_1: deterministicUlid(),
  MEDICAL_EMPLOYEE_DELIVERY_2: deterministicUlid(),
  MEDICAL_EMPLOYEE_SUSPENDED: deterministicUlid(),

  MEDICAL_CONSUMER_1: deterministicUlid(),
  MEDICAL_CONSUMER_2: deterministicUlid(),

  FAQ_CATEGORY_GETTING_STARTED: deterministicUlid(),
  FAQ_CATEGORY_TROUBLESHOOTING: deterministicUlid(),
  FAQ_CATEGORY_BILLING: deterministicUlid(),
  FAQ_CATEGORY_MEDICAL: deterministicUlid(),
  FAQ_CATEGORY_SETUP: deterministicUlid(),
  FAQ_CATEGORY_DEVICE_CONNECT: deterministicUlid(),
  FAQ_CATEGORY_ALERT: deterministicUlid(),
  FAQ_CATEGORY_ACCOUNT: deterministicUlid(),
  FAQ_CATEGORY_OTHERS: deterministicUlid(),

  FAQ_QUESTION_GS_1: deterministicUlid(),
  FAQ_QUESTION_GS_2: deterministicUlid(),
  FAQ_QUESTION_TR_1: deterministicUlid(),
  FAQ_QUESTION_TR_2: deterministicUlid(),
  FAQ_QUESTION_BILL_1: deterministicUlid(),
  FAQ_QUESTION_MED_1: deterministicUlid(),
  FAQ_QUESTION_MED_2: deterministicUlid(),
  FAQ_QUESTION_MED_3: deterministicUlid(),
  FAQ_CATEGORY_MEDICAL_OPS: deterministicUlid(),

  NOTIFICATION_1: deterministicUlid(),
  NOTIFICATION_2: deterministicUlid(),
  NOTIFICATION_3: deterministicUlid(),
  NOTIFICATION_4: deterministicUlid(),
  NOTIFICATION_5: deterministicUlid(),

  CONFIG_MIN_ANDROID: deterministicUlid(),
  CONFIG_MIN_IOS: deterministicUlid(),
  CONFIG_ANDROID_LINKS: deterministicUlid(),
  CONFIG_IOS_LINKS: deterministicUlid(),
  CONFIG_MAINTENANCE: deterministicUlid(),
  CONFIG_IMAGE_URLS: deterministicUlid(),
  CONFIG_PRIVACY: deterministicUlid(),
  CONFIG_TERMS: deterministicUlid(),
  CONFIG_JWT_ACCESS: deterministicUlid(),
  CONFIG_JWT_REFRESH: deterministicUlid(),
  CONFIG_PAGE_SIZE: deterministicUlid(),
  CONFIG_APP_NAME: deterministicUlid(),
  CONFIG_SUPPORT_EMAIL: deterministicUlid(),
  CONFIG_MAX_LOGIN: deterministicUlid(),
  CONFIG_OTP_EXPIRY: deterministicUlid(),
  CONFIG_ICON_BASE_URL: deterministicUlid(),
  CONFIG_FAQ_BASE_URL: deterministicUlid(),

  ARCHIVED_ADMIN: deterministicUlid(),
  ARCHIVED_CLIENT: deterministicUlid(),
  ARCHIVED_BOX: deterministicUlid(),
  ARCHIVED_RESTAURANT: deterministicUlid(),
  ARCHIVED_EMPLOYEE: deterministicUlid(),
} as const;
