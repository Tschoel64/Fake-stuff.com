# TafelText – lokaler Text-Scanner für Schulen

Eine kleine Web-App, die Fotos oder Scans von Arbeitsblättern direkt im Browser in
bearbeitbaren Text umwandelt – **gedruckten Text und Handschrift**. Es gibt keinen
Server und keine API: die komplette Texterkennung läuft per WebAssembly
([Tesseract.js](https://github.com/naptha/tesseract.js)) auf dem Gerät der
Nutzerin oder des Nutzers. Kein Bild und kein erkannter Text verlässt jemals den
Browser – das macht die App unkompliziert nutzbar in Schulen, auch unter
Datenschutz-/DSGVO-Gesichtspunkten.

## Funktionen

- Bilder per Drag&Drop, Dateiauswahl oder direkt über die Kamera (Webcam /
  Dokumentenkamera) hinzufügen
- Mehrere Seiten nacheinander erfassen und in einem Lauf erkennen
- Drehen, Kontrast/Helligkeit anpassen und Schwarz-Weiß-Schwelle einstellen,
  bevor erkannt wird – das verbessert die Trefferquote bei Fotos deutlich
- Umschaltbar zwischen „Gedruckter Text" und „Handschrift"
- Deutsch, Englisch oder beides gleichzeitig
- Ergebnis ist direkt editierbar, dazu Kopieren / als .txt herunterladen /
  drucken
- Funktioniert nach dem ersten Laden auch komplett offline (Service Worker
  cached alle Dateien inklusive Spracherkennungsdaten)

## Wichtig: Grenzen der Handschrift-Erkennung

Tesseract (die zugrunde liegende Engine) ist ursprünglich auf **gedruckten
Text** trainiert. Handschrift wird unterstützt, die Erkennungsrate ist aber
spürbar niedriger als bei Druckschrift, besonders bei verschnörkelter
Schreibschrift. Für brauchbare Ergebnisse hilft:

- in deutlicher, möglichst gleichmäßiger Schrift schreiben (Blockschrift
  schneidet meist besser ab als Schreibschrift)
- gutes, gleichmäßiges Licht beim Fotografieren, keine Schatten auf dem Blatt
- nur den eigentlichen Textbereich fotografieren (nicht den ganzen Tisch mit)
- das Ergebnis danach kurz gegenlesen – die App liefert einen guten Entwurf,
  keine fehlerfreie Abschrift

## Lokal testen

Da die App Web Worker und WebAssembly lädt, funktioniert das **nicht** durch
einfaches Doppelklicken der `index.html` (Browser blockieren das aus
Sicherheitsgründen via `file://`). Stattdessen lokal über einen einfachen
Webserver starten, zum Beispiel:

```bash
cd site
python3 -m http.server 8080
```

und dann `http://localhost:8080` im Browser öffnen. Alternativ funktioniert
jede andere statische Dev-Server-Lösung (z. B. die VS-Code-Erweiterung „Live
Server").

## Auf GitHub veröffentlichen (GitHub Pages)

1. Inhalt des Ordners `site/` in ein neues GitHub-Repository hochladen (am
   einfachsten landet der Inhalt direkt im Wurzelverzeichnis des Repos).
2. Im Repository unter **Settings → Pages** als Quelle den entsprechenden
   Branch (z. B. `main`) und das Root-Verzeichnis auswählen.
3. Nach kurzer Zeit ist die App unter `https://<benutzername>.github.io/<repo>/`
   erreichbar.

Da alles als statische Datei ausgeliefert wird, reicht GitHub Pages völlig aus
– es wird kein Backend benötigt.

## Warum ist der Ordner `vendor/` so groß (~18 MB)?

Dort liegen die Tesseract.js-Engine (WebAssembly) sowie die Sprachdaten für
Deutsch und Englisch – fest im Repository, statt sie zur Laufzeit von einem
CDN nachzuladen. Genau das sorgt dafür, dass die App ohne jede externe
Verbindung läuft. Wer Speicherplatz sparen möchte, kann eine der beiden
Sprachen in `assets/app.js`/`index.html` entfernen.

## Projektstruktur

```
site/
├── index.html              Oberfläche
├── manifest.json           Web-App-Manifest (Installierbarkeit)
├── sw.js                   Service Worker für Offline-Nutzung
├── assets/
│   ├── style.css
│   └── app.js               Bildaufbereitung, Kamera, OCR-Steuerung
└── vendor/
    ├── tesseract/            Tesseract.js Engine + WebAssembly-Kern
    └── tessdata/             Trainierte Sprachdaten (Deutsch, Englisch)
```

## Lizenz

Der eigene Code dieses Projekts steht unter der MIT-Lizenz (siehe `LICENSE`).
Tesseract.js und der Tesseract-OCR-Kern stehen unter Apache-2.0; die jeweiligen
Lizenztexte liegen zur Nachvollziehbarkeit unter `vendor/tesseract/`.
