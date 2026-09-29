# The Gentle Mirror

Build "The Mirror" — a cancer-awareness interactive kiosk web app for a 75" vertical 

4K touchscreen (2160×3840 portrait, 9:16) running Chrome on Android 14 in a shopping 

mall. It also runs on phones via QR code. The app shows the visitor a LIVE AI-filtered 

version of themselves: same face, photorealistic shaved head (chemotherapy patient look). 

The AI processing happens in the cloud (Daydream Cloud API or self-hosted Scope on 

RunPod) — the app only handles camera capture, WebRTC streaming, and UI.

## Tech stack & constraints

- React + Vite + Tailwind. Single-page app, lightweight: target device has 4GB RAM. 

  No heavy libraries. Use native APIs where possible.

- Camera: getUserMedia with device selection (external USB 4K webcam). Prefer 1080p.

- Streaming: WHIP protocol to publish camera, WHEP to play the processed stream. 

  Use a small WHIP/WHEP client implementation (no big SDK).

- QR codes: tiny qrcode library.

- Supabase (optional, toggleable): only for temporary captured images (24h TTL).

- Wake Lock API + Fullscreen API. Disable scroll, zoom, overscroll, context menu, 

  text selection. Lock orientation portrait.

## Screen flow (kiosk mode)

1. ATTRACT (idle): slow ambient animation, dark background, large centered line 

   "Privește-te în oglindă." + pulsing CTA "Atinge ecranul pentru a începe". 

   Small QR bottom-right labeled "Încearcă și de pe telefonul tău" linking to the 

   public URL of this app. Small placeholder for campaign line: [LINIA DE CAMPANIE].

2. CONSENT (GDPR): title "Înainte de a începe", short plain text: the image is 

   processed live in the cloud, NOTHING is stored, nothing identifies you, you can 

   walk away anytime. Explicit checkbox "Am citit și sunt de acord." + big button 

   "Continuă". Link to full privacy notice (static page). No consent = return to attract.

3. FRAMING: live camera preview with an elegant oval face-guide overlay, text 

   "Stai în fața ecranului, la un pas distanță." Auto-detect a face is centered 

   (simple brightness/motion heuristic is fine) → 3-2-1 countdown.

4. LIVE MIRROR: the processed WebRTC stream fills the screen — this is the moment. 

   Minimal UI: just the campaign line small at the bottom. Duration 20 seconds, 

   then subtle transition.

5. CAPTURE & QR: freeze one frame from the processed stream, offer "Păstrează 

   imaginea" → generates QR linking to a public result page (/r/:id) where the 

   person can download it. If Supabase storage is disabled, skip capture and go 

   to step 6. Auto-advance after 30s.

6. THANK YOU: "Mulțumim." + campaign line + info placeholder about screening. 

   Auto-return to ATTRACT after 15s.

Any inactivity >45s at any step = auto-return to ATTRACT.

## Backend contract (make it configurable, never hardcoded)

Settings stored in localStorage, editable in a hidden admin panel:

- BACKEND_BASE_URL, API_KEY, PIPELINE_ID, PROMPT (default: "photorealistic portrait 

  of the same person with a completely shaved head, chemotherapy patient, natural 

  skin, identical face, same lighting, same background"), resolution (512×512 

  default), target FPS.

- Expected API: POST {BACKEND_BASE_URL}/v1/streams {pipeline, params} → returns 

  {stream_id, whip_url, whep_url}. Publish camera to whip_url, play whep_url. 

  DELETE /v1/streams/{id} to stop. Compatible with Daydream Cloud API and 

  self-hosted github.com/daydreamlive/scope.

## DEMO MODE (critical — must work with zero backend)

If no BACKEND_BASE_URL is set, or connection fails, or user toggles "Demo" in admin:

run the FULL flow end-to-end but replace the AI stream with the raw camera feed plus 

a subtle CSS/canvas placeholder effect and a small "DEMO" badge. Demo mode must be 

indistinguishable in UX flow — same screens, same timings. This is for pitching the 

client before the GPU backend is live.

## Hidden admin panel

5 rapid taps on top-left corner → PIN (default 0000, changeable) → settings: backend 

config, camera device picker, stream resolution/FPS, session durations, PIN change, 

"Test connection" button (shows latency + stream health), today's session counter 

(stored locally), demo mode toggle, restart app button.

## Design system

Portrait 2160×3840. Background near-black #141210, text warm off-white #F2EBDD, 

single accent coral #FF5440. Font: Varela Round everywhere (Google Fonts). Huge, 

calm typography — the screen is 75", text must be readable from 3m. Generous negative 

space, thin 1px hairlines (#3B342A), no cards, no rounded buttons — buttons are 

full-width underline style or large type. Animations slow and quiet (600ms+ fades). 

Clinical, warm, elegant — this is a cancer-awareness installation, not a tech demo.

## Phone flow

The same app responsive on phones (opened via QR): front camera, same consent, 

same flow, result page with download button.

## GDPR rules (hard requirements)

- Nothing is ever stored server-side except an explicit capture with consent, which 

  auto-deletes after 24h (Supabase lifecycle rule or edge function).

- No analytics that identify persons. Only an anonymous session counter.

- Privacy notice page at /gdpr in Romanian, plain language, naming the cloud 

  processor and stating RAM-only processing.

## Definition of done for v1

Full flow works end-to-end in demo mode in Chrome; kiosk hardening (fullscreen, 

wake lock, no zoom) active; admin panel functional; QR pages work; design matches 

the system above; performs smoothly on a 4GB Android device.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://mirror-glow-kind.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f363ab5b-d367-46a2-b429-68c0c7e4eb50).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
