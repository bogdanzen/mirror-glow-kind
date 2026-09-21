# Oglinda pseudo-live la 1 FPS + furnizori AI comutabili

## Ce se schimbă pentru vizitator
Ecranul oglinzii nu mai depinde de un flux video continuu. Kioskul ia câte o imagine pe
secundă de la cameră, o trimite la furnizorul AI activ și o suprapune peste imaginea
anterioară cu o tranziție lină de 600 ms. Pare viu, dar tehnic sunt cereri simple, ieftine
și ușor de depanat. Dacă un furnizor cade, se trece automat la următorul — ecranul nu
rămâne niciodată gol și nu apare nicio eroare vizibilă.

## Furnizori (o singură interfață)
Un contract comun `FrameProvider` cu `processFrame(frame, opts) -> imagine`:

1. **runpod** (principal) — POST către `{RUNPOD_BASE_URL}/frame`, JSON cu imaginea JPEG
   512×512 în base64, prompt, prompt negativ, denoise, seed, `mask: "hair"`; antet
   `X-Mirror-Token` din setarea din panou. `GET /health` pentru butonul de test.
2. **scope/webrtc** (fostul strat „daydream") — pod-ul nostru actual rămâne funcțional,
   dar e împachetat ca furnizor: se ia câte un cadru pe secundă din video-ul procesat.
3. **fal-hair** — `fal-ai/image-apps-v2/hair-change`, prin server (secret `FAL_KEY`),
   trimitere în coadă + interogare până la rezultat.
4. **perfectcorp** — YouCam AI Hairstyle, stil „bald", prin server (secret
   `PERFECTCORP_KEY`). Folosit la fotografia premium, dar selectabil și în buclă.
5. **demo** — cadrul brut de la cameră cu efectul existent și insigna DEMO. Nu eșuează
   niciodată, mereu ultimul în lanț.

Nota tehnică: proiectul nu are Supabase activat și rulează pe TanStack Start, deci
„edge functions" devin rute de server în `src/routes/api/` (`/api/mirror-frame`),
cu aceeași regulă: cheile terților rămân doar pe server. Doar tokenul pod-ului nostru
stă în browser, pentru că protejează cutia noastră, nu o cheie terță.

## Bucla de 1 FPS
- Pornește la intrarea în ecranul oglinzii (după countdown).
- La fiecare 1000 ms: decupaj pătrat 512×512 centrat pe ovalul de încadrare, JPEG 0.8.
- O singură cerere în zbor; dacă răspunsul întârzie, cadrele se sar, nu se pun la coadă.
- Randare pe canvas fullscreen, tranziție 600 ms între rezultate; la eroare rămâne
  ultimul cadru bun.
- Seed fix și prompt identic pe toată sesiunea, pentru consistență între cadre.
- Oprire completă la finalul sesiunii sau la inactivitate.

## Lanț de rezervă
Ordine implicită: runpod → fal-hair → demo. Trecerea la următorul se face după 3 eșecuri
consecutive sau un răspuns mai lent de 3 s. Comutarea se scrie în jurnalul din panou cu
oră exactă, iar furnizorul preferat e reîncercat discret la fiecare 30 s și redevine activ
când răspunde.

## Panoul de control — secțiune nouă „Furnizori"
- Furnizor pentru buclă (listă), cu câmpurile lui: adresă, token, model, prompt, denoise,
  seed, timeout.
- Lanț de rezervă ordonabil.
- Furnizor separat pentru fotografia premium (perfectcorp | fal-hair | runpod).
- Buton „Test" pe fiecare furnizor: trimite un cadru real, arată durata, miniatura
  rezultatului și ultimele 20 de linii de jurnal (oră, furnizor, durată, eroare).

## Fotografia premium (QR)
La „Păstrează imaginea" se trimite cel mai clar dintre ultimele 3 cadre brute către
furnizorul premium, o singură cerere de calitate maximă, cu animația „Se procesează…"
(până la ~20 s), apoi rezultatul și codul QR către `/r/:id`, cu ștergere după 24 h.

## Ce rămâne neatins
Fluxul cu cele 6 ecrane, paleta și tipografia, ecranele GDPR, modul telefon, modul demo,
logo-urile și mașina GPU (nu se repornește).

## Detalii tehnice
- `src/lib/providers/` — `types.ts` (interfața), `runpod.ts`, `scope.ts`, `fal.ts`,
  `perfectcorp.ts`, `demo.ts`, `registry.ts` (lanț, numărătoare eșecuri, recuperare 30 s,
  jurnal circular de 20 de linii).
- `src/lib/frameloop.ts` — bucla de 1 FPS, captura pătrată, o cerere în zbor, canvas cu
  tranziție 600 ms, `stop()`.
- `src/routes/api/mirror-frame.ts` — rută nouă pentru fal-hair și perfectcorp; `/api/fal`
  și `/api/bald` rămân.
- `src/lib/settings.ts` — câmpuri noi (`loopProvider`, `fallbackChain`, `premiumProvider`,
  config per furnizor), sanitizare, cheie urcată la v11.
- `src/components/AdminPanel.tsx` — tab nou „Furnizori" cu testele și jurnalul.
- `src/routes/index.tsx` — ecranul oglinzii folosește bucla de cadre în locul
  compunerii actuale; captura folosește furnizorul premium.
- `PERFECTCORP_KEY` va fi cerut ca secret când ajungem la partea premium; `FAL_KEY`
  există deja.
