Documentație Tehnică Exhaustivă & Ghid de Predare (Handoff)

Proiect: „Oglinda” (The Mirror) — Instalație Digitală Interactivă de Prevenție a Cancerului  
Beneficiari: Asociația Vertical Freedom & Lions Club Cluj-Napoca  
Amplasament: Iulius Mall Cluj-Napoca (Chioșc vertical 75″, rezoluție 4K 2160 × 3840 px)  
Data predării: Octombrie 2026  
Stack principal: TanStack Start v1 (React 19), Vite 7, Tailwind CSS v4, Three.js (WebGL), Lovable Cloud (PostgreSQL cu Row-Level Security), Lovable AI Gateway (`openai/gpt-image-2.5-flare`).

---

1. Harta Completă a Proiectului (File Tree)

```text
/
├── .env                               # Variabile de mediu locale (Supabase, API keys)
├── AGENTS.md                          # Reguli de arhitectură ale sistemului și decizii tehnice
├── PRODUCT.md                         # Definirea produsului, ton, accesibilitate, anti-referințe
├── README.md                          # Prezentare sintetică a depozitului
├── bunfig.toml                        # Configurație runtime Bun
├── components.json                    # Configurație shadcn/ui
├── drizzle.config.ts                  # Configurație migrare Drizzle ORM
├── eslint.config.js                   # Reguli linter ESLint
├── package.json                       # Dependențe NPM și scripturi de build
├── tsconfig.json                      # Configurație compilator TypeScript
├── vite.config.ts                     # Configurare Vite 7 + TanStack Start plugin
│
├── public/
│   ├── favicon.png                    # Pictogramă browser
│   └── robots.txt                     # Directive indexare motoare de căutare
│
├── supabase/
│   ├── config.toml                    # Configurație mediu Lovable Cloud / Supabase
│   └── migrations/
│       └── 20260921154943_*.sql       # DDL inițial: mirror_events, indexuri, RLS
│
└── src/
    ├── routeTree.gen.ts               # Arborele de rute generat automat de TanStack Router
    ├── router.tsx                     # Instanțierea TanStack Router & QueryClient
    ├── server.ts                      # Handler-ul de server HTTP TanStack Start
    ├── start.ts                       # Middleware de server & client (autentificare atașată)
    ├── styles.css                     # Punctul de intrare CSS global (Tailwind v4 @theme)
    │
    ├── assets/                        # Resurse statice și descriptori JSON Lovable
    │   ├── butterflies-alpha.webm     # Video de rezervă cu canal alfa
    │   ├── lions-cluj-logo.png.*      # Logo Lions Club Cluj
    │   ├── lions-vertical-freedom.*   # Logo combinat Lions & Vertical Freedom
    │   ├── lions-white.png.*          # Logo Lions alb pentru fundaluri întunecate
    │   ├── pink-ribbon.png            # Panglica roz simbolică
    │   ├── v3-butterfly-swarm.*       # Video stol fluturi V3 (mp4 + webm)
    │   ├── v4-butterfly-neon.webm.*   # Video 4K buclă fluture neon roz decupat (alfa real)
    │   ├── v4-sunrise.png.*           # Imagine fundal răsărit V4
    │   ├── vertical-freedom-logo.*    # Logo oficial Vertical Freedom
    │   ├── vf-white.png.*             # Logo Vertical Freedom alb
    │   ├── vo-Home_screen.mp3.*       # Voce ecran 1 (attract)
    │   ├── vo-Consent.mp3.*           # Voce ecran 2 (consent)
    │   ├── vo-Countdown.mp3.*         # Voce ecran 3 (framing)
    │   ├── vo-Transformed.mp3.*       # Voce ecran 4 (mirror)
    │   ├── vo-Prevention.mp3.*        # Voce ecran 5 (choice)
    │   └── vo-Final_Screen.mp3.*      # Voce ecran 6 (final)
    │
    ├── components/                    # Componente React reutilizabile
    │   ├── AdminPanel.tsx             # Panoul de setări local (accesat prin 5 tap-uri)
    │   ├── AmbientButterflyLoop.tsx   # Generator buclă aleatoare de apariție fluturi V3
    │   ├── ButterflyVideo.tsx         # Player video suport pentru decorațiuni
    │   ├── DiagOverlay.tsx            # Suprapunere de diagnostic tehnic (FPS, latențe)
    │   ├── FloatingLines.d.ts         # Declarații TypeScript pentru FloatingLines
    │   ├── FloatingLines.jsx          # Shader WebGL Three.js cu linii sinusoide roz
    │   ├── GildedBackdrop.tsx         # Fundal auriu/ivory pentru ediții speciale
    │   ├── KioskAudio.tsx             # Motor hibrid audio: voci + Web Audio 432Hz + YouTube
    │   ├── MirrorV2.tsx               # Componentă arhivată prototip V2
    │   ├── MirrorV3.tsx               # Componentă arhivată versiune anterioară V3
    │   ├── MirrorV4.tsx               # COMPONENTA PRINCIPALĂ — Mașina de stări a campaniei
    │   ├── NeonButterfly.tsx          # Componentă video transparentă pentru fluturele V4
    │   ├── PinPad.tsx                 # Tastatură numerică tactilă pentru codul PIN admin
    │   ├── ProvidersTab.tsx           # Selector furnizori AI pentru modul diagnostic
    │   ├── QrCode.tsx                 # Generator vectorial cod QR protejat la SSR
    │   ├── v4-decor.tsx               # Elemente decorative V4 (icoane SVG, linii, fluture)
    │   └── ui/                        # Colecția de primitive shadcn/ui (radix-based)
    │
    ├── hooks/
    │   └── use-mobile.tsx             # Cârlig pentru detectarea lățimii de ecran mobil
    │
    ├── integrations/                  # Conectori Lovable Cloud & Supabase
    │   ├── lovable/index.ts           # Configurație internă a platformei
    │   └── supabase/
    │       ├── auth-attacher.ts       # Middleware client ce injectează tokenul JWT în apeluri
    │       ├── auth-middleware.ts     # Middleware server ce verifică autentificarea sesiunii
    │       ├── client.server.ts       # Client Supabase cu drepturi administrative (admin)
    │       ├── client.ts              # Client Supabase public pentru browser
    │       ├── cron-auth.ts           # Utilitare verificare apeluri cron
    │       ├── previewAuthStorage.ts  # Stocare sesiune pentru modul preview
    │       └── types.ts               # Schemele de tipuri generate din PostgreSQL
    │
    ├── lib/                           # Logică pură, algoritmi și utilitare
    │   ├── bald.ts                    # Prompt-uri AI și client de apel către /api/bald
    │   ├── cameraView.ts              # Matematică canvas, transformare, zoom, decupaj 768px
    │   ├── captures.ts                # Gestionare stocare locală temporară a imaginilor
    │   ├── delaymirror.ts             # Algoritm de buffer video întârziat
    │   ├── diag.ts                    # Măsurare FPS, latențe rețea și memorie
    │   ├── error-capture.ts           # Captare globală a excepțiilor JavaScript
    │   ├── error-page.ts              # Generator vizual al paginilor de eroare critică
    │   ├── frameloop.ts               # Controlul cadrelor video
    │   ├── headcrop.ts                # Algoritm de detecție și decupare a capului
    │   ├── kiosk.ts                   # Blocare gesturi native de browser (kiosk hardening)
    │   ├── kiosk-admin.functions.ts   # Server functions: autorizare admin și comenzi chioșc
    │   ├── kiosk-remote.ts            # Client telemetrie și recepție comenzi (polling)
    │   ├── lovable-error-reporting.ts # Raportare automată de erori către monitorizare
    │   ├── metrics.ts                 # Sistem analitic anonim pentru pâlnia de conversie
    │   ├── mirror.ts                  # Utilitare generale de oglindă
    │   ├── runpod.functions.ts        # Server functions pentru control GPU RunPod
    │   ├── scope.ts                   # Integrare Scope pipeline
    │   ├── settings.ts                # Schema de setări (v15), mesaje și încărcare localStorage
    │   ├── turn.functions.ts          # Server functions pentru generare credențiale WebRTC
    │   ├── utils.ts                   # Helper `cn()` pentru combinarea claselor Tailwind
    │   └── providers/                 # Furnizori de procesare imagine (RunPod, Fal, Demo)
    │
    ├── routes/                        # Paginile și endpoint-urile TanStack Router
    │   ├── __root.tsx                 # Layout-ul rădăcină (HTML shell, Toaster, Meta globale)
    │   ├── auth.tsx                   # Pagină autentificare admin prin Magic Link
    │   ├── bani.tsx                   # Raportul financiar și donațiile estimate
    │   ├── dashboard.tsx              # Tabloul de bord cu pâlnia de conversie
    │   ├── doneaza.tsx                # Rută de redirecționare și urmărire click donație
    │   ├── gdpr.tsx                   # Informații legale și politica de confidențialitate
    │   ├── index.tsx                  # Ruta principală `/` (randează MirrorV4)
    │   ├── r.$id.tsx                  # Pagină mobilă descărcare poză via cod QR (`/r/:id`)
    │   ├── v4.tsx                     # Rută alternativă `/v4`
    │   ├── _authenticated/
    │   │   ├── route.tsx              # Poartă de acces (Route gate) ce verifică sesiunea
    │   │   └── remote.tsx             # Panou telemetrie și telecomandă pentru chioșcuri
    │   └── api/
    │       ├── bald.ts                # Proxy serverless securizat către Lovable AI Gateway
    │       ├── fal.ts                 # Handler opțional pentru fal.ai
    │       ├── mirror-frame.ts        # Procesare streaming de cadre video
    │       └── public/
    │           └── kiosk-sync.ts      # Endpoint public securizat prin hash pentru telemetrie
    │
    └── styles/                        # Foi de stil CSS
        ├── v3.css                     # Stiluri vechi izolate pentru versiunea V3
        └── v4.css                     # Stilurile complete V4 bazate 1:1 pe specificația Figma
```

