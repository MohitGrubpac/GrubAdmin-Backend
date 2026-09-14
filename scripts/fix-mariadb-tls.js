import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { homedir } from "os";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const patches = [
	{
		search:
			"info.tlsFingerprint = serverCert ? serverCert.fingerprint256.replace(/:/gi, '').toLowerCase() : null;",
		replace:
			"info.tlsFingerprint = serverCert && serverCert.fingerprint256 ? serverCert.fingerprint256.replace(/:/gi, '').toLowerCase() : null;",
	},
	{
		search: "n.tlsFingerprint=A?A.fingerprint256.replace(/:/gi,\"\").toLowerCase():null",
		replace: "n.tlsFingerprint=A&&A.fingerprint256?A.fingerprint256.replace(/:/gi,\"\").toLowerCase():null",
	},
];

function collectMariaDbInstallRoots() {
	const roots = new Set([resolve(root, "node_modules/mariadb")]);

	const bunCache = join(homedir(), ".bun/install/cache");
	if (existsSync(bunCache)) {
		for (const entry of readdirSync(bunCache, { withFileTypes: true })) {
			if (entry.isDirectory() && entry.name.startsWith("mariadb@")) {
				roots.add(join(bunCache, entry.name));
			}
		}
	}

	return [...roots];
}

function patchFile(filePath, patch) {
	if (!existsSync(filePath)) {
		return "missing";
	}

	let content = readFileSync(filePath, "utf-8");
	if (content.includes(patch.replace)) {
		return "ok";
	}
	if (!content.includes(patch.search)) {
		return "skip";
	}

	content = content.replace(patch.search, patch.replace);
	writeFileSync(filePath, content, "utf-8");
	return "patched";
}

const targetFiles = ["lib/cmd/handshake/auth/handshake.js", "dist/promise.cjs"];

let patchedCount = 0;
for (const installRoot of collectMariaDbInstallRoots()) {
	for (const relativePath of targetFiles) {
		const filePath = join(installRoot, relativePath);
		for (const patch of patches) {
			const result = patchFile(filePath, patch);
			if (result === "patched") {
				console.log(`[PATCHED] ${filePath}`);
				patchedCount++;
			} else if (result === "ok") {
				console.log(`[OK] Already patched: ${filePath}`);
			} else if (result === "skip") {
				console.error(`[SKIP] Pattern not found in: ${filePath}`);
			}
		}
	}
}

if (patchedCount === 0) {
	console.log("[OK] MariaDB TLS handshake patch already applied everywhere");
}
