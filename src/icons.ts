import {
	App,
	loadMermaid,
	FuzzySuggestModal,
	FuzzyMatch,
	normalizePath,
	Notice,
} from "obsidian";
import type { MermaidToolkitSettings } from "./settings";
import { DEFAULT_ICON_PACK_FOLDERS, firstExisting, folderCandidates } from "./vault-paths";

// Icon-pack folders to search, in order: the set folder, or the defaults.
export function iconPackFolders(settings: MermaidToolkitSettings): string[] {
	return folderCandidates(settings.iconPackFolder, DEFAULT_ICON_PACK_FOLDERS).map((f) =>
		normalizePath(f),
	);
}

export interface IconifyIcon {
	body: string;
	width?: number;
	height?: number;
	left?: number;
	top?: number;
}

export interface IconifyAlias {
	parent: string;
	rotate?: number;
	hFlip?: boolean;
	vFlip?: boolean;
}

export interface IconifyJSON {
	prefix: string;
	icons: Record<string, IconifyIcon>;
	aliases?: Record<string, IconifyAlias>;
	width?: number;
	height?: number;
}

interface Mermaid {
	registerIconPacks: (
		packs: Array<
			| { name: string; icons: unknown }
			| { name: string; loader: () => Promise<unknown> }
		>,
	) => void;
}

// Iconify packs ship as JSON assets in `packs/` next to main.js instead of
// being bundled into it. Bundled, the four sets are ~13 MB of object literals
// that Obsidian parses at EVERY start - even in vaults that never use an icon.
// Read on demand they cost nothing until a diagram actually names one.
// The folder name is the token prefix: `phosphor:van` -> packs/phosphor.json.
const LAZY_PACK_NAMES = ["logos", "lucide", "clarity", "phosphor"];

export function setSvg(el: HTMLElement, svgString: string) {
	const parser = new DOMParser();
	const doc = parser.parseFromString(svgString, "image/svg+xml");
	if (doc.documentElement && !doc.querySelector("parsererror")) {
		el.empty();
		el.appendChild(doc.documentElement);
	}
}

// Ports the icon logic of obsidian-mermaid-icons: it registers bundled +
// custom SVG packs with Mermaid and replaces `<prefix>:<name>` tokens inside
// rendered diagram labels with isolated data-URI <img> icons.
export class IconManager {
	private readonly app: App;
	private readonly getSettings: () => MermaidToolkitSettings;
	private readonly pluginDir: string;
	// Called once a lazily-loaded pack becomes available, so labels that were
	// left as plain text can be re-rendered.
	private readonly onPacksChanged: () => void;
	private customPacks: Array<{ name: string; icons: IconifyJSON }> = [];
	private lazyPacks = new Map<string, IconifyJSON>();
	private lazyLoading = new Map<string, Promise<void>>();
	private lazyFailed = new Set<string>();

	constructor(
		app: App,
		getSettings: () => MermaidToolkitSettings,
		pluginDir: string,
		onPacksChanged: () => void,
	) {
		this.app = app;
		this.getSettings = getSettings;
		this.pluginDir = pluginDir;
		this.onPacksChanged = onPacksChanged;
	}

	// Custom packs FIRST: a vault pack shadows the shipped set of the same name
	// icon by icon. `phosphor` is both a folder in the vault (28 hand-picked,
	// partly renamed SVGs) and the full Phosphor set - the vault wins, so
	// `phosphor:view-cards` keeps resolving to the local file while
	// `phosphor:van` falls through to the shipped 9161-icon set.
	allPacks(): Array<{ name: string; icons: IconifyJSON }> {
		return [
			...this.customPacks,
			...Array.from(this.lazyPacks, ([name, icons]) => ({ name, icons })),
		];
	}

	// Every prefix the token regex must recognise - INCLUDING packs that have
	// not been read yet, otherwise their tokens would never trigger a load.
	private knownPrefixes(): string[] {
		const names = this.customPacks.map((p) => p.name);
		for (const n of LAZY_PACK_NAMES) if (!names.includes(n)) names.push(n);
		return names;
	}

	// --- Lazy pack loading ---

	// Read `packs/<name>.json` from the plugin folder. Concurrent callers share
	// one in-flight promise; a missing/broken file is remembered so a diagram
	// full of that prefix does not retry the read on every label.
	async ensurePack(name: string): Promise<void> {
		if (this.lazyPacks.has(name) || this.lazyFailed.has(name)) return;
		if (!LAZY_PACK_NAMES.includes(name)) return;
		let pending = this.lazyLoading.get(name);
		if (!pending) {
			pending = this.readPackFile(name);
			this.lazyLoading.set(name, pending);
		}
		await pending;
	}

