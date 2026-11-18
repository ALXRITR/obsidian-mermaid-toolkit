// Pele draws labels with SVG text/tspan, including independently positioned
// lines. Keep that layout and replace each resolved token with one em of space.
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
		image.setAttribute("x", String(pos.x));
		image.setAttribute("y", String(pos.y - width * 0.84));
		image.setAttribute("width", String(width));
		image.setAttribute("height", String(width));
		layer.append(image);
	}
}

// These variables are resolved by the active vault theme, including the print
// window. Other themes (and the theme-off setting) keep their own Pele styles.
export const PELE_VAULT_THEME = `
.mermaid svg.pele {
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
