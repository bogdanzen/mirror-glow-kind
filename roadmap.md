# Roadmap — Oglinda kiosk

## Open

- [x] Preserve the visitor's exact camera face in delayed mode; composite SDXL pixels only over scalp/hair.
- [ ] Live video path: Cloudflare TURN is configured in the browser. GPU logs prove the camera arrives and StreamDiffusion produces frames. Krea selection previously reused StreamDiffusion; exact pipeline matching exposed the real blocker: Krea exhausts the current 24 GB RTX 4090. New Krea pods now require a 48+ GB GPU in Europe. Recreate the current pod, then run the real-device frame check.
- [ ] Verification of first-frame ≤5 s over 5 warm sessions must be run on the kiosk/user machine: this sandbox browser produces no ICE candidates, so WebRTC media cannot be validated here.

## Done

- [x] Official six-stage campaign timeline: 10-second reflection, 40-second AI portrait, choice, prevention, and final action screen
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