	async ensureAllPacks(): Promise<void> {
		await Promise.all(LAZY_PACK_NAMES.map((n) => this.ensurePack(n)));
	}

	private async readPackFile(name: string): Promise<void> {
		// VAULT FIRST, plugin folder second. The plugin folder is NOT a reliable
		// home for these files: BRAT installs only main.js/manifest.json/
		// styles.css, so `packs/` exists solely on the machine that built the
		// plugin - on every other one the shipped sets silently vanish while the
		// hand-picked SVG packs (vault) keep working. A copy in the configured
		// icon-pack folder rides along with whatever syncs the vault and is
		// therefore the same on all machines.
		const candidates = [
			...iconPackFolders(this.getSettings()).map((f) => `${f}/${name}.json`),
			`${this.pluginDir}/packs/${name}.json`,
		];
		try {
			const adapter = this.app.vault.adapter;
			const path = await firstExisting(adapter, candidates);
			if (!path) {
				console.warn(
					`Mermaid Toolkit: Icon-Pack „${name}" nicht gefunden (gesucht: ${candidates.join(
						", ",
					)}). Lege ${name}.json in den Icon-Pack-Ordner, damit es mit dem Vault synchronisiert wird.`,
				);
				this.lazyFailed.add(name);
				return;
			}
			const parsed = JSON.parse(await adapter.read(path)) as IconifyJSON;
			if (!parsed?.icons) {
				this.lazyFailed.add(name);
				return;
			}
			// The file name is the token prefix (packs/phosphor.json -> `phosphor`),
			// which may differ from the set's own iconify prefix (`ph`).
			this.lazyPacks.set(name, { ...parsed, prefix: name });
			this.onPacksChanged();
		} catch (e) {
			console.warn(`Mermaid Toolkit: Icon-Pack „${name}" nicht ladbar`, e);
			this.lazyFailed.add(name);
		} finally {
			this.lazyLoading.delete(name);
		}
	}

	// Register custom packs with Mermaid eagerly (they are already in memory)
	// and the shipped ones through Mermaid's own lazy `loader` hook, so icon
	// shapes work without ever forcing a 4 MB read. Loading the full Mermaid
	// library is deferred out of onload by the caller.
	async registerWithMermaid() {
		try {
			const mermaid = (await loadMermaid()) as Mermaid;
			mermaid.registerIconPacks([
				...this.customPacks.map((p) => ({ name: p.name, icons: p.icons })),
				...LAZY_PACK_NAMES.filter(
					(n) => !this.customPacks.some((p) => p.name === n),
				).map((name) => ({
					name,
					loader: async () => {
						await this.ensurePack(name);
						return this.lazyPacks.get(name) ?? { prefix: name, icons: {} };
					},
				})),
			]);
		} catch {
			/* registration is best-effort */
		}
	}

	// --- Custom icon pack loading ---

	// Scan the icon-pack folder (the first existing candidate); every direct
	// subfolder becomes a pack named after the folder, with one icon per `.svg`
	// file.
	async loadCustomPacks() {
		this.customPacks = [];
		// Read straight from the filesystem via the adapter - Obsidian's
		// getFiles() index does not expose externally-created .svg files
		// reliably. NFC-normalise names for umlaut-safe comparisons.
		const adapter = this.app.vault.adapter;
		const packs: Record<string, Record<string, IconifyIcon>> = {};
		let totalSvg = 0;

		try {
			const base = await firstExisting(adapter, iconPackFolders(this.getSettings()));
			if (base) {
				const root = await adapter.list(base);
				for (const packPath of root.folders) {
					const packName = (packPath.split("/").pop() || "").normalize("NFC");
					if (!packName) continue;
					const listed = await adapter.list(packPath);
					for (const fp of listed.files) {
						if (!fp.toLowerCase().endsWith(".svg")) continue;
						totalSvg++;
						const iconName = (fp.split("/").pop() || "")
							.replace(/\.svg$/i, "")
							.normalize("NFC");
						if (!iconName) continue;
						try {
							const svgText = await adapter.read(fp);
							const icon = this.svgToIcon(svgText, `${packName}-${iconName}`);
							if (icon) (packs[packName] ??= {})[iconName] = icon;
						} catch {
							// skip invalid svg
						}
					}
				}
			}
		} catch (e) {
			console.error("Mermaid Toolkit: loadCustomPacks failed", e);
		}

		for (const [name, icons] of Object.entries(packs)) {
			if (Object.keys(icons).length > 0) {
				this.customPacks.push({ name, icons: { prefix: name, icons } });
			}
		}

		if (totalSvg > 0 || this.customPacks.length > 0) {
			const summary =
				this.customPacks
					.map((p) => `${p.name}(${Object.keys(p.icons.icons).length})`)
					.join(", ") || "NONE";
			new Notice(
				`Mermaid Toolkit: ${totalSvg} Pack-SVGs, geladen: ${summary}`,
				6000,
			);
		}
	}

