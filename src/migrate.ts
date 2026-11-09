// One-time settings takeover after the plugin id change
// (obsidian-mermaid-zoom -> mermaid-toolkit). Obsidian keys the plugin folder
// and its data.json by manifest id, so the renamed plugin starts without
// settings. The old folder is only read, never changed or deleted.

export const LEGACY_PLUGIN_ID = "obsidian-mermaid-zoom";

// Minimal slice of Obsidian's DataAdapter, kept small so the helper can be
// exercised without the Obsidian runtime.
export interface LegacySettingsAdapter {
	exists(path: string): Promise<boolean>;
	read(path: string): Promise<string>;
}

export function legacySettingsPath(configDir: string): string {
	return `${configDir}/plugins/${LEGACY_PLUGIN_ID}/data.json`;
}

// Returns the old plugin's settings object, or null when there is nothing
// usable (no file, unreadable, invalid JSON, not a plain object).
export async function readLegacySettings(
	adapter: LegacySettingsAdapter,
	configDir: string,
): Promise<Record<string, unknown> | null> {
	const path = legacySettingsPath(configDir);
	try {
		if (!(await adapter.exists(path))) return null;
		const parsed: unknown = JSON.parse(await adapter.read(path));
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
		return null;
	} catch (e) {
		console.warn(`Mermaid Toolkit: alte Einstellungen nicht lesbar: ${path}`, e);
		return null;
	}
}
