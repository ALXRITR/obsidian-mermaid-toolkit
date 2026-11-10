# Changelog

## Unveröffentlicht

- Neue Einstellung „Ordner der Stile“ im Bereich Theme (bei Diagramm-Theme DGUV oder uvitas). Sie gibt den Vault-Ordner mit `style-dguv.css` und `style-uvitas.css` an.
- Ist das Feld leer, sucht das Plugin der Reihe nach in `_system/styles` und `_ADMIN/styles`. Vaults mit dem bisherigen Ordner `_ADMIN/styles` laufen ohne Eingriff weiter. Ist das Feld gesetzt, gilt nur dieser Ordner.
- Die Warnung zur fehlenden Theme-Datei nennt jetzt alle gesuchten Pfade.
- „Ordner für eigene Icon-Packs“ folgt demselben Muster: Der Standardwert ist jetzt leer. Dann sucht das Plugin der Reihe nach in `_system/daten/mermaid-icon-packs` und `_ADMIN/mermaid-icon-packs`. Ein bereits gespeicherter Ordner gilt unverändert weiter.
- Neuer Name „Mermaid Toolkit“ und neue Plugin-ID `mermaid-toolkit`. Repository: [ALXRITR/obsidian-mermaid-toolkit](https://github.com/ALXRITR/obsidian-mermaid-toolkit).
- Die neue ID löst die bisherige ID `obsidian-mermaid-zoom` ab. Obsidian legt das Plugin dadurch in einem neuen Ordner `.obsidian/plugins/mermaid-toolkit` ab.
- Einstellungen werden beim ersten Start übernommen: Fehlt eine eigene `data.json`, liest das Plugin einmalig `.obsidian/plugins/obsidian-mermaid-zoom/data.json` und speichert den Inhalt als eigene Einstellungen. Der alte Ordner bleibt unverändert.
- Nach dem Wechsel das alte Plugin `obsidian-mermaid-zoom` deaktivieren, sonst laufen beide gleichzeitig.
- Tastenkürzel für den Befehl „Mermaid-Icon einfügen“ hängen an der Plugin-ID und müssen neu vergeben werden.