---

2. Analiza Detaliată a Fiecărui Modul & Fișier

2.1 Componenta Centrală: `src/components/MirrorV4.tsx`

`MirrorV4` conține mașina cu stări finite care ghidează vizitatorul prin întregul parcurs.

Stările Aplicației (`type Screen`):
1. `"attract"` — Ecranul de standby/atracție cu titlul mare, fluturele neon și butonul `ÎNCEPE AICI`.
2. `"consent"` — Ecranul legal de consimțământ GDPR.
3. `"framing"` — Numărătoarea inversă 5..1 cu previzualizarea camerei web.
4. `"mirror"` — Afișarea portretului transformat prin chimioterapie.
5. `"choice"` — Prezentarea celor 4 pași de prevenție („ÎNCĂ POȚI ALEGE”).
6. `"final"` — Prezentarea cauzei (50.000 €), codul QR dinamic și butonul `Donează`.
7. `"donate"` — Pagină internă de mulțumire și îndrumare către donație.

Funcțiile Cheie din `MirrorV4.tsx`:
- `attachCamera()`:
  - Solicită fluxul de la camera web via `navigator.mediaDevices.getUserMedia`.
  - Folosește `settingsRef.current.cameraDeviceId` dacă este setată o cameră anume în panoul admin; altfel folosește `{ facingMode: "user" }`.
  - Rezoluție ideală solicitată: 1920 × 1080 la 24–30 FPS.
  - Setează starea `cameraOk` la `true` sau activează indicatorul de eroare `cameraUnavailable`.
