import { Editor, MarkdownView, Notice, Plugin } from "obsidian";
import {
	DEFAULT_SETTINGS,
	MermaidToolkitSettings,
	MermaidToolkitSettingTab,
} from "./settings";
import { IconManager, IconModal, iconPackFolders } from "./icons";
import { firstExisting } from "./vault-paths";
import { ZoomManager } from "./zoom";
import { ThemeManager } from "./theme";
import { Pipeline } from "./pipeline";
import { LEGACY_PLUGIN_ID, readLegacySettings } from "./migrate";

const APPEARANCE_STYLE_ID = "mermaid-toolkit-appearance";
const FONTAWESOME_STYLE_ID = "mermaid-toolkit-fontawesome";

// Mermaid Toolkit = the merged Mermaid Zoom + Mermaid Icons plugin. Manifest id
// `mermaid-toolkit`; it replaces the former id `obsidian-mermaid-zoom`, whose
// settings are taken over once on first start (see loadSettings).
export default class MermaidToolkitPlugin extends Plugin {
	settings: MermaidToolkitSettings = DEFAULT_SETTINGS;

	icons!: IconManager;
	zoom!: ZoomManager;
	theme!: ThemeManager;
	pipeline!: Pipeline;

	private appearanceStyleEl?: HTMLStyleElement;
	private fontAwesomeStyleEl?: HTMLStyleElement;

	async onload() {
		await this.loadSettings();

		this.icons = new IconManager(
			this.app,
			() => this.settings,
			this.manifest.dir ?? "",
			() => this.onIconPacksChanged(),
		);
		this.zoom = new ZoomManager(() => this.settings);
		this.theme = new ThemeManager(this);
		this.pipeline = new Pipeline(this, this.icons, this.zoom);

		this.addSettingTab(new MermaidToolkitSettingTab(this.app, this));

		// Style injection (container appearance + icon colour).
		this.injectAppearanceCSS();
		await this.applyFontAwesome();

		// Theme loader + live-reload watch.
		this.theme.setupWatch();
		await this.theme.apply();

		// Zoom needs its ResizeObserver before diagrams get wrapped.
		this.zoom.setupResizeObserver();

		// Single processing pipeline (icons -> measure -> wrap).
		this.pipeline.start();

		// Inline <code> icon preview in the editor.
		this.registerMarkdownPostProcessor((element) => {
			this.icons.processInlineCode(element);
		});

		// Insert-icon command (from the icons plugin). The picker lists every
		// icon, so this is the one place that genuinely needs all packs in
		// memory - it reads them on first use instead of at startup.
		this.addCommand({
			id: "insert-mermaid-icon",
			name: "Mermaid-Icon einfügen",
			editorCallback: (editor: Editor, _view: MarkdownView) => {
				void (async () => {
					await this.icons.ensureAllPacks();
					new IconModal(this.app, this.icons, (iconStr) => {
						editor.replaceSelection(iconStr);
					}).open();
				})();
			},
		});

		// Defer the expensive icon-pack work out of the blocking onload path.
		this.app.workspace.onLayoutReady(() => {
			void (async () => {
				await this.icons.loadCustomPacks();
				await this.icons.registerWithMermaid();
				// Custom packs may add prefixes that were left as plain text.
				// Diagrams rendered by the workspace restore BEFORE this point
				// carry done-markers from a bundled-packs-only pass - clear
				// them first, a bare pipeline.rescan() cannot heal them.
				this.icons.rescanLabels();
				this.pipeline.rescan();
			})();
		});

		// Live-reload the icon packs when SVGs are added/changed/removed in the
		// pack folder (mirrors the theme file watcher) - no manual plugin
		// reload needed after dropping a new icon into the folder.
		let packReloadTimer: number | null = null;
		const onPackChange = (file: { path: string }) => {
			const inPackFolder = iconPackFolders(this.settings).some((folder) =>
				file.path.startsWith(folder + "/"),
			);
			if (!inPackFolder) return;
			if (packReloadTimer !== null) window.clearTimeout(packReloadTimer);
			packReloadTimer = window.setTimeout(() => {
				packReloadTimer = null;
				void (async () => {
					await this.icons.loadCustomPacks();
					await this.icons.registerWithMermaid();
					this.icons.rescanLabels();
				})();
			}, 500);
		};
		this.registerEvent(this.app.vault.on("create", onPackChange));
		this.registerEvent(this.app.vault.on("modify", onPackChange));
		this.registerEvent(this.app.vault.on("delete", onPackChange));
	}

	// A pack finished loading (lazily, triggered by a token in some diagram):
	// tokens that rendered as plain text in the meantime must be retried. Same
	// heal as after the custom-pack load - clear the done-markers, then rescan.
	// Debounced: several packs may land within the same diagram.
	private packRescanTimer: number | null = null;

	private onIconPacksChanged() {
		if (this.packRescanTimer !== null) {
			window.clearTimeout(this.packRescanTimer);
		}
		this.packRescanTimer = window.setTimeout(() => {
			this.packRescanTimer = null;
			this.icons.rescanLabels();
			this.pipeline?.rescan();
		}, 50);
	}