	// Convert a raw SVG string into an iconify-style icon entry, namespacing any
	// internal ids and (for single-colour icons) switching to `currentColor`.
	private svgToIcon(svgText: string, scope: string): IconifyIcon | null {
		const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
		const svg = doc.querySelector("svg");
		if (!svg || doc.querySelector("parsererror")) return null;

		let left = 0;
		let top = 0;
		let width = 0;
		let height = 0;
		const vb = svg.getAttribute("viewBox");
		if (vb) {
			const p = vb.split(/[\s,]+/).map(Number);
			if (p.length === 4 && p.every((n) => !Number.isNaN(n))) {
				[left, top, width, height] = p;
			}
		}
		if (!width) width = parseFloat(svg.getAttribute("width") || "") || 24;
		if (!height) height = parseFloat(svg.getAttribute("height") || "") || 24;

		let body = "";
		const serializer = new XMLSerializer();
		svg.childNodes.forEach((c) => {
			body += serializer.serializeToString(c);
		});

		// Only the CHILDREN are serialised, so presentation attributes sitting on
		// the <svg> root are lost. Icons that colour themselves there (Phosphor
		// downloads write `<svg fill="currentColor">` rather than putting it on
		// every path) then fell back to the SVG default - solid black - while
		// otherwise identical icons rendered in the label colour. Carry those
		// attributes over on a wrapping <g>: children with their own values still
		// win, children without one now inherit as they did inside the original.
		const INHERITED_ATTRS = [
			"fill",
			"fill-rule",
			"fill-opacity",
			"stroke",
			"stroke-width",
			"stroke-linecap",
			"stroke-linejoin",
			"stroke-miterlimit",
			"stroke-dasharray",
			"stroke-opacity",
			"clip-rule",
			"opacity",
			"color",
		];
		const carried = INHERITED_ATTRS.filter((a) => svg.hasAttribute(a)).map(
			(a) =>
				`${a}="${(svg.getAttribute(a) ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")}"`,
		);
		if (carried.length > 0) body = `<g ${carried.join(" ")}>${body}</g>`;

		// Single-colour icons -> currentColor, so the colour baked into the <img>
		// wrapper (navy on default boxes, white on primary) applies to them too.
		// Multi-colour icons (pictograms/logos) keep their own colours. Ids are
		// namespaced for icon-shape usage where the body is inlined into the svg.
		body = this.namespaceIds(body, scope.replace(/[^a-zA-Z0-9_-]/g, ""));
		if (this.isMonochrome(body)) body = this.toCurrentColor(body);
		return { body, width, height, left, top };
	}

	// Single non-white colour and no masks/gradients => treat as monochrome.
	private isMonochrome(body: string): boolean {
		if (/<mask|<image|gradient|clip-path/i.test(body)) return false;
		const colors = new Set<string>();
		for (const m of body.matchAll(
			/(?:fill|stroke)\s*[:=]\s*"?(#[0-9a-fA-F]{3,8})"?/g,
		)) {
			const c = m[1].toLowerCase();
			if (c === "#fff" || c === "#ffffff") continue;
			colors.add(c);
		}
		return colors.size <= 1;
	}

	// Replace explicit colours (except white) with currentColor.
	private toCurrentColor(body: string): string {
		return body.replace(
			/(fill|stroke)="(#[0-9a-fA-F]{3,8})"/g,
			(full, attr, color: string) => {
				const c = color.toLowerCase();
				if (c === "#fff" || c === "#ffffff") return full;
				return `${attr}="currentColor"`;
			},
		);
	}

