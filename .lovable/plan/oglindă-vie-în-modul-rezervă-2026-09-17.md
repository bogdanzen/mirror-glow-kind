# Oglindă „vie” în modul rezervă

## Ce e posibil, sincer

5 cadre pe secundă nu se pot obține de la un model de imagine pe server: fiecare
portret durează zeci de secunde. Ce se poate: un portret nou la fiecare câteva
secunde, cu tranziții line, astfel încât imaginea să pară vie, nu înghețată —
fără pierdere de calitate.

Ținta realistă: un portret nou la ~3–6 secunde, în funcție de model și încărcare.

## Cum obținem senzația de „viu”

1. **Buclă continuă de regenerare**
   În ecranul oglinzii, în loc de o singură transformare, pornește o buclă: se ia
   un cadru proaspăt din cameră, se trimite la server, iar când rezultatul vine
   se afișează. Bucla se oprește la ieșirea din ecran sau la captură.

2. **Două cereri în paralel, decalate**
   Se țin două transformări în lucru simultan, pornite decalat la jumătate de
   interval. Astfel intervalul vizibil între portrete se reduce aproximativ la
   jumătate, fără să crească timpul unei cereri.

3. **Tranziție lină**
   Portretul nou apare peste cel vechi cu o trecere de ~400 ms, ca să nu clipească.
   Cadrele parțiale (previzualizările modelului) rămân folosite doar pentru primul
   portret, ca să apară repede ceva pe ecran.

4. **Model mai rapid, calitate păstrată**
   Se comută pe varianta rapidă a aceluiași model de imagine, cu calitate
   „high” păstrată. Dacă diferența de calitate e vizibilă, se poate întoarce
   din panou la varianta de calitate maximă.

5. **Captura**
   La momentul capturii se folosește ultimul portret complet, nu unul parțial, ca
   poza salvată și codul QR să rămână perfect clare.

## Control din panou

- „Mod rezervă” rămâne comutabil ca acum.
- Nou: „Reîmprospătare portret” — Oprit (o singură poză, ca acum) / Normal / Rapid.
- Nou: alegerea modelului — Rapid sau Calitate maximă.
- Prompt-ul rămâne editabil.

## Detalii tehnice

- `src/routes/api/bald.ts`: acceptă câmpul `model` din formular (implicit varianta
  rapidă `openai/gpt-image-2.5-flare`, opțional `...-sunburst`), păstrează
  `quality: high` și streaming-ul existent.
- `src/lib/bald.ts`: funcție nouă `startBaldLoop({ video, prompt, model, concurrency, onFrame, signal })`
  care ține 1–2 cereri în zbor, reia imediat ce una se termină, respectă
  `AbortSignal` și nu retrimite după anulare (regulile Gateway: 429/5xx cu
  backoff, restul terminale).
- `src/routes/index.tsx`: ramura de rezervă pornește bucla în loc de o singură
  transformare; două straturi `<img>` suprapuse pentru crossfade; `fallbackUrl`
  devine ultimul portret final, folosit la captură; bucla se oprește în `goAttract`,
  la timeout și la demontare.
- `src/lib/settings.ts`: câmpuri noi `fallbackRefresh` („off" | „normal" | „fast")
  și `fallbackModel`, normalizate în `sanitizeSettings`; se ridică versiunea cheii
  de stocare.
- `src/components/AdminPanel.tsx`: cele două controale noi lângă comutatorul de rezervă.
- Mașina GPU nu se atinge.

## Cost

Fiecare portret e o cerere plătită. La un portret la ~4 secunde, o sesiune de 20 s
înseamnă ~5 imagini. Merită setat intervalul „Normal" pentru eveniment și „Rapid"
doar la demonstrații.
