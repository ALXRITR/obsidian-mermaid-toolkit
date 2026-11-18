# Changelog

## 2.1.8 – 18.11.2026

- Bei uvitas und DGUV unterbrechen beschriftete Verbindungen die Linie unter dem Text. Der Hintergrund des Diagramms oder der Gruppe bleibt sichtbar.
- Die Icons in Pele-Beschriftungen verwenden die Größe des Designs. Ihre Farbe folgt dem hellen oder dunklen Lesemodus.
- PDF-Handouts verwenden die helle Diagrammpalette auch dann, wenn Obsidian im dunklen Modus läuft. Das gilt auch für die Vorschau.

## 2.1.7 – 18.11.2026

- Zoom und Vollbild erfassen die neue Zeichnung auch dann, wenn man direkt nach einer Größenänderung klickt und das Toolkit noch auf die Meldung von Pele wartet.

## 2.1.6 – 18.11.2026

- Obsidian 1.15 zeigt Icons aus Vault-Packs und Iconify-Packs in Pele-Beschriftungen und Icon-Knoten. Die Icons bleiben beim PDF-Export erhalten.
- Die Themes uvitas und DGUV verwenden ihre Vault-Farben auch für Pele-Knoten, Entscheidungen und Pfeile.
- Nach einer Größenänderung arbeiten Zoom und Vollbild mit dem neu gezeichneten Diagramm. Diagramme werden auch bei einem Export im Hintergrund verarbeitet.

## Frühere Änderungen

- Neue Einstellung „Ordner der Stile“ im Bereich Theme (bei Diagramm-Theme DGUV oder uvitas). Sie gibt den Vault-Ordner mit `style-dguv.css` und `style-uvitas.css` an.
- Ist das Feld leer, sucht das Plugin der Reihe nach in `_system/styles` und `_ADMIN/styles`. Vaults mit dem bisherigen Ordner `_ADMIN/styles` laufen ohne Eingriff weiter. Ist das Feld gesetzt, gilt nur dieser Ordner.
- Die Warnung zur fehlenden Theme-Datei nennt jetzt alle gesuchten Pfade.
- „Ordner für eigene Icon-Packs“ folgt demselben Muster: Der Standardwert ist jetzt leer. Dann sucht das Plugin der Reihe nach in `_system/daten/mermaid-icon-packs` und `_ADMIN/mermaid-icon-packs`. Ein bereits gespeicherter Ordner gilt unverändert weiter.
- Neuer Name „Mermaid Toolkit“ und neue Plugin-ID `mermaid-toolkit`. Repository: [ALXRITR/obsidian-mermaid-toolkit](https://github.com/ALXRITR/obsidian-mermaid-toolkit).
- Die neue ID löst die bisherige ID `obsidian-mermaid-zoom` ab. Obsidian legt das Plugin dadurch in einem neuen Ordner `.obsidian/plugins/mermaid-toolkit` ab.
- Einstellungen werden beim ersten Start übernommen: Fehlt eine eigene `data.json`, liest das Plugin einmalig `.obsidian/plugins/obsidian-mermaid-zoom/data.json` und speichert den Inhalt als eigene Einstellungen. Der alte Ordner bleibt unverändert.
- Nach dem Wechsel das alte Plugin `obsidian-mermaid-zoom` deaktivieren, sonst laufen beide gleichzeitig.
- Tastenkürzel für den Befehl „Mermaid-Icon einfügen“ hängen an der Plugin-ID und müssen neu vergeben werden.