- `stopCamera()`:
  - Parcurge toate track-urile video din flux (`streamRef.current.getTracks()`), execută `.stop()` și decuplează `srcObject` de pe elementul video, eliberând resursele camerei USB.
- `startGeneration()`:
  - Lansează procesul de captare și procesare AI.
  - Alocă un `AbortController` pentru a permite anularea imediată dacă vizitatorul părăsește experiența.
  - Așteaptă 1500 ms (`window.setTimeout`) pentru ca vizitatorul să se poziționeze stabil în fața camerei.
  - Apelează `viewToFile()` pentru a crea un fișier imagine la rezoluția optimizată de 768px.
  - Declanșează două joburi paralele:
    1. Portretul zâmbitor (`smileJob`) cu `SMILE_PROMPT` — eșecul acestuia este non-fatal (`setSmileFailed(true)`), permițând camerei live să rămână activă.
    2. Portretul fără păr (`baldifyFrame`) cu `FALLBACK_PROMPT` — generează portretul principal de chimioterapie.
  - Măsoară timpul de răspuns și actualizează stările `aiLatencyMs` și `lastAiSuccessAt`.
- `cornerTap()`:
  - Detectează 5 atingeri succesive în colțul din stânga-sus în mai puțin de 2500 ms pentru a deschide panoul de administrare securizat prin PIN (`setAdmin(true)`).
