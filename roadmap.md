# Roadmap — Oglinda kiosk

## Open

- [ ] Live video path: the GPU host has no public IP and Scope only obtained STUN, so media may need a TURN relay. Needs either Cloudflare TURN keys (stored as secrets, passed to the pod automatically) or a TURN URL entered in admin. Blocked on the user supplying relay credentials.
- [ ] Verification of first-frame ≤5 s over 5 warm sessions must be run on the kiosk/user machine: this sandbox browser produces no ICE candidates, so WebRTC media cannot be validated here.

## Done

- [x] Single-owner warm-up coordinator (one download, one load, no storms)
- [x] Readiness gate with a real processed-frame probe before sessions
- [x] Staged diagnostics with timings (health, download, load, ICE, offer, answer, track, first frame)
- [x] Clean pod recreated on a fresh volume; model downloaded once and loaded into VRAM
- [x] Repair-model action in admin (terminates the pod, recreates clean storage)
- [x] 4K portrait presentation, 4K camera preference with fallbacks, high-quality capture upscale
- [x] Hydration mismatch and duplicate initialization fixed
- [x] Operator TURN relay settings + Cloudflare TURN passthrough to the GPU host
