# Changelog

## Unveröffentlicht

- Neuer Name „Mermaid Toolkit“ und neue Plugin-ID `mermaid-toolkit`. Repository: [ALXRITR/obsidian-mermaid-toolkit](https://github.com/ALXRITR/obsidian-mermaid-toolkit).
- Die neue ID löst die bisherige ID `obsidian-mermaid-zoom` ab. Obsidian legt das Plugin dadurch in einem neuen Ordner `.obsidian/plugins/mermaid-toolkit` ab.
- Einstellungen werden beim ersten Start übernommen: Fehlt eine eigene `data.json`, liest das Plugin einmalig `.obsidian/plugins/obsidian-mermaid-zoom/data.json` und speichert den Inhalt als eigene Einstellungen. Der alte Ordner bleibt unverändert.
- Nach dem Wechsel das alte Plugin `obsidian-mermaid-zoom` deaktivieren, sonst laufen beide gleichzeitig.
- Tastenkürzel für den Befehl „Mermaid-Icon einfügen“ hängen an der Plugin-ID und müssen neu vergeben werden.
