import { prisma } from "@/db";
import { logger } from "@/utils/logger";
import { SEED_IDS } from "./seed-ids";

interface CategorySeed {
  id: string;
  name: string;
  name_normalized: string;
  vertical_id: string;
  icon_id: string | null;
  description: string;
  index: number;
}

interface QuestionSeed {
  id: string;
  question: string;
  answer: string;
  category_id: string;
  publishing_status: "draft" | "published";
}

const CATEGORIES: CategorySeed[] = [
  {
    id: SEED_IDS.FAQ_CATEGORY_GETTING_STARTED,
    name: "Getting Started",
    name_normalized: "getting started",
    vertical_id: SEED_IDS.VERTICAL_DELIVERY,
    icon_id: SEED_IDS.ICON_SETUP,
    description: "Get started with your GrubPac box and account setup.",
    index: 1,
  },
  {
    id: SEED_IDS.FAQ_CATEGORY_TROUBLESHOOTING,
    name: "Troubleshooting",
    name_normalized: "troubleshooting",
    vertical_id: SEED_IDS.VERTICAL_DELIVERY,
    icon_id: SEED_IDS.ICON_TROUBLESHOOT,
    description: "Resolve common issues with your hardware and software.",
    index: 2,
  },
  {
    id: SEED_IDS.FAQ_CATEGORY_BILLING,
    name: "Billing & Plans",
    name_normalized: "billing & plans",
    vertical_id: SEED_IDS.VERTICAL_DELIVERY,
    icon_id: SEED_IDS.ICON_DEFAULT,
    description: "Information about pricing, plans, and invoices.",
    index: 3,
  },
  {
    id: SEED_IDS.FAQ_CATEGORY_MEDICAL,
    name: "Medical Device FAQ",
    name_normalized: "medical device faq",
    vertical_id: SEED_IDS.VERTICAL_MEDICAL,
    icon_id: SEED_IDS.ICON_MEDICAL,
    description: "FAQ specific to medical-grade box usage and compliance.",
    index: 1,
  },
  {
    id: SEED_IDS.FAQ_CATEGORY_MEDICAL_OPS,
    name: "Medical Mobile Operations",
    name_normalized: "medical mobile operations",
    vertical_id: SEED_IDS.VERTICAL_MEDICAL,
    icon_id: SEED_IDS.ICON_MEDICAL,
    description: "GrubLock, alerts, and facility emergency workflows for medical mobile.",
    index: 2,
  },
  {
    id: SEED_IDS.FAQ_CATEGORY_SETUP,
    name: "Setup & Installation",
    name_normalized: "setup & installation",
    vertical_id: SEED_IDS.VERTICAL_DELIVERY,
    icon_id: SEED_IDS.ICON_SETUP,
    description: "GrubPac setup guides and hardware installation instructions.",
    index: 4,
  },
  {
    id: SEED_IDS.FAQ_CATEGORY_DEVICE_CONNECT,
    name: "Device Connection",
    name_normalized: "device connection",
    vertical_id: SEED_IDS.VERTICAL_DELIVERY,
    icon_id: SEED_IDS.ICON_DEVICE_CONNECT,
    description: "Bluetooth, Cellular, and offline connectivity guidance.",
    index: 5,
  },
  {
    id: SEED_IDS.FAQ_CATEGORY_ALERT,
    name: "Alert & Notification",
    name_normalized: "alert & notification",
    vertical_id: SEED_IDS.VERTICAL_DELIVERY,
    icon_id: SEED_IDS.ICON_ALERT,
    description: "Understanding and customizing notifications and alerts.",
    index: 6,
  },
  {
    id: SEED_IDS.FAQ_CATEGORY_ACCOUNT,
    name: "Account & App Support",
    name_normalized: "account & app support",
    vertical_id: SEED_IDS.VERTICAL_DELIVERY,
    icon_id: SEED_IDS.ICON_ACCOUNT,
    description: "Update your profile, change settings, and report bugs.",
    index: 7,
  },
  {
    id: SEED_IDS.FAQ_CATEGORY_OTHERS,
    name: "Others",
    name_normalized: "others",
    vertical_id: SEED_IDS.VERTICAL_DELIVERY,
    icon_id: SEED_IDS.ICON_OTHERS,
    description: "General information, daily logs, and capacity expansion requests.",
    index: 8,
  },
];

