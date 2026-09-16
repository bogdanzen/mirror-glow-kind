# Roadmap — Oglinda kiosk

## Open

- [ ] Recreate a clean RunPod pod (fresh volume) once the warm-up fix is deployed, then run the cold-start + 5 warm sessions verification (needs the user to press "Pornește GPU" / confirm credits).

## Done

- [x] Single-owner warm-up coordinator (one download, one load, no storms)
- [x] Readiness gate with real processed-frame probe before sessions
- [x] Staged WebRTC diagnostics with timings
- [x] 4K portrait presentation + camera preference
- [x] Repair-model action in admin
- [x] Fix hydration mismatch / duplicate initialization
