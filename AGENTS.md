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

- Keep `/v2` as the tablet-safe campaign path: one camera stream and sequential server-generated portraits (one request at a time, only during the mirror window); do not import WebRTC, RunPod, MediaPipe, or video frame loops there because Android tablet stability is the priority.
- Keep `/v2` visually isolated through `.v2-*` styles and scoped theme tokens so its rose-gold campaign treatment never changes the legacy kiosk or dashboard.