- Controlul expunerii temporizate:
  - Timerul de vizualizare pe ecranul `mirror` nu pornește în timp ce imaginea se generează sau se descarcă.
  - Variabila booleană `baldReady = baldUrl && !processing && loadedBaldUrl === baldUrl` asigură că cele 5 secunde setate pentru contemplare încep doar după ce imaginea a fost decodată complet de browser.
- Auto-Reset (Watchdog de Inactivitate):
  - Orice atingere pe ecran resetează contorul `idleRef.current = Date.now()`.
  - Dacă trec 45 de secunde fără nicio acțiune în stările `consent`, `framing` sau `final`, se execută `reset()` și se revine la ecranul de pornire.

---

2.2 Motorul Audio: `src/components/KioskAudio.tsx`

Gestionează sunetul fără a încălca restricțiile de Autoplay ale browserului:

- Deblocare Inițială (`pointerdown`):
  - Ascultă primul eveniment fizic de atingere (`window.addEventListener("pointerdown", unlock, { once: true })`) pentru a aduce `AudioContext`-ul în starea `running`.
- Maparea Vocilor (`VOICE`):
  - Mapează fiecare ecran la asset-ul său vocal:
    - `attract` ➔ `vo-Home_screen.mp3`
    - `consent` ➔ `vo-Consent.mp3`
    - `framing` ➔ `vo-Countdown.mp3`
    - `mirror` ➔ `vo-Transformed.mp3`
    - `choice` ➔ `vo-Prevention.mp3`
    - `final` ➔ `vo-Final_Screen.mp3`
  - Pe ecranul `attract`, dacă nu există interacțiune, vocea este re-redată automat la fiecare 3 minute (`3 * 60 * 1000 ms`).
- Muzică de Fundal Procedurală — Funcția `startHealing(volume)`:
  - Construiește o rețea de sinteză audio Web Audio:
    - Un nod principal `master` cu volum controlabil prin `linearRampToValueAtTime`.
    - Un filtru `BiquadFilter` de tip `lowpass` calibrat la 900 Hz.
    - 5 oscilatoare sinusoidale pe frecvențele seriei armonice de 432 Hz: 108 Hz, 162 Hz, 216 Hz, 270 Hz, 324 Hz.
    - Fiecare oscilator are un LFO (oscilator de joasă frecvență între 0.03 și 0.1 Hz) care modulează ușor amplitudinea, creând o senzație organică de respirație sonoră.
    - Funcția returnează `{ setVolume, resume, stop }`.
