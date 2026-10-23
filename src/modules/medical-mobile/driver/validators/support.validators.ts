import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { validatorErrorHandler } from "@/utils/zod.ts";
import { pageLimitFields } from "@/validators/pagination.ts";

export const getSupportCategoriesRequestQueryValidator = zValidator(
    "query",
    z.object({
        query: z
            .string({
                error: "Please provide a valid query",
            })
            .optional(),
        id: z.ulid("Please provide a valid id").optional(),
        limit: pageLimitFields.limit.default(20),
        page: pageLimitFields.page.default(1),
    }),
    (response) => {
        if (!response.success) {
            validatorErrorHandler(response.error);
        }
    },
);

export const getSupportQuestionsRequestQueryValidator = zValidator(
    "query",
    z.object({
        query: z
            .string({
                error: "Please provide a query",
            })
            .trim()
            .optional(),
        category_id: z.string({
            error: "Please provide a valid category_id",
        }).optional(),
        limit: pageLimitFields.limit.default(20),
        page: pageLimitFields.page.default(1),
    }),
    (response) => {
        if (!response.success) {
            validatorErrorHandler(response.error);
        }
    },
);