	// Suffix internal ids and their references so multiple instances of an icon
	// (with the same mask/clip ids) don't collide on one page.
	private namespaceIds(body: string, scope: string): string {
		const ids = new Set<string>();
		for (const m of body.matchAll(/\sid="([^"]+)"/g)) ids.add(m[1]);
		let out = body;
		for (const id of ids) {
			const safe = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			const nid = `${id}-${scope}`;
			out = out
				.replace(new RegExp(`id="${safe}"`, "g"), `id="${nid}"`)
				.replace(new RegExp(`url\\(#${safe}\\)`, "g"), `url(#${nid})`)
				.replace(
					new RegExp(`((?:xlink:)?href)="#${safe}"`, "g"),
					`$1="#${nid}"`,
				);
		}
		return out;
	}

	getAllIcons(): Array<{ prefix: string; name: string }> {
		const allIcons: Array<{ prefix: string; name: string }> = [];
		this.allPacks().forEach((pack) => {
			const names = new Set([
				...Object.keys(pack.icons.icons),
				...Object.keys(pack.icons.aliases ?? {}),
			]);
			names.forEach((iconName) => {
				allIcons.push({ prefix: pack.name, name: iconName });
			});
		});
		return allIcons;
	}

	// Resolve a name inside one pack, following iconify aliases. Aliases that
	// rotate/flip their parent are skipped - rendering the parent unrotated
	// would silently show the wrong icon.
	private lookupInPack(pack: IconifyJSON, name: string): IconifyIcon | null {
		const direct = pack.icons?.[name];
		if (direct) return direct;
		const alias = pack.aliases?.[name];
		if (!alias?.parent) return null;
		if (alias.rotate || alias.hFlip || alias.vFlip) return null;
		return pack.icons?.[alias.parent] ?? null;
	}

	// Find the raw icon data (body/width/height) by prefix/name. A token whose
	// pack is known but not read yet kicks off the load and resolves as
	// "missing" for now - the label stays unsealed and the rescan triggered by
	// onPacksChanged renders it a moment later.
	getIconData(prefix: string, name: string) {
		for (const pack of this.allPacks()) {
			if (pack.name !== prefix) continue;
			const icon = this.lookupInPack(pack.icons, name);
			if (!icon) continue; // shadowing pack lacks it - try the next one
			const width = icon.width ?? pack.icons.width ?? 0;
			const height = icon.height ?? pack.icons.height ?? 0;
			return { ...icon, width, height };
		}
		if (LAZY_PACK_NAMES.includes(prefix) && !this.lazyPacks.has(prefix)) {
			void this.ensurePack(prefix);
		}
		return null;
	}

	// --- Mermaid label icon rendering ---

	// Regex matching `<prefix>:<name>` for every known icon pack - loaded or not.
	iconTokenRegex(): RegExp {
		const prefixes = this.knownPrefixes()
			.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
			.join("|");
		return new RegExp(`(${prefixes}):([\\w-]+)`, "g");
	}

