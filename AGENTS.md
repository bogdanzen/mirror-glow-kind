<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep `/` on the promoted Figma-sized kiosk campaign with one camera stream and server-generated portraits; do not import WebRTC, RunPod, MediaPipe, or video frame loops because Android tablet stability is the priority.
- Keep the main campaign experience visually isolated through its scoped styles and theme tokens so its rose-gold treatment never changes the dashboard or supporting pages.
- Keep remote kiosk control as authenticated polling plus non-visual telemetry; never store or stream camera images from the mall.
- Keep ambient campaign video in a dedicated pointer-events-none layer that disappears for reduced-motion visitors, so decoration cannot block kiosk actions.
- Schedule ambient video with cleaned-up timers and one non-looping player; pause it outside the opening screen and hidden tabs to preserve tablet resources.
- Record final-screen donation-button taps with the existing anonymous donate_click event before opening the donation screen; this measures intent, not completed payments.

- Keep V4 FloatingLines lazily loaded after hydration in a scoped non-interactive layer, capped at 30 fps and paused in hidden tabs; this preserves SSR and tablet resources.

- Load V4 typography fonts in the V4 route head and scope its measured text settings to the campaign; this keeps the promoted main experience and admin pages unchanged.
