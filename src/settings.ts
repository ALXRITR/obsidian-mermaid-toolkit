import { App, PluginSettingTab, Setting } from "obsidian";
import type MermaidToolkitPlugin from "./main";
import { DEFAULT_ICON_PACK_FOLDERS, DEFAULT_STYLE_FOLDERS } from "./vault-paths";

export type ThemeMode = "aus" | "dguv" | "uvitas" | "custom";

export interface MermaidToolkitSettings {
	// --- Behaviour ---
	requireModifierForZoom: boolean;
	showControlsOnHover: boolean;
	// --- Appearance (container, live-editable) ---
	containerPadding: string;
	containerMargin: string;
	containerBackground: string;
	containerBorderRadius: string;
	containerBorder: string;
	containerBorderHover: string;
	// --- Theme ---
	themeMode: ThemeMode;
	customThemePath: string;
	// Folder of style-dguv.css / style-uvitas.css; "" = default folders in order.
	stylesFolder: string;
	// --- Icons ---
	// Icon-pack folder; "" = default folders in order.
	iconPackFolder: string;
	iconColor: string; // drives --mermaid-label-icon-color
	loadFontAwesome: boolean;
}

export const DEFAULT_SETTINGS: MermaidToolkitSettings = {
	requireModifierForZoom: true,
	showControlsOnHover: true,
	// Defaults reflect the appearance signed off by the user (transparent, tight).
	containerPadding: "0.8em",
	containerMargin: "0.2em",
	containerBackground: "var(--mm-canvas)",
	containerBorderRadius: "4px",
	containerBorder: "1px solid var(--background-modifier-border)",
	containerBorderHover: "1px solid var(--background-modifier-border)",
	themeMode: "aus",
	customThemePath: "",
	stylesFolder: "",
	iconPackFolder: "",
	iconColor: "#004994",
	loadFontAwesome: true,
};

export class MermaidToolkitSettingTab extends PluginSettingTab {
	plugin: MermaidToolkitPlugin;