	// Build an <img> with a data-URI SVG. An <img> is not a <path>, so Mermaid's
	// `.node path { fill }` colouring can't repaint it, and the SVG renders in an
	// isolated context with its original colours. Sizing via CSS .mermaid-label-icon.
	buildIconElement(prefix: string, name: string, color: string): Element | null {
		const iconData = this.getIconData(prefix, name);
		if (!iconData || !iconData.body) return null;

		let w = iconData.width;
		let h = iconData.height;
		if (!w && !h) {
			w = 24;
			h = 24;
		} else if (!w) {
			w = h;
		} else if (!h) {
			h = w;
		}

		const left = iconData.left ?? 0;
		const top = iconData.top ?? 0;
		const viewBox = `${left} ${top} ${w} ${h}`;
		// Bake the colour into the (isolated) data-URI SVG so `currentColor` icons
		// resolve to the label's intended icon colour instead of black.
		const colorStyle = color ? ` style="color:${color}"` : "";
		const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="${viewBox}"${colorStyle} preserveAspectRatio="xMidYMid meet">${iconData.body}</svg>`;

		const img = document.createElement("img");
		img.addClass("mermaid-label-icon");
		img.src = "data:image/svg+xml," + encodeURIComponent(svgStr);
		// MUST stay empty: caption plugins (e.g. wk-image-caption) turn any
		// non-empty alt into a caption <div> INSIDE the mermaid label, which
		// our pipeline observer answers with an icon re-render - an endless
		// observer ping-pong that hard-freezes the renderer. Token lives in
		// aria-label for accessibility/debugging instead.
		img.alt = "";
		img.setAttribute("aria-label", `${prefix}:${name}`);
		return img;
	}

	// Replace icon tokens inside a single label element's text nodes.
	private processLabel(labelEl: HTMLElement) {
		if (labelEl.dataset.mermaidIconsDone === "1") return;
		if (!this.iconTokenRegex().test(labelEl.textContent || "")) {
			// A `word:word` shape may be a token of a pack that has not
			// finished loading yet (the regex only knows loaded prefixes).
			// Leave the label unmarked so the post-load rescan retries it.
			if (!/[\w-]+:[\w-]+/.test(labelEl.textContent || "")) {
				labelEl.dataset.mermaidIconsDone = "1";
			}
			return;
		}

		// Icon colour: a theme-settable CSS var, else the label's text colour.
		const cs = getComputedStyle(labelEl);
		const iconColor = (
			cs.getPropertyValue("--mermaid-label-icon-color").trim() ||
			cs.color ||
			""
		).trim();
		let added = false;
		let unresolved = false;

		const walker = document.createTreeWalker(labelEl, NodeFilter.SHOW_TEXT);
		const textNodes: Text[] = [];
		while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

		for (const tn of textNodes) {
			const text = tn.nodeValue || "";
			const re = this.iconTokenRegex();
			if (!re.test(text)) continue;
			re.lastIndex = 0;

			const frag = document.createDocumentFragment();
			let last = 0;
			let m: RegExpExecArray | null;
			while ((m = re.exec(text)) !== null) {
				if (m.index > last) {
					frag.appendChild(document.createTextNode(text.slice(last, m.index)));
				}
				const iconEl = this.buildIconElement(m[1], m[2], iconColor);
				if (iconEl) {
					frag.appendChild(iconEl);
					added = true;
				} else {
					frag.appendChild(document.createTextNode(m[0]));
					unresolved = true;
				}
				last = m.index + m[0].length;
			}
			if (last < text.length) {
				frag.appendChild(document.createTextNode(text.slice(last)));
			}
			tn.parentNode?.replaceChild(frag, tn);
		}

		if (added) this.resizeLabelBox(labelEl);
		// A token whose pack is missing stays unresolved - do not seal the
		// label, the rescan after the pack load must be able to retry it.
		if (!unresolved) labelEl.dataset.mermaidIconsDone = "1";
	}

	// Mermaid sizes the node box from the label text BEFORE we inject the icon,
	// so a larger icon overflows. Grow the foreignObject + node rect to fit the
	// real content and re-centre (only ever grows; never shrinks).
	private resizeLabelBox(labelEl: HTMLElement) {
		const fo = labelEl.closest(
			"foreignObject",
		) as SVGForeignObjectElement | null;
		if (!fo) return;
		const labelG = fo.parentElement;
		const shape = labelEl.closest(".node, .icon-shape");
		const rect = shape?.querySelector(
			"rect.label-container, rect.basic",
		) as SVGRectElement | null;

		const content = (labelEl.querySelector("p") as HTMLElement) || labelEl;
		const needW = Math.ceil(content.scrollWidth);
		const needH = Math.ceil(content.scrollHeight);
		if (!needW || !needH) return;

		const foW = fo.width.baseVal.value;
		const foH = fo.height.baseVal.value;
		if (needH <= foH + 1 && needW <= foW + 1) return;

		const newFoW = Math.max(needW, foW);
		const newFoH = Math.max(needH, foH);
		fo.setAttribute("width", String(newFoW));
		fo.setAttribute("height", String(newFoH));
		if (shape) {
			// Node label: its group is positioned RELATIVE to the node centre, so
			// half the new size re-centres it.
			labelG?.setAttribute("transform", `translate(${-newFoW / 2}, ${-newFoH / 2})`);
		} else if (labelG) {
			// Cluster/subgraph title: mermaid places this group at an ABSOLUTE
			// position. Applying the node formula overwrote that and threw the
			// title to the upper left of its box (visible as a subgraph label
			// hanging outside the frame as soon as it carried an icon). Keep the
			// position and only compensate for the growth, so the title stays
			// centred over its box.
			const m = /translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)/.exec(
				labelG.getAttribute("transform") || "",
			);
			if (m) {
				const x = parseFloat(m[1]) - (newFoW - foW) / 2;
				const y = parseFloat(m[2]) - (newFoH - foH) / 2;
				labelG.setAttribute("transform", `translate(${x}, ${y})`);
			}
		}
		if (rect) {
			const padX = (rect.width.baseVal.value - foW) / 2;
			const padY = (rect.height.baseVal.value - foH) / 2;
			const newRectW = newFoW + 2 * padX;
			const newRectH = newFoH + 2 * padY;
			rect.setAttribute("width", String(newRectW));
			rect.setAttribute("height", String(newRectH));
			rect.setAttribute("x", String(-newRectW / 2));
			rect.setAttribute("y", String(-newRectH / 2));
		}
	}

	// Render icon tokens in Mermaid labels found under `root` (.nodeLabel /
	// .edgeLabel are Mermaid-only classes, so this never touches other content).
	processLabels(root: ParentNode) {
		root
			.querySelectorAll<HTMLElement>(".nodeLabel, .edgeLabel")
			.forEach((el) => this.processLabel(el));
	}

	// Clear the processed flags under `root` (or the whole document) and
	// re-render, e.g. once custom packs have finished loading or a label
	// re-rendered while a diagram was engaged.
	rescanLabels(root: ParentNode = document.body) {
		root
			.querySelectorAll<HTMLElement>(".nodeLabel, .edgeLabel")
			.forEach((el) => {
				delete el.dataset.mermaidIconsDone;
			});
		this.processLabels(root);
	}

	// Inline `<code>` preview for the editor (mermaid icon tokens).
	processInlineCode(element: HTMLElement) {
		const codeBlocks = element.querySelectorAll("code");
		codeBlocks.forEach((code) => {
			const text = code.textContent || "";
			const matches = text.matchAll(this.iconTokenRegex());
			for (const match of matches) {
				const iconData = this.getIconData(match[1], match[2]);
				if (iconData && iconData.body) {
					let w = iconData.width;
					let h = iconData.height;
					if (!w && !h) {
						w = 32;
						h = 32;
					} else if (!w) {
						w = h;
					} else if (!h) {
						h = w;
					}
					const left = iconData.left ?? 0;
					const top = iconData.top ?? 0;
					const viewBox = `${left} ${top} ${w} ${h}`;
					const iconSpan = document.createElement("span");
					iconSpan.addClass("mermaid-icon-preview-inline");
					const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="16" height="16" preserveAspectRatio="xMidYMid meet" style="width:16px; height:16px; display:block;">${iconData.body}</svg>`;
					setSvg(iconSpan, svg);
					code.parentNode?.insertBefore(iconSpan, code);
				}
			}
		});
	}
}

