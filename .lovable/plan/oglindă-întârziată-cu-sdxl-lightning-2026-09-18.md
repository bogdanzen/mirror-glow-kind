# Oglindă întârziată cu SDXL Lightning

Scop: chipul de pe ecran devine chel „live", fără GPU-ul propriu. Camera rulează cu 2 secunde întârziere, iar în acele 2 secunde se generează în fundal capul ras și se lipește peste capul real din cadrul întârziat.

## Cum arată pentru vizitator

Vede video normal, pe tot ecranul, cu întârziere de 2 secunde (imperceptibil dacă nu se mișcă brusc). Capul lui apare ras, se mișcă odată cu el, corpul, hainele și fundalul rămân filmarea reală. Granulația și textura existente maschează diferența dintre capul generat și restul cadrului.

## Mecanism

```text
cameră ──> buffer inelar 2 s ──> cadru întârziat pe canvas ──┐
   │                                                          ├─> compunere + grain -> ecran
   └─> detecție cap -> decupaj 1024x1024 -> SDXL Lightning ───┘
                          (2-3 imagini / secundă)
```

1. **Buffer de întârziere.** Cadrele camerei se scriu într-un buffer inelar cu marcaj de timp. Randarea desenează mereu cadrul de acum 2 secunde (durata reglabilă).
2. **Detecția capului.** Pe cadrul proaspăt se detectează fața, se extinde caseta ca să prindă tot craniul și puțin gât, se decupează pătrat și se scalează la 1024x1024. Caseta se salvează împreună cu marcajul de timp.
3. **Generarea.** Decupajul merge la SDXL Lightning (fal.ai, 4 pași, ~0,4-0,7 s). 2-3 cereri în paralel, deci 2-3 capete noi pe secundă.
4. **Compunerea.** Când se desenează cadrul de la momentul T, se alege ultimul cap generat din cadrul cel mai apropiat de T și se lipește în caseta capului din acel cadru, cu mască ovală estompată și potrivire ușoară de culoare. Între generări, ultimul cap se repoziționează și se rescalează după caseta curentă, deci urmărește mișcarea fără să pară înghețat.

## Ce contează pentru calitate

- **Strength mic (0,3-0,45)**: păstrează identitatea; mai mare = altă persoană.
- **Aceeași sămânță (seed fix)** pentru toate cadrele: fără ea, fiecare cap generat arată altfel și imaginea pâlpâie. Cu seed fix plus estompare între capete, tranziția e lină.
- **Marginile**: masca ovală estompată pe 60-80 px și o corecție de luminanță pe marginea măștii fac lipirea invizibilă.
- **Mișcare bruscă**: dacă persoana se mișcă rapid, capul generat rămâne în urmă. Detectăm asta (deplasare mare a casetei) și creștem estomparea în loc să afișăm o lipire greșită.

## Detecția feței — recomandare

Folosim MediaPipe Face Detector (`@mediapipe/tasks-vision`, rulează local pe GPU-ul tabletei, ~5 ms/cadru, nimic nu pleacă de pe dispozitiv). E mai sigur decât detectorul nativ din Chrome, care pe Android nu e garantat. Dacă nu vrei o dependență nouă, alternativa e o zonă fixă a capului, aliniată la ovalul din ecranul de încadrare — merge doar dacă omul stă în oval.

## Confidențialitate — de decis

Decupajele cu fața pleacă la fal.ai ca să fie procesate (nu se stochează, dar ies de pe dispozitiv). Textele din ecranul de consimțământ și din /gdpr trebuie actualizate ca să spună clar asta. La fel e și acum cu modelul de pe server, doar că acolo procesarea e a Lovable.

## Cost

Un cadru SDXL Lightning costă foarte puțin, dar la 2-3 cadre/secundă o sesiune de 40 de secunde înseamnă ~100 de imagini. Panoul va avea limitator de cadre pe secundă și un buton de oprire, ca să poți regla costul pe sesiune.

## Comenzi noi în panou

- Motor: „Portret fix" (actual) / „Oglindă întârziată SDXL Lightning" (nou)
- Întârziere video: 0,5-4 s (implicit 2 s)
- Cadre generate pe secundă: 1-4
- Intensitate transformare, pași, seed
- Mărime decupaj: 768 / 1024
- Marjă în jurul capului și estompare margine
- Mod depanare: afișează caseta capului, latența reală și cadrele/secundă

## Detalii tehnice

- `src/routes/api/fal.ts`: acceptă `seed`, `image_size`, `negative_prompt` și modelul `fal-ai/fast-lightning-sdxl/image-to-image`; răspunsul include `seed`. Se păstrează cheia din panou sau `FAL_KEY`.
- `src/lib/bald.ts`: se adaugă `fal-ai/fast-lightning-sdxl/image-to-image` în `FAL_MODELS` și un prompt scurt dedicat SDXL (promptul actual, lung, e scris pentru modele de tip GPT-image și încurcă SDXL).
- `src/lib/headcrop.ts` (nou): inițializare MediaPipe, `detectHead(video)` -> casetă pătrată extinsă, `cropToFile(video, box, size)`.
- `src/lib/delaymirror.ts` (nou): buffer inelar (`ImageBitmap` + timestamp + casetă), bucla de generare cu N lucrători și seed fix, bucla de randare pe `requestAnimationFrame` care compune cadrul întârziat cu ultimul cap potrivit, mască ovală estompată, potrivire de luminanță.
- `src/routes/index.tsx`: în ecranul oglinzii, când motorul e „întârziat", se randează un `<canvas>` pe tot ecranul în locul elementului video; captura pentru QR ia cadrul compus curent; oprirea buclei la ieșire, la captură și la inactivitate.
- `src/lib/settings.ts`: câmpuri noi (`mirrorEngine`, `delayMs`, `genFps`, `cropSize`, `headMargin`, `featherPx`, `falSeed`), sanitizare, cheie bumpată la v10.
- `src/components/AdminPanel.tsx`: secțiunea de comenzi de mai sus.
- Memorie: bufferul se ține la 1280x720 și 15 cadre/s (~30 de imagini) ca să rămână sub ~150 MB pe tableta de 4 GB; afișarea se scalează la rezoluția ecranului.
- Mașina GPU nu se atinge; acest mod e complet independent de ea.

## Verificare

1. Test de latență reală pe fal.ai cu SDXL Lightning, de pe server: timp pe imagine și rata susținută la 2-3 cereri paralele.
2. Test în browser cu cameră simulată: bufferul livrează exact 2 s întârziere, caseta capului urmărește fața, capul generat rămâne lipit fără pâlpâire.
3. Fluxul complet al totemului: încadrare -> oglindă -> alegere -> prevenție -> final, fără erori și cu resetare corectă.
