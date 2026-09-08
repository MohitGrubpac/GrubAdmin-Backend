import type { AdminWithRole } from "@/db/actions/admin.actions.ts";
import type {
	PermissionAllowed,
	TopicKey,
} from "@/types/common/permissions-set.ts";
import {
	BOX_VERTICALS,
	CAMPING_VERTICAL_NAME,
	DELIVERY_VERTICAL_NAME,
	HOSPITALITY_VERTICAL_NAME,
	MEDICAL_VERTICAL_NAME,
} from "@/configs/constants.ts";
import type { BoxType } from "@/types/common/box-type.ts";
import { APIError } from "@/types/error";

interface CheckAdminPermissionArgs {
	admin?: AdminWithRole;
	is_super_admin?: boolean;
	permissions_allowed: PermissionAllowed;
}

interface PermsResponse {
	perm: Record<string, string[]>;
	is_super_admin?: boolean;
}

/** Admin roles store most topics as string[]; `verticals` is often a keyed object from seed-roles. */
export const normalizePermissionTopicValues = (value: unknown): string[] => {
	if (Array.isArray(value)) {
		return value.map((entry) => String(entry).trim()).filter(Boolean);
	}
	if (value && typeof value === "object") {
		return Object.values(value as Record<string, unknown>)
			.map((entry) => String(entry).trim())
			.filter(Boolean);
	}
	return [];
};

const normalizeRolePermissions = (
	raw: Record<string, unknown> | null | undefined,
): Record<string, string[]> => {
	if (!raw || typeof raw !== "object") {
		return {};
	}
	const normalized: Record<string, string[]> = {};
	for (const [topic, value] of Object.entries(raw)) {
		normalized[topic] = normalizePermissionTopicValues(value);
	}
	return normalized;
};

const VERTICAL_DB_NAMES: Record<BoxType, string> = {
	delivery: DELIVERY_VERTICAL_NAME,
	medical: MEDICAL_VERTICAL_NAME,
	hospitality: HOSPITALITY_VERTICAL_NAME,
	camping: CAMPING_VERTICAL_NAME,
};

export class Permission {
	static getAllowedVerticalNames(
		perms: Record<string, string[]>,
	): BoxType[] {
		const granted = new Set(
			(perms.verticals ?? []).map((value) => value.toLowerCase().trim()),
		);
		return BOX_VERTICALS.filter((vertical) => granted.has(vertical));
	}

	static getAllowedVerticalDbNames(perms: Record<string, string[]>): string[] {
		return Permission.getAllowedVerticalNames(perms).map(
			(vertical) => VERTICAL_DB_NAMES[vertical],
		);
	}

	static checkAdminPermissions(
		args: CheckAdminPermissionArgs,
	): PermsResponse {
		if (!args.admin) {
			throw new APIError("Unauthorized access", undefined, undefined, 401);
		}

		const rolesPermissions = normalizeRolePermissions(
			args.admin.role?.permissions_json as Record<string, unknown> | null,
		);

		if (args.admin.role?.is_super_admin) {
			return {
				is_super_admin: true,
				perm: rolesPermissions,
			};
		}

		if (Object.keys(rolesPermissions).length === 0) {
			throw new APIError(
				`You do not have enough permissions to perform the intended action`,
				undefined,
				undefined,
				403,
			);
		}

		if (args.is_super_admin && !args.admin.role?.is_super_admin) {
			throw new APIError(
				"This resource can only accessed by super admins",
				undefined,
				undefined,
				403,
			);
		}

		for (const permission of Object.keys(args.permissions_allowed)) {
			if (!rolesPermissions[permission]) {
				throw new APIError(
					`You do not have ${permission} access to perform the intended action`,
					undefined,
					undefined,
					403,
				);
			}

			const myPerms = new Set(rolesPermissions[permission] ?? []);
			const requiredPerms =
				args.permissions_allowed[permission as TopicKey];

			if (!requiredPerms) {
				continue;
			}

			for (const perm of requiredPerms) {
				if (!myPerms.has(perm as unknown as string)) {
					throw new APIError(
						`You do not have ${perm} access to perform the intended action`,
						undefined,
						undefined,
						403,
					);
				}
			}
		}

		return {
			is_super_admin: false,
			perm: rolesPermissions,
		};
	}

	static assertPermissionsSubset(
		callerPermissions: Record<string, string[] | undefined> | null | undefined,
		requestedPermissions: Record<string, string[] | Record<string, string>>,
	): void {
		if (!requestedPermissions || typeof requestedPermissions !== "object") {
			return;
		}

		for (const [topic, values] of Object.entries(requestedPermissions)) {
			if (!Array.isArray(values)) continue;
			const callerSet = new Set(
				(callerPermissions?.[topic] || []).map((perm) =>
					String(perm).trim().toLowerCase(),
				),
			);

			for (const value of values) {
				const normalized = String(value).trim().toLowerCase();
				if (!callerSet.has(normalized)) {
					throw new APIError(
						`You cannot grant permission '${value}' in '${topic}' — exceeds your access`,
						undefined,
						undefined,
						403,
					);
				}
			}
		}
	}
}
