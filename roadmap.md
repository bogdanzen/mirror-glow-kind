# Roadmap — Oglinda kiosk

## Open
- [ ] Align V4 text with uploaded Figma specification; exact Bodoni 72 font awaits licensed webfont.

- [x] V3 review: centered opening composition, reliable camera retry, and optional subtle butterfly-loop layer ready for the supplied video.

- [x] Tablet-first main campaign: exact flow, one 1080p camera stream, sequential server-generated portraits, no WebRTC/RunPod/frame buffer.
- [x] V2 rose-gold presentation: supplied campaign logos, early AI start, streamed preview, Cinzel/Manrope typography, framed copy and scoped rose-gold QR styling.

- [x] Preserve only the visitor's eyes, nose and mouth from the camera; use the generated bald result over scalp, eyebrows and facial-hair areas.
- [ ] Live video path: Cloudflare TURN is configured in the browser. GPU logs prove the camera arrives and StreamDiffusion produces frames. Krea selection previously reused StreamDiffusion; exact pipeline matching exposed the real blocker: Krea exhausts the current 24 GB RTX 4090. New Krea pods now require a 48+ GB GPU in Europe. Recreate the current pod, then run the real-device frame check.
- [ ] Verification of first-frame ≤5 s over 5 warm sessions must be run on the kiosk/user machine: this sandbox browser produces no ICE candidates, so WebRTC media cannot be validated here.

## Done

- [x] /v4 Figma redesign: 6 screens, transparent neon butterfly (start, terms, final footer), React Bits FloatingLines (no lines on transformation), countdown numbers appearing one by one, supplied prevention icons, live campaign QR.

- [x] Ecran final aliniat referinței: cauză și obiective în stânga, QR roz în dreapta, buton Donează cu eveniment anonim donate_click.
- [x] Experiența V3 promovată pe pagina principală, ruta de previzualizare `/v3` eliminată și nota vizibilă despre portretul AI scoasă.
- [x] Secure remote kiosk control: Google administrator account, 10-second heartbeat, camera/AI/screen telemetry, command acknowledgement, forced refresh and experience reset; no image transmission or storage.
- [x] Final campaign copy aligned to one left edge and butterfly emoji removed.
- [x] Main campaign timing and navigation cleanup: 5-second bald portrait, 5-second smile portrait, accurate duration controls with −/+ buttons, opening QR and campaign credit, left-aligned donation finish, scrollable dashboard, and `/v2` removed.
- [x] Final campaign QR rendered reliably with compatible rose colors and linked directly to the official „Te vezi în oglindă” page.
- [x] Tablet-safe campaign promoted to `/`; the obsolete `/v2` alias was later removed.
- [x] V2 readability pass: Cinzel headings enlarged 20%, rose-brown shadows strengthened, white/powder-pink opening CTA, whole-word wrapping, and 20-second consent timeout.
- [x] V2 campaign polish: metrics reset on 1 Oct 2026, three-second post-consent capture delay, dedicated smiling portrait, white opening CTA, larger non-orphaned copy, and subtle brown-rose text shading.
- [x] V2 typography: all copy enlarged and highlighted, all text/countdown kept above mid-screen without overlap, and portrait prompt expanded for one person or groups.
- [x] V2 typography refinement: copy reduced by half, balanced without hyphenation/orphans, alternating rose/ivory hierarchy, and all actions kept above mid-screen.
- [x] V2 live cleanup: no face marker, generated portrait aligned to the camera with feathered outer edges, non-overlapping copy, official donation QR, and no cancer ribbon.
- [x] Control panel split into workflow tabs: General, Transformare, Bucla 1 FPS, Mesaje, GPU live, Jurnal; one sticky Save bar

- [x] Slow crossfade from the bald portrait into the choice portrait; choice copy moved clear of the face; campaign logos added to first and final screens.
- [x] Camera feed on the home screen with transparent butterfly-and-particle video; smiling AI choice portrait; countdown pre-generation and slower bald reveal
- [x] Opening countdown defaults to 5 seconds and is adjustable from 2–10 seconds in the control panel
- [x] Official six-stage campaign timeline: configurable 2–10-second reflection, 40-second AI portrait, choice, prevention, and final action screen
- [x] Full-screen camera/AI presentation, black/hot-pink language, animated line butterflies, grain, QR options, and 20-second presence confirmation
- [x] Single-owner warm-up coordinator (one download, one load, no storms)
- [x] Readiness gate with a real processed-frame probe before sessions
- [x] Staged diagnostics with timings (health, download, load, ICE, offer, answer, track, first frame)
- [x] Clean pod recreated on a fresh volume; model downloaded once and loaded into VRAM
- [x] Repair-model action in admin (terminates the pod, recreates clean storage)
- [x] 4K portrait presentation, 4K camera preference with fallbacks, high-quality capture upscale
- [x] Hydration mismatch and duplicate initialization fixed
- [x] Operator TURN relay settings + Cloudflare TURN passthrough to the GPU host
- [x] GPU machines rented in Europe, Romania first (EU-RO-1), with `RUNPOD_DATA_CENTERS` override

## Status (16 sep, repornire completă)
- Pod nou n65dpk4lvacqwf (Europa, 48+ GB, ~$2.19/h), fără auto-încărcare la boot.
- Krea încărcat în VRAM cu fp8_e4m3fn + vace_enabled=false + lighttae (fără acestea: CUDA OOM chiar pe 48 GB).
- Aplicația folosește exclusiv krea-realtime-video; oferta WebRTC returnează 200 cu răspuns SDP.
- Rămâne: verificarea primului cadru procesat pe mașina utilizatorului.

## Status anterior (după reparatie + releu)
- Pod nou EU-RO-1 (Bucuresti), RTX 4090, ~$0.74/h: descarcare + verificare + incarcare reusite intr-un singur
  owner (~13 min), model incarcat in VRAM, stare "loaded".
- Releu Cloudflare TURN: chei create + salvate (CLOUDFLARE_TURN_KEY_ID / _API_TOKEN); aplicatia emite
  credentiale de scurta durata in src/lib/turn.functions.ts si le ataseaza conexiunii din browser.
- ramas: primul cadru procesat verificat pe masina utilizatorului (5 sesiuni la rand, primul cadru <= 5s).
- [x] Dashboard /dashboard: vizitatori, scanari QR, donatii, abandonuri, agregare pe totemuri; evenimente anonime in cloud; panou reorganizat cu butoane reale
- [x] Ecran final principal: text cauză, umbre discrete și QR oficial descărcabil (2026-09-29)
