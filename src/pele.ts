// Pele draws labels with SVG text/tspan, including independently positioned
// lines. Each resolved token reserves the width of its icon in the text run.
// The image is an SVG sibling: zoom clones and PDF exports can serialize it.
const SVG = "http://www.w3.org/2000/svg";
const SLOT = "data-mermaid-icon-slot";

export function renderPeleIcons(
	label: SVGTextElement,
	tokens: RegExp,
	iconSource: (prefix: string, name: string, color: string) => string | null,
) {
	const doc = label.ownerDocument;
	const styles = getComputedStyle(label);
	const color = styles.getPropertyValue("--mermaid-label-icon-color").trim() || styles.fill;
	const walker = doc.createTreeWalker(label, NodeFilter.SHOW_TEXT);
	const textNodes: Text[] = [];
	while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

	const images = new Map<SVGTSpanElement, string>();
	for (const node of textNodes) {
		const value = node.data;
		const fragment = doc.createDocumentFragment();
		let end = 0;
		for (const match of value.matchAll(tokens)) {
			const src = iconSource(match[1], match[2], color);
			if (!src) continue; // Unknown or still loading. A later pass can retry.
			const start = match.index!;
			fragment.append(value.slice(end, start));
			const slot = doc.createElementNS(SVG, "tspan");
			slot.setAttribute(SLOT, match[0]);
			slot.style.fontSize = "var(--mm-label-icon-size, 1em)";
			slot.textContent = "\u2003";
			fragment.append(slot);
			images.set(slot, src);
			end = start + match[0].length;
		}
		if (end) {
			fragment.append(value.slice(end));
			node.replaceWith(fragment);
		}
	}
	if (!images.size) return;

	// Earlier slots may move when another token on the same line resolves.
	// Rebuild the one overlay for this label after all its text has reflowed.
	const layer = label.nextElementSibling?.classList.contains("mermaid-pele-icons")
		? label.nextElementSibling as SVGGElement
		: doc.createElementNS(SVG, "g");
	layer.classList.add("mermaid-pele-icons");
	layer.setAttribute("pointer-events", "none");
	layer.setAttribute("aria-hidden", "true");
	const transform = label.getAttribute("transform");
	if (transform) layer.setAttribute("transform", transform);
	layer.replaceChildren();
	label.after(layer);
	for (const slot of Array.from(label.querySelectorAll<SVGTSpanElement>(`tspan[${SLOT}]`))) {
		const token = slot.getAttribute(SLOT)!;
		const [prefix, name] = token.split(":");
		const src = images.get(slot) ?? iconSource(prefix, name, color);
		if (!src || !slot.getNumberOfChars()) {
			slot.replaceWith(token);
			continue;
		}
		const pos = slot.getStartPositionOfChar(0);
		const width = slot.getComputedTextLength();
		if (!width) {
			slot.replaceWith(token);
			continue;
		}
		const image = doc.createElementNS(SVG, "image");
		image.setAttribute("href", src);
		image.setAttribute("data-mermaid-icon", token);
		image.dataset.mermaidIconColor = color;
		image.setAttribute("x", String(pos.x));
		image.setAttribute("y", String(pos.y - width * 0.84));
		image.setAttribute("width", String(width));
		image.setAttribute("height", String(width));
		layer.append(image);
	}
}

// The canvas and clusters can both be translucent. Punch the label footprints
// out of the edges so the actual underlying surface shows through once.
export function maskPeleEdgeLabels(svg: SVGSVGElement) {
	const edges = svg.querySelector<SVGGElement>(".pele-edges");
	if (!edges || edges.hasAttribute("data-mermaid-label-gaps")) return;
	const labels = edges.parentElement?.querySelectorAll<SVGRectElement>(
		":scope > .pele-edge-labels > .pele-edge-label > rect",
	);
	if (!labels?.length) return;
	const doc = svg.ownerDocument;
	const mask = doc.createElementNS(SVG, "mask");
	mask.id = "mermaid-label-gaps-" + crypto.randomUUID();
	mask.setAttribute("maskUnits", "userSpaceOnUse");
	const bounds = svg.viewBox.baseVal;
	if (!bounds.width || !bounds.height) return;
	const background = doc.createElementNS(SVG, "rect");
	for (const [attr, value] of Object.entries({
		x: bounds.x - 8, y: bounds.y - 8, width: bounds.width + 16, height: bounds.height + 16,
	})) {
		mask.setAttribute(attr, String(value));
		background.setAttribute(attr, String(value));
	}
	background.style.fill = "white";
	mask.append(background);
	for (const label of Array.from(labels)) {
		const gap = doc.createElementNS(SVG, "rect");
		for (const attr of ["x", "y", "width", "height", "rx", "ry"]) {
			if (label.hasAttribute(attr)) gap.setAttribute(attr, label.getAttribute(attr)!);
		}
		gap.style.fill = "black";
		mask.append(gap);
	}
	const defs = doc.createElementNS(SVG, "defs");
	defs.append(mask);
	svg.prepend(defs);
	edges.style.setProperty("--mermaid-label-gaps", `url(#${mask.id})`);
	edges.setAttribute("data-mermaid-label-gaps", "");
}

// Resolve the light design tokens at :root, before Obsidian's body selects
// its dark screen palette. The handout measures and displays on white paper.
const paperTokens = [
	"canvas", "node", "stroke", "text", "icon", "primary", "on-primary",
	"decision", "decision-stroke", "accent", "cluster", "cluster-stroke",
];
// These variables are resolved by the active vault theme, including the print
// window. Other themes (and the theme-off setting) keep their own Pele styles.
export const PELE_VAULT_THEME = `
:root {
	${paperTokens.map(key => `--mermaid-paper-${key}: var(--mm-${key});`).join("\n")}
}
:is(.uvitas-render-sandbox, .uvi-doc) {
	${paperTokens.map(key => `--mm-${key}: var(--mermaid-paper-${key});`).join("\n")}
}
.mermaid svg.pele [data-mermaid-label-gaps] {
	mask: var(--mermaid-label-gaps);
}
.mermaid svg.pele [data-mermaid-label-gaps] ~ .pele-edge-labels .pele-edge-label > rect {
	fill: none !important;
}
/* Retain the configured screen icon colour for a light reading pane. */
:where(body.theme-dark, .uvitas-render-sandbox, .uvi-doc) .mermaid svg.pele .pele-label {
	--mermaid-label-icon-color: var(--mm-icon);
}
.mermaid svg.pele .pele-node.primary .pele-label {
	--mermaid-label-icon-color: var(--mm-on-primary);
}
.mermaid svg.pele {
	--mermaid-themed-pele: 1;
	--pele-surface: var(--mm-node);
	--pele-border: var(--mm-stroke);
	--pele-fg: var(--mm-text);
	--pele-line: var(--mm-stroke);
	--pele-surface-alt: var(--mm-cluster);
	--pele-font: var(--uvi-font-body);
}
.mermaid .pele-cluster { --_b: var(--mm-cluster-stroke); }
.mermaid .pele-shape-diam {
	--_s: var(--mm-decision);
	--_b: var(--mm-decision-stroke);
}
.mermaid .pele-node.primary {
	--_s: var(--mm-primary);
	--_b: var(--mm-primary);
}
.mermaid .pele-node.primary text {
	fill: var(--mm-on-primary) !important;
	--mermaid-label-icon-color: var(--mm-on-primary);
}
.mermaid .pele-node:is(.accent,.danger) {
	--_s: var(--mm-accent);
	--_b: var(--mm-decision-stroke);
}
`;