- Muzică de Fundal YouTube:
  - Dacă utilizatorul alege modul `youtube` în panoul de admin, componenta randează un `<iframe>` invizibil către `https://www.youtube-nocookie.com/embed/videoseries?list={PLAYLIST_ID}` cu `enablejsapi=1&autoplay=1&controls=0`.
  - La schimbarea volumului sau la pornire, trimite mesaje JSON prin `postMessage` (`setVolume`, `unMute`, `playVideo`).
- Mute la Administrare:
  - Când prop-ul `muted` este `true` (adică atunci când panoul de admin este deschis), toate sunetele sunt reduse instantaneu la 0 pentru a permite echipei tehnice să configureze liniștită chioșcul.

---

2.3 Procesarea Grafică: `src/components/FloatingLines.jsx` & `v4-decor.tsx`

- Shader GLSL (`FloatingLines.jsx`):
  - Compilat cu biblioteca Three.js.
  - Folosește un `OrthographicCamera` și o geometrie plană ce acoperă întregul ecran.
  - Shader-ul de fragmente calculează unde continue cu gradient fin între culorile `--v4-lines-start`, `--v4-lines-mid`, `--v4-lines-end`.
  - Transparență: Se folosește `fragColor = vec4(ink, coverage)` unde `coverage` este calculat prin funcții gaussiene pe distanța de la centrul fiecărei linii. Astfel, fundalul canvas-ului rămâne 100% transparent și permite vizualizarea camerei video.
  - Controlul Performanței: Randarea este limitată la 30 FPS (`delta < 0.033 s`), iar bucla este decuplată atunci când tab-ul devine inactiv (`document.hidden`).
- Fluturele Neon (`NeonButterfly.tsx`):
  - Randează fișierul WebM `v4-butterfly-neon.webm` codat nativ în profil `yuva420p` (cu canal de transparență alfa real, fără fundal negru).
  - Include ascultător pentru `prefers-reduced-motion` — dacă vizitatorul are activată opțiunea de reducere a mișcării în sistemul de operare, videoul este înlocuit cu o stare statică neutră.
- Pictogramele de Prevenție (`PreventionIcon` în `v4-decor.tsx`):
  - Conține path-urile SVG vectoriale extrase direct din fișierele Figma originale ale campaniei:
    - `heart` (Inimă cu contur continuu): Fă-ți controalele.
    - `lotus` (Floare de lotus geometrică): Ascultă-ți corpul.
    - `search` (Lupă minimalistă): Nu ignora semnele.
    - `shield` (Scut cu bifă): Alege prevenția.

---

2.4 Generarea Codului QR: `src/components/QrCode.tsx`

- Randează codul QR dinamic pe un element `<canvas>`.
- Protecție SSR: Folosește import dinamic `import("qrcode")` în cadrul unui hook `useEffect`. În faza de prerandare pe server, randează un div de placeholder pentru a preveni căderea serverului pe referințe nule de `canvas`.
- Parametri de desenare: `margin: 1`, `errorCorrectionLevel: "M"`, culoare primară berry `#c73f69` pe fundal alb pur `#ffffff`.

---

2.5 Transformarea Camerei: `src/lib/cameraView.ts`

- `cameraStyle(settings)`:
  - Calculează matricea de stil CSS aplicată pe feed-ul video:
    - Rotație (`rotate(${settings.camRotation}deg)`)
    - Zoom (`scale(${settings.camZoom})`)
    - Deplasare (`translate(${settings.camOffsetX}%, ${settings.camOffsetY}%)`)
    - Oglindire (`scaleX(-1)`)