// --- Icon picker modal (Insert Mermaid icon command) ---
export class IconModal extends FuzzySuggestModal<{ prefix: string; name: string }> {
	private readonly icons: IconManager;
	private readonly onChoose: (result: string) => void;

	constructor(
		app: App,
		icons: IconManager,
		onChoose: (result: string) => void,
	) {
		super(app);
		this.icons = icons;
		this.onChoose = onChoose;
		this.setPlaceholder("Icons durchsuchen…");
	}

	getItems(): { prefix: string; name: string }[] {
		return this.icons.getAllIcons();
	}

	getItemText(item: { prefix: string; name: string }): string {
		return `${item.prefix}:${item.name}`;
	}

	renderSuggestion(
		item: FuzzyMatch<{ prefix: string; name: string }>,
		el: HTMLElement,
	) {
		super.renderSuggestion(item, el);

		const textContent = [];
		while (el.firstChild) {
			textContent.push(el.firstChild);
			el.removeChild(el.firstChild);
		}

		el.addClass("mermaid-icon-suggestion");
		const iconContainer = el.createDiv("mermaid-icon-suggestion-icon");
		const textContainer = el.createDiv("mermaid-icon-suggestion-text");
		textContent.forEach((node) => textContainer.appendChild(node));

		const iconData = this.icons.getIconData(item.item.prefix, item.item.name);
		if (iconData && iconData.body) {
			let w = iconData.width;
			let h = iconData.height;
			if (!w && !h) {
				w = 32;
				h = 32;
			} else if (!w) {
				w = h;
			} else if (!h) {
				h = w;
			}
			const left = iconData.left ?? 0;
			const top = iconData.top ?? 0;
			const viewBox = `${left} ${top} ${w} ${h}`;
			const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="32" height="32" preserveAspectRatio="xMidYMid meet" style="width:32px; height:32px; display:block;">${iconData.body}</svg>`;
			setSvg(iconContainer, svg);
		}
	}

	onChooseItem(
		item: { prefix: string; name: string },
		_evt: MouseEvent | KeyboardEvent,
	): void {
		this.onChoose(`${item.prefix}:${item.name}`);
	}
}
