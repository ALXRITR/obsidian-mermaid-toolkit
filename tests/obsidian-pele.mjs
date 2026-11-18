// Run against an open Obsidian 1.15+ vault with the toolkit enabled and the
// Phosphor pack installed: node tests/obsidian-pele.mjs <vault name>
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

async function checkDiagrams() {
	const plugin = app.plugins.getPlugin("mermaid-toolkit");
	const host = document.createElement("div");
	host.style.cssText = "position:absolute;left:-10000px;width:1200px";
	document.body.appendChild(host);
	const draw = (markup) => {
		const block = document.createElement("div");
		block.className = "mermaid";
		block.innerHTML = markup;
		host.appendChild(block);
		return block;
	};
	try {
		const { svg } = await window.mermaid.render("toolkit-smoke", [
			"flowchart LR", "subgraph sg[\"phosphor:user Team\"]",
			'A["phosphor:user-plus<br/>Einladung"]:::primary -->|"phosphor:user Rolle"| B{"Freigabe?"}',
			'end', 'B --> C["Start phosphor:user und phosphor:user-plus Ende"]:::accent',
			'C --> D["phosphor:toolkit-unknown"]',
			'D --> E@{ icon: "phosphor:user", label: "Person", form: "square" }',
		].join("\n"));
		const block = draw(svg);
		const legacy = draw('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"><g class="node"><rect width="100" height="40"/><foreignObject width="100" height="40"><div xmlns="http://www.w3.org/1999/xhtml"><span class="nodeLabel">phosphor:user Rolle</span></div></foreignObject></g></svg>');
		for (let tries = 0; tries < 100 && block.querySelectorAll("image").length < 6; tries++) {
			await new Promise(resolve => setTimeout(resolve, 50));
		}
		const root = block.querySelector("svg.pele");
		const initialCount = root.querySelectorAll("image").length;
		plugin.icons.rescanLabels(root);
		const node = id => root.querySelector(`.pele-node[data-id="${id}"]`);
		// The CSS variables are from the chosen vault theme. Verify actual fills.
		const expected = variable => {
			const probe = document.createElement("span");
			probe.style.color = `var(${variable})`;
			block.append(probe);
			const color = getComputedStyle(probe).color;
			probe.remove();
			return color;
		};
		const nativeIcons = [...root.querySelectorAll("image")];
		const result = {
			initialCount, count: nativeIcons.length,
			measured: nativeIcons.every(i => i.getBBox().width > 0 && i.getAttribute("href").startsWith("data:image/svg+xml,")),
			label: node("C").textContent.replace(/\s+/g, " ").trim(),
			unknown: node("D").textContent,
			legacy: legacy.querySelectorAll("img.mermaid-label-icon").length,
			zoom: !!block.closest(".mermaid-zoom-container"),
		};
		if (["dguv", "uvitas"].includes(plugin.settings.themeMode)) {
			result.theme = [[node("A").querySelector("rect"), "--mm-primary"],
				[node("A").querySelector("text"), "--mm-on-primary"],
				[node("B").querySelector("polygon"), "--mm-decision"],
				[node("C").querySelector("rect"), "--mm-accent"]]
				.every(([el, token]) => getComputedStyle(el).fill === expected(token));
		}
		// A responsive redraw swaps the SVG under the same zoom controls.
		const replacement = (await window.mermaid.render("toolkit-resize", 'flowchart LR\n A["phosphor:user Neu"]')).svg;
		block.innerHTML = replacement;
		for (let tries = 0; tries < 100 && !block.querySelector("image"); tries++) {
			await new Promise(resolve => setTimeout(resolve, 50));
		}
		const wrap = block.closest(".mermaid-zoom-container");
		wrap.querySelector(".mermaid-zoom-btn").click();
		result.redrawZoom = wrap.classList.contains("is-engaged") && block.querySelector("svg").style.maxWidth === "none";
		return result;
	} finally {
		host.remove();
	}
}

const vault = process.argv[2];
assert(vault, "Pass an open test vault name");
const output = execFileSync("obsidian", [`vault=${vault}`, "eval", `code=(${checkDiagrams})()`], {encoding: "utf8"});
const actual = JSON.parse(output.replace(/^=>\s*/, ""));
console.log(actual);
assert.equal(actual.initialCount, 6);
assert.equal(actual.count, 6);
assert.equal(actual.measured, true);
assert.equal(actual.label, "Start und Ende");
assert.equal(actual.unknown, "phosphor:toolkit-unknown");
assert.equal(actual.legacy, 1);
assert.equal(actual.zoom, true);
assert.equal(actual.redrawZoom, true);
if ("theme" in actual) assert.equal(actual.theme, true);
