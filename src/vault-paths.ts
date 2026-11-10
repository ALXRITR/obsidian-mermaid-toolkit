// Vault folders the plugin reads from. An empty folder setting means: search the
// default folders in order (current vault layout first, former layout second).
// A set folder is the only folder searched.

// Folder of style-dguv.css / style-uvitas.css.
export const DEFAULT_STYLE_FOLDERS: readonly string[] = ["_system/styles", "_ADMIN/styles"];

// Folder of the custom icon packs (one subfolder per pack), the shipped pack
// JSONs and fontawesome.css.
export const DEFAULT_ICON_PACK_FOLDERS: readonly string[] = [
	"_system/daten/mermaid-icon-packs",
	"_ADMIN/mermaid-icon-packs",
];

export const STYLE_FILES = {
	dguv: "style-dguv.css",
	uvitas: "style-uvitas.css",
} as const;

// Vault-relative path without surrounding blanks, backslashes, doubled or
// leading/trailing slashes.
export function cleanVaultPath(value: string | undefined): string {
	return (value || "")
		.trim()
		.replace(/\\/g, "/")
		.replace(/\/{2,}/g, "/")
		.replace(/^\/+|\/+$/g, "");
}

// Folders to search: only the configured one, or the defaults when it is empty.
export function folderCandidates(
	configured: string | undefined,
	defaults: readonly string[],
): string[] {
	const own = cleanVaultPath(configured);
	return own ? [own] : [...defaults];
}

// The part of the vault adapter the lookup needs.
export interface PathExists {
	exists(path: string): Promise<boolean>;
}

// First path that exists, or null when none does.
export async function firstExisting(
	adapter: PathExists,
	paths: readonly string[],
): Promise<string | null> {
	for (const path of paths) {
		if (await adapter.exists(path)) return path;
	}
	return null;
}