	async loadSettings() {
		// Object.assign over DEFAULT_SETTINGS: unknown legacy keys (the removed
		// customContainerCSS / customMermaidCSS / customThemeCSS) are ignored.
		let data: unknown = await this.loadData();
		if (data == null) {
			// First start under the new id: adopt the old plugin's data.json
			// once. The old folder stays untouched.
			const legacy = await readLegacySettings(
				this.app.vault.adapter,
				this.app.vault.configDir,
			);
			if (legacy) {
				data = legacy;
				await this.saveData(legacy);
				new Notice(`Einstellungen aus ${LEGACY_PLUGIN_ID} übernommen`);
			}
		}
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.injectAppearanceCSS();
		await this.applyFontAwesome();
		await this.theme.apply();
		// A settings change re-flows native layout; engaged diagrams drop back to
		// native so the new spacing applies.
		requestAnimationFrame(() => this.zoom.disengageAll());
	}

	private injectAppearanceCSS() {
		if (this.appearanceStyleEl) {
			this.appearanceStyleEl.remove();
			this.appearanceStyleEl = undefined;
		}

		const s = this.settings;
		const parts: string[] = [];

		// Base container appearance. padding-bottom adds room for the controls
		// bar on top of the chosen padding.
		parts.push(`
.mermaid-zoom-container {
	background: ${s.containerBackground};
	border: ${s.containerBorder};
	border-radius: ${s.containerBorderRadius};
	margin: ${s.containerMargin} 0;
	padding: ${s.containerPadding};
	padding-bottom: calc(${s.containerPadding} + 1.5em);
	transition: border-color 0.15s ease, border 0.15s ease;
}
		`);

		if (s.containerBorderHover.trim()) {
			parts.push(
				`.mermaid-zoom-container:hover { border: ${s.containerBorderHover}; }`,
			);
		}

		if (s.showControlsOnHover) {
			parts.push(`
.mermaid-zoom-container .mermaid-zoom-controls {
	opacity: 0;
	transition: opacity 0.2s ease;
	pointer-events: none;
}
.mermaid-zoom-container:hover .mermaid-zoom-controls {
	opacity: 1;
	pointer-events: auto;
}
			`);
		}

		// Icon colour drives the CSS var read by the label renderer (overrides the
		// #004994 default shipped in styles.css). White stays on primary nodes.
		if (s.iconColor.trim()) {
			parts.push(`.mermaid .nodeLabel { --mermaid-label-icon-color: ${s.iconColor}; }`);
			parts.push(
				`.mermaid .node.primary .nodeLabel { --mermaid-label-icon-color: #ffffff; }`,
			);
		}

		this.appearanceStyleEl = document.createElement("style");
		this.appearanceStyleEl.id = APPEARANCE_STYLE_ID;
		this.appearanceStyleEl.textContent = parts.join("\n");
		document.head.appendChild(this.appearanceStyleEl);
	}

	// Font Awesome CSS ships as a separate asset and is only injected while the
	// toggle is on. Looked up in the VAULT icon-pack folder first, then next to
	// the plugin - same reason as the icon packs (see readPackFile): BRAT only
	// installs main.js/manifest.json/styles.css, so a plugin-folder copy exists
	// on the build machine alone, while a vault copy syncs everywhere.
	private async applyFontAwesome() {
		if (!this.settings.loadFontAwesome) {
			this.fontAwesomeStyleEl?.remove();
			this.fontAwesomeStyleEl = undefined;
			return;
		}
		if (this.fontAwesomeStyleEl) return; // already injected

		const dir = this.manifest.dir;
		if (!dir) return;
		const candidates = [
			...iconPackFolders(this.settings).map((f) => `${f}/fontawesome.css`),
			`${dir}/fontawesome.css`,
		];
		try {
			const adapter = this.app.vault.adapter;
			const path = await firstExisting(adapter, candidates);
			if (!path) {
				console.warn(
					`Mermaid Toolkit: fontawesome.css nicht gefunden (gesucht: ${candidates.join(", ")}).`,
				);
				return;
			}
			const css = await adapter.read(path);
			this.fontAwesomeStyleEl = document.createElement("style");
			this.fontAwesomeStyleEl.id = FONTAWESOME_STYLE_ID;
			this.fontAwesomeStyleEl.textContent = css;
			document.head.appendChild(this.fontAwesomeStyleEl);
		} catch (e) {
			console.warn("Mermaid Toolkit: fontawesome.css nicht ladbar", e);
		}
	}

	onunload() {
		if (this.packRescanTimer !== null) {
			window.clearTimeout(this.packRescanTimer);
			this.packRescanTimer = null;
		}
		this.pipeline.stop();
		this.zoom.destroy();
		this.theme.remove();
		this.appearanceStyleEl?.remove();
		this.fontAwesomeStyleEl?.remove();
	}
}