- `viewToFile(video, settings, viewWidth, viewHeight, maxEdge)`:
  - Desenează un frame din elementul `<video>` într-un canvas ascuns de memorie.
  - Aplică matematic decupajul și rotația astfel încât imaginea extrasă să corespundă milimetric cu ceea ce vede vizitatorul pe ecran.
  - Redimensionează imaginea astfel încât latura maximă să fie `768px` (rezoluție optimă pentru ca AI-ul să proceseze imaginea în sub 2 secunde fără degradare calitativă).
  - Convertește canvasul într-un obiect binar `File` numit `image.png`.

---

2.6 Serverless Backend & AI Gateway: `src/routes/api/bald.ts`

- Traseul cererii de transformare:
  1. Clientul (`baldifyFrame` în `src/lib/bald.ts`) trimite un `POST` cu `multipart/form-data` conținând fișierul `image` și `prompt`.
  2. Handlerul server din `src/routes/api/bald.ts` interceptează cererea, adaugă cheia de autorizare `process.env["LOVABLE_API_KEY"]` în antet și redirecționează apelul către gateway-ul `https://ai.gateway.lovable.dev/v1/images/edits`.
  3. Parametri forțați: `model: "openai/gpt-image-2.5-flare"`, `quality: "medium"`, `size: "auto"`.
  4. Răspunsul este returnat ca streaming de evenimente SSE (`text/event-stream`), permițând recepția rapidă a imaginilor parțiale.
  5. Politica RAM-Only: Nicio imagine nu este scrisă în directorul `/tmp`, pe disc sau în tabele de stocare S3/Supabase Storage.

---

2.7 Sincronizarea și Controlul Kiosk-ului: `src/routes/api/public/kiosk-sync.ts` & `src/lib/kiosk-remote.ts`

Permite monitorizarea și intervenția tehnică de la distanță:

- Autentificarea Dispozitivului:
  - Tableta generează la prima rulare un token aleator de 80 caractere salvat în `localStorage` sub cheia `mirror.remote.token.v1`.
  - La fiecare raportare (la fiecare 10 secunde), tableta trimite tokenul.
  - Serverul calculează `SHA-256(token)` și îl compară cu `token_hash` salvat în tabela `kiosk_status` folosind `crypto.timingSafeEqual`.
- Date transmise de chioșc (Telemetrie):
  - `kioskName`: Numele alocat (ex: „Kiosk Iulius Mall”).
  - `currentScreen`: Ecranul activ în acel moment.
  - `cameraOk`: Boolean ce confirmă dacă fluxul camerei web funcționează.
  - `aiOk`: Boolean ce confirmă disponibilitatea modelului de generare.
  - `aiLatencyMs`: Latența în milisecunde a ultimei transformări faciale.
  - `viewport`: String diagnostic (ex: `1080x1920@2|screen 1080x1920|fullscreen`).
- Coada de Comenzi (`kiosk_commands`):
  - Dacă un administrator trimite o comandă din panoul `/_authenticated/remote`, serverul include comanda în corpul răspunsului JSON la următorul heartbeat.
  - Comenzi suportate:
    - `"refresh"` ➔ Execută `window.location.reload()`.
    - `"reset_experience"` ➔ Execută `window.location.assign("/")`.
    - `"test_ai"` ➔ Execută o cerere sintetică pentru a verifica conexiunea către gateway.
  - Tableta trimite imediat un `PATCH` de confirmare cu `commandId` și `result`, marcând comanda ca executată.

---

2.8 Sistemul de Setări: `src/lib/settings.ts` & `AdminPanel.tsx`

Setările sunt persistate în `localStorage` sub cheia `mirror.settings.v15`.