	constructor(app: App, plugin: MermaidToolkitPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// --- Behaviour ---
		new Setting(containerEl).setName("Verhalten").setHeading();

		new Setting(containerEl)
			.setName("Ctrl/Cmd für Scroll-Zoom verlangen")
			.setDesc(
				"Wenn aktiv, zoomt Scrollen über einem Diagramm nur bei gedrückter Ctrl- (Windows/Linux) bzw. Cmd-Taste (Mac). Verhindert versehentliches Zoomen beim Scrollen der Notiz.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.requireModifierForZoom)
					.onChange(async (value) => {
						this.plugin.settings.requireModifierForZoom = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Controls nur bei Hover zeigen")
			.setDesc(
				"Blendet die Zoom-/Reset-/Vollbild-Controls aus, bis der Mauszeiger über dem Diagramm ist.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showControlsOnHover)
					.onChange(async (value) => {
						this.plugin.settings.showControlsOnHover = value;
						await this.plugin.saveSettings();
					}),
			);

		// --- Appearance ---
		new Setting(containerEl).setName("Darstellung").setHeading();

		new Setting(containerEl)
			.setName("Innenabstand")
			.setDesc(
				"Abstand zwischen Container-Rand und Diagramm. Einzelner CSS-Wert (z.B. 0.8em, 12px). Platz für die Controls-Leiste wird automatisch ergänzt.",
			)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.containerPadding)
					.setValue(this.plugin.settings.containerPadding)
					.onChange(async (value) => {
						this.plugin.settings.containerPadding =
							value || DEFAULT_SETTINGS.containerPadding;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Vertikaler Außenabstand")
			.setDesc("Abstand oberhalb und unterhalb des Containers. Einzelner CSS-Wert (z.B. 0.2em, 16px).")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.containerMargin)
					.setValue(this.plugin.settings.containerMargin)
					.onChange(async (value) => {
						this.plugin.settings.containerMargin =
							value || DEFAULT_SETTINGS.containerMargin;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Hintergrund")
			.setDesc(
				"Container-Hintergrund. Beliebige CSS-Farbe oder Variable (z.B. transparent, var(--background-secondary), #1e1e1e).",
			)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.containerBackground)
					.setValue(this.plugin.settings.containerBackground)
					.onChange(async (value) => {
						this.plugin.settings.containerBackground =
							value || DEFAULT_SETTINGS.containerBackground;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Eckenradius")
			.setDesc("Rundung der Container-Ecken. Einzelner CSS-Wert (z.B. 4px, 0).")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.containerBorderRadius)
					.setValue(this.plugin.settings.containerBorderRadius)
					.onChange(async (value) => {
						this.plugin.settings.containerBorderRadius =
							value || DEFAULT_SETTINGS.containerBorderRadius;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Rahmen")
			.setDesc(
				"Container-Rahmen. Vollständige CSS-border-Kurzform (z.B. 1px solid var(--background-modifier-border), none).",
			)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.containerBorder)
					.setValue(this.plugin.settings.containerBorder)
					.onChange(async (value) => {
						this.plugin.settings.containerBorder =
							value || DEFAULT_SETTINGS.containerBorder;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Rahmen bei Hover")
			.setDesc(
				"Optionaler Rahmen, der nur beim Überfahren des Diagramms erscheint. Leer lassen zum Deaktivieren. Vollständige CSS-border-Kurzform.",
			)
			.addText((text) =>
				text
					.setPlaceholder("1px solid var(--interactive-accent)")
					.setValue(this.plugin.settings.containerBorderHover)
					.onChange(async (value) => {
						this.plugin.settings.containerBorderHover = value;
						await this.plugin.saveSettings();
					}),
			);

		// --- Theme ---
		new Setting(containerEl).setName("Theme").setHeading();

		const themePathSetting = new Setting(containerEl)
			.setName("Pfad zur eigenen Style-CSS")
			.setDesc(
				"Vault-relativer Pfad zur CSS-Datei (nur bei Auswahl „Benutzerdefiniert“).",
			)
			.addText((text) =>
				text
					.setPlaceholder(`${DEFAULT_STYLE_FOLDERS[0]}/mein-theme.css`)
					.setValue(this.plugin.settings.customThemePath)
					.onChange(async (value) => {
						this.plugin.settings.customThemePath = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Diagramm-Theme")
			.setDesc(
				"Lädt eine Style-CSS aus dem Vault und injiziert sie für Mermaid-Diagramme. DGUV/uvitas nutzen style-dguv.css bzw. style-uvitas.css aus dem Ordner der Stile.",
			)
			.addDropdown((dropdown) => {
				dropdown.addOption("aus", "Aus");
				dropdown.addOption("dguv", "DGUV");
				dropdown.addOption("uvitas", "uvitas");
				dropdown.addOption("custom", "Benutzerdefiniert…");
				dropdown.setValue(this.plugin.settings.themeMode);
				dropdown.onChange(async (value) => {
					this.plugin.settings.themeMode = value as ThemeMode;
					updateThemePathVisibility(value as ThemeMode);
					await this.plugin.saveSettings();
				});
			});

		// DGUV and uvitas read their style file from this folder.
		const stylesFolderSetting = new Setting(containerEl)
			.setName("Ordner der Stile")
			.setDesc(
				"Vault-Ordner mit style-dguv.css und style-uvitas.css. " +
					`Leer: sucht der Reihe nach in ${DEFAULT_STYLE_FOLDERS.join(", dann in ")}.`,
			)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_STYLE_FOLDERS[0])
					.setValue(this.plugin.settings.stylesFolder)
					.onChange(async (value) => {
						this.plugin.settings.stylesFolder = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		const updateThemePathVisibility = (mode: ThemeMode) => {
			themePathSetting.settingEl.toggle(mode === "custom");
			stylesFolderSetting.settingEl.toggle(mode === "dguv" || mode === "uvitas");
		};

		updateThemePathVisibility(this.plugin.settings.themeMode);

		// --- Icons ---
		new Setting(containerEl).setName("Icons").setHeading();

		new Setting(containerEl)
			.setName("Ordner für eigene Icon-Packs")
			.setDesc(
				"Vault-Ordner, dessen direkte Unterordner als Icon-Packs geladen werden (ein Pack pro Unterordner, ein Icon pro .svg-Datei). " +
					`Leer: sucht der Reihe nach in ${DEFAULT_ICON_PACK_FOLDERS.join(", dann in ")}.`,
			)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_ICON_PACK_FOLDERS[0])
					.setValue(this.plugin.settings.iconPackFolder)
					.onChange(async (value) => {
						this.plugin.settings.iconPackFolder = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Icon-Farbe")
			.setDesc(
				"Farbe einfarbiger Label-Icons (CSS-Variable --mermaid-label-icon-color). Beliebige CSS-Farbe (z.B. #004994).",
			)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.iconColor)
					.setValue(this.plugin.settings.iconColor)
					.onChange(async (value) => {
						this.plugin.settings.iconColor =
							value || DEFAULT_SETTINGS.iconColor;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Font-Awesome-CSS laden")
			.setDesc(
				"Lädt die mitgelieferte Font-Awesome-CSS (für fa:fa-*-Icons in Diagrammen). Aus lassen, wenn nicht benötigt.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.loadFontAwesome)
					.onChange(async (value) => {
						this.plugin.settings.loadFontAwesome = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