const QUESTIONS: QuestionSeed[] = [
  {
    id: SEED_IDS.FAQ_QUESTION_GS_1,
    question: "How do I activate my GrubPac box?",
    answer: "Press and hold the power button for 3 seconds. The LED will blink green once connected.",
    category_id: SEED_IDS.FAQ_CATEGORY_GETTING_STARTED,
    publishing_status: "published",
  },
  {
    id: SEED_IDS.FAQ_QUESTION_GS_2,
    question: "How do I assign a box to a delivery employee?",
    answer: "Navigate to the employee profile, select 'Assign Box', and choose from the available inventory.",
    category_id: SEED_IDS.FAQ_CATEGORY_GETTING_STARTED,
    publishing_status: "published",
  },
  {
    id: SEED_IDS.FAQ_QUESTION_TR_1,
    question: "My box is not connecting to GPS. What should I do?",
    answer: "Ensure the box is outdoors with clear sky view. Try a hard reset by holding the power button for 10 seconds.",
    category_id: SEED_IDS.FAQ_CATEGORY_TROUBLESHOOTING,
    publishing_status: "published",
  },
  {
    id: SEED_IDS.FAQ_QUESTION_TR_2,
    question: "Temperature warnings keep appearing",
    answer: "Check that the box doors are properly sealed. If the issue persists, contact support.",
    category_id: SEED_IDS.FAQ_CATEGORY_TROUBLESHOOTING,
    publishing_status: "published",
  },
  {
    id: SEED_IDS.FAQ_QUESTION_BILL_1,
    question: "How is billing calculated per box?",
    answer: "Billing is done monthly per active box. Enterprise plans have custom pricing.",
    category_id: SEED_IDS.FAQ_CATEGORY_BILLING,
    publishing_status: "published",
  },
  {
    id: SEED_IDS.FAQ_QUESTION_MED_1,
    question: "Is the medical box FDA approved?",
    answer: "Yes, our medical-grade boxes meet FDA storage requirements for temperature-sensitive medications.",
    category_id: SEED_IDS.FAQ_CATEGORY_MEDICAL,
    publishing_status: "published",
  },
  {
    id: SEED_IDS.FAQ_QUESTION_MED_2,
    question: "How do I unlock GrubLock on a medical box?",
    answer: "Drivers request an email OTP from the box lock screen, enter the code, and the server confirms unlock before the app shows success.",
    category_id: SEED_IDS.FAQ_CATEGORY_MEDICAL_OPS,
    publishing_status: "published",
  },
  {
    id: SEED_IDS.FAQ_QUESTION_MED_3,
    question: "Who receives a facility emergency alert?",
    answer: "Alerts are logged for your facility account with optional box context. Use emergency call metadata in the app for the facility phone number.",
    category_id: SEED_IDS.FAQ_CATEGORY_MEDICAL_OPS,
    publishing_status: "published",
  },
];

export const seedFaq = async (): Promise<void> => {
  logger.info("Seeding FAQ...");

  for (const catDef of CATEGORIES) {
    await prisma.faq_category.upsert({
      where: { id: catDef.id },
      update: {
        name: catDef.name,
        description: catDef.description,
        icon_id: catDef.icon_id,
        index: catDef.index,
        vertical_id: catDef.vertical_id,
      },
      create: catDef,
    });
    logger.info(`  FAQ category "${catDef.name}" ready.`);
  }

  for (const qDef of QUESTIONS) {
    const existing = await prisma.faq_question.findUnique({ where: { id: qDef.id } });
    if (existing) {
      await prisma.faq_question.update({
        where: { id: qDef.id },
        data: {
          question: qDef.question,
          answer: qDef.answer,
          publishing_status: qDef.publishing_status,
        },
      });
      logger.info(`  FAQ question "${qDef.question.substring(0, 40)}..." updated.`);
    } else {
      const question = await prisma.faq_question.create({
        data: {
          id: qDef.id,
          question: qDef.question,
          answer: qDef.answer,
          publishing_status: qDef.publishing_status,
        },
      });

      await prisma.faq_question_category.create({
        data: {
          question_id: question.id,
          category_id: qDef.category_id,
        },
      });

      logger.info(`  FAQ question "${qDef.question.substring(0, 40)}..." created.`);
    }
  }

  logger.info(`Seeded ${CATEGORIES.length} categories and ${QUESTIONS.length} questions.`);
};