Structura Setărilor (`MirrorSettings`):
| Câmp | Tip | Implicit | Descriere |
|---|---|---|---|
| `cameraDeviceId` | `string` | `""` | ID-ul hardware al camerei USB selectate |
| `camRotation` | `number` | `0` | Rotație imagine cameră (0, 90, 180, 270 grade) |
| `camZoom` | `number` | `1` | Nivel de zoom digital optic (1.0 – 2.5) |
| `camOffsetX` / `Y` | `number` | `0` | Ajustare poziție cadru pe orizontală / verticală |
| `camMirror` | `boolean` | `true` | Oglindire flux video orizontal |
| `framingSeconds` | `number` | `5` | Durata numărătorii inverse |
| `mirrorSeconds` | `number` | `5` | Durata de afișare a portretului transformat |
| `captureSeconds` | `number` | `5` | Durata afișării ecranului de prevenție |
| `thanksSeconds` | `number` | `20` | Durata afișării ecranului final cu QR |
| `idleTimeoutSeconds` | `number` | `45` | Secunde de inactivitate până la reset automat |
| `voiceoverEnabled` | `boolean` | `true` | Comutator global pentru mesajele vocale |
| `musicMode` | `"off" \| "healing" \| "youtube"` | `"healing"` | Modul muzicii de fundal |
| `musicVolume` | `number` | `25` | Volumul muzicii de fundal (0–100%) |
| `youtubeUrl` | `string` | (link playlist) | URL-ul playlist-ului YouTube asociat |
| `pin` | `string` | `"0000"` | Codul PIN pentru accesul în panou |
| `messages` | `MirrorMessages` | (vezi DEFAULT_MESSAGES) | Toate textele afișate în UI |

---

3. Schema Bazei de Date (Lovable Cloud / PostgreSQL)

3.1 Tabela `public.mirror_events` (Analitice Anonime)
```sql
CREATE TABLE public.mirror_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  session_id text NOT NULL,
  event text NOT NULL,
  device text NOT NULL DEFAULT 'kiosk',
  kiosk text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);
```
- Indexuri: `created_at DESC`, `event`, `session_id`.
- Politici RLS:
  - `INSERT`: Permis pentru rolurile `anon` și `authenticated` (oricine poate loga evenimente anonime).
  - `SELECT`: Permis pentru `anon` și `authenticated` (folosit pentru agregarea graficelor din dashboard).

3.2 Tabela `public.kiosk_status` (Stare Dispozitive)
```sql
CREATE TABLE public.kiosk_status (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kiosk_name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  current_screen text,
  camera_ok boolean DEFAULT false,
  ai_ok boolean DEFAULT false,
  ai_latency_ms integer,
  last_seen timestamptz,
  last_ai_success_at timestamptz,
  last_error text,
  app_version text,
  user_agent text,
  viewport text,
  session_active boolean DEFAULT false,
  updated_at timestamptz DEFAULT now()
);
```
- Politici RLS: Accesul direct este restricționat la nivel de API prin funcții de server ce utilizează `supabaseAdmin` sau verifică rolul de `admin` prin funcția `has_role(auth.uid(), 'admin')`.

3.3 Tabela `public.kiosk_commands` (Coadă Comenzi la Distanță)
```sql
CREATE TABLE public.kiosk_commands (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kiosk_id uuid REFERENCES public.kiosk_status(id) ON DELETE CASCADE,
  command text NOT NULL,
  created_at timestamptz DEFAULT now(),
  created_by uuid,
  delivered_at timestamptz,
  acknowledged_at timestamptz,
  result text
);
```

3.4 Tabela `public.user_roles` (Securitate Administratori)
```sql
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
```
- Funcție de securitate:
  ```sql
  CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
    );
  $$;
  ```

---

4. Design System & Tipografie (`src/styles/v4.css`)

Stilizarea V4 implementează fidel specificația tehnică de 108 noduri extrasă din Figma.

4.1 Unitatea Relativă și Scalarea Matematică
Baza de calcul este canvasul de 2160 × 3840 px:
```css
:root {
  --v4-text-unit: calc(100vw / 2160);
}
```
Orice dimensiune din specificație se traduce direct: un text de 400px devine `calc(400 * var(--v4-text-unit))`. Pe ecranul de 2160px lățime, `1 * var(--v4-text-unit) = 1px`. Pe un ecran de laptop de 1080px lățime, devine exact `0.5px`, păstrând proporțiile perfect.

