# Make the RunPod mirror production-ready

## Confirmed diagnosis

The current pod will not recover by waiting longer:

- Scope starts `krea-realtime-video`, while the kiosk default is `streamdiffusionv2`; the active pipeline is inconsistent.
- Five model downloads begin concurrently into the same persistent model directory.
- Scope tries to load the model before those downloads finish.
- The resulting model file is corrupt: `incomplete metadata, file not fully covered`.
- The app and Scope then repeatedly submit load requests, leaving the screen on “preparing” indefinitely.
- TURN credential retrieval also failed during startup; this must be rechecked after model recovery because it can block video even when inference is healthy.

## Implementation plan

### 1. Stop the failure loop and rebuild cleanly

- The unhealthy pod is already stopped; confirm it stays stopped so it consumes no credits.
- Standardize the entire system on one proven pipeline: `streamdiffusionv2` for the live bald-head transformation.
- Remove the corrupted persistent model data by replacing the failed pod/volume once the concurrency fix is ready.
- Create one clean RunPod instance with the saved Hugging Face token and the selected pipeline.

### 2. Make warm-up single-owner and deterministic

- Replace the current overlapping browser-driven warm-up calls with one idempotent warm-up coordinator.
- Allow only one download or load operation at a time; all kiosk screens and admin actions observe the same operation instead of starting another one.
- Separate warm-up into explicit stages: pod starting, Scope reachable, model downloading, files verified, pipeline loading, pipeline resident, ready.
- Never call pipeline load until model status confirms a complete download.
- Treat model corruption and pipeline `error` as terminal states, not states to retry every few milliseconds.
- Keep the successfully loaded pipeline resident, check it periodically, and re-warm once if it is genuinely unloaded.
- Preserve valid model files across normal pod restarts so subsequent starts do not download them again.

### 3. Gate visitor sessions on real readiness

- Pre-warm before visitors can enter the camera flow.
- Expose a clear `READY` state only after Scope reports the pipeline loaded in GPU memory and a short synthetic WebRTC probe returns a real processed frame.
- When ready, a visitor session skips all model work and performs only WebRTC negotiation plus prompt/session setup.
- If readiness is lost, return to warm-up outside the visitor flow; never leave a visitor staring at an endless “preparing” screen.
- Keep the bald simulation removed: success means a real processed GPU frame.

### 4. Harden the live WebRTC path

- Validate TURN credentials, ICE gathering, offer/answer, candidate exchange, inbound video track, track unmute, and first decoded frame as separate timed stages.
- Retry only transient network negotiation once; never retry model loading concurrently.
- Close every peer connection and media track on exit, timeout, or failure.
- Record stage timings and the exact failed stage in diagnostics and the local session log.

### 5. Meet the portrait 4K requirement honestly

- Run the kiosk itself at 2160×3840 and validate the full composition at that viewport.
- Request the best stable camera input available, preferring 3840×2160 and falling back to 1920×1080 on the Android kiosk.
- Process with Scope at its supported real-time pipeline resolution, then render and capture it in the 4K portrait composition without stretching or changing aspect ratio.
- Apply high-quality browser upscaling for display/capture. Do not claim the AI inference is native 4K: Scope’s real-time pipelines currently produce roughly 512px-class frames. Native 4K diffusion within five seconds is not a realistic acceptance target on this stack; 4K kiosk presentation is.

### 6. Make diagnostics operational

- Show one authoritative readiness panel: pod, Scope, download, pipeline, TURN, WebRTC, first frame, and measured startup latency.
- Add a controlled “repair model” action that stops the pipeline, clears only invalid model data, downloads once, verifies, and loads once.
- Prevent the current client-side settings mismatch that causes hydration errors and can trigger duplicate initialization.
- Make admin tests use the same readiness gate and live-session path as visitors.

### 7. Verify on the actual workflow

- Run a cold-start test from a clean model volume and retain the complete RunPod log.
- Run a normal pod restart and prove that the model is reused without downloading again.
- Run at least five consecutive warm kiosk sessions through consent, framing, processed mirror, capture, and return to attract.
- Test at 2160×3840 and a phone viewport, with diagnostics recording every threshold below.

## Acceptance criteria

### Cold warm-up

- Exactly one model download and one pipeline load occur; no concurrent duplicate downloads or load storms appear in RunPod logs.
- Download progress advances to completion, the model files validate, and pipeline status becomes `loaded`.
- A normal pod restart reuses the persistent model and does not download it again.
- The UI never reports `READY` before a processed probe frame is decoded.

### Warm session performance

- From entering the mirror screen to the first visible AI-processed frame: **5.0 seconds or less**, for five consecutive sessions after readiness.
- Live glass-to-glass video delay after connection: target **1 second**, maximum **1.5 seconds** under the event network.
- No session starts a model download or pipeline load when readiness is green.
- No blank video, raw-camera substitution, bald simulation, or endless preparing state.

### Visual result

- The real GPU output visibly shows the same person with a photorealistic bald/shaved scalp.
- Facial identity, expression, skin tone, clothing, camera angle, and background remain recognizably stable.
- Prompt changes affect the transformation without requiring a model reload.
- The square AI result is centered and undistorted within the 2160×3840 gala presentation.

### Reliability and recovery

- TURN credentials are available and ICE reaches `connected` or `completed` on the kiosk network.
- Every failure ends with a named stage and actionable error within 30 seconds; no infinite spinner.
- Five consecutive full flows complete without reconnecting or rewarming the model.
- Leaving a session releases camera, video, and GPU-session resources.

### Resolution

- The Chrome kiosk renders at **2160×3840 portrait**.
- Camera capture prefers **3840×2160**, with a measured fallback shown in diagnostics.
- The processed Scope stream is displayed with high-quality scaling and no stretching; diagnostics disclose its actual decoded dimensions and FPS.