4.2 Fonturi Utilizate:
- `--v4-font-display`: `"Bodoni Moda", "Bodoni 72", serif` (utilizat pentru titlul principal „TE VEZI?”).
- `--v4-font-copy`: `"Tinos", serif` (utilizat pentru textele secundare, explicații și subtitluri).
- `--v4-font-action`: `"Afacad", sans-serif` (utilizat pentru butoane mari de acțiune și pastile).
- `--v4-font-count`: `"Bebas Neue", sans-serif` (utilizat pentru cifrele numărătorii inverse 5..1).
- `--v4-font-terms`: `"Roboto Condensed", sans-serif` (utilizat pentru ecranul de termeni și condiții).

4.3 Paleta de Culori Oficială:
- Fundal cald degradat: de la `#FFF8EF` (Ivory luminos) la `#F6D5CB` (Blush cald).
- Berry primar: `#C73F69` / `#B72E5C` (folosit pentru butoane, QR și accente).
- Burgundy profund: `#782540` / `#6B2138` (folosit pentru titluri display).
- Text Charcoal cald: `#453C35` / `#5A4E46` (folosit pentru lizibilitate maximă a textului curent).
- Contur ecran Kiosk: `#736657` (linie perimetrală de 8px cu rază de 64px).

---

5. Ghid de Mentenanță & Proceduri Operaționale

5.1 Procedura de Pornire pe Tabletă (Zi de zi)
1. Porniți tableta Android și asigurați-vă că Wi-Fi-ul este conectat.
2. Deschideți Fully Kiosk Browser (sau Google Chrome).
3. Adresa configurată: `https://mirror.verticalfreedom.org`.
4. La încărcare, atingeți ecranul o dată pentru a autoriza sistemul audio al browserului.
5. Aplicația intră automat în starea de veghe `attract`.

5.2 Calibrarea Camerei la Fața Locului
1. Bateți de 5 ori rapid în colțul stânga-sus al ecranului.
2. Introduceți PIN-ul: `0000`.
3. Selectați camera corectă din lista derulantă dacă există mai multe camere conectate.
4. Ajustați glisoarele:
   - Poziție verticală: Urcați/coborâți cadrul astfel încât capul persoanei să fie în treimea superioară.
   - Zoom: Măriți dacă persoana stă prea departe de ecran.
   - Oglindire: Activați `Oglindește camera` dacă mișcările mâinii sunt inversate.
5. Apăsați `Închide panoul`.

5.3 Diagnostic & Rezolvarea Problemelor Rapide (Troubleshooting)

| Problemă | Cauză probabilă | Soluție |
|---|---|---|
| Camera este neagră | Permisiune refuzată sau cameră USB deconectată | Verificați cablul USB OTG. Reîncărcați pagina și apăsați „Permite” la accesul camerei. În admin, verificați lista de dispozitive. |
| Portretul AI întârzie sau dă eroare | Conexiune internet slabă la mall | Verificați conexiunea Wi-Fi/4G. Deschideți panoul admin și apăsați butonul de test AI. Verificați dacă la `/_authenticated/remote` apare `aiOk: false`. |
| Nu se aude sunetul / vocea | Lipsă interacțiune inițială a utilizatorului | Atingeți ecranul o dată pentru a debloca Web Audio API. Verificați volumul fizic al tabletei să fie la 80–100%. |
| Ecranul s-a blocat într-un pas | Conexiunea AI a eșuat la portretul secundar | Sistemul are un watchdog intern de 45 secunde care forțează revenirea automată la ecranul de start. De la distanță, administratorul poate trimite comanda `reset_experience` sau `refresh`. |

---

Toate fișierele și componentele sunt organizate curat, fără dependențe ascunse, pregătite pentru preluare și exploatare pe termen lung.
