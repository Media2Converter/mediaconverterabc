# Project Decisions

- Keep update confirmation at the App entry point and accepted versions in local storage, because it must precede page-specific workflows.
- Keep explicit sample repair separate from optional pre-conversion repair and propagate failures, because unchanged input must never be presented as a repaired result.
- Treat the repair input and reference sample separately; check track compatibility, then stream-copy only input video/audio packets into the reference container with reference global metadata, validating output track specs, because reference headers must not replace unrelated encoded media.
- Bound preparation and validation worker requests and terminate conversion engines after each file, because silent worker failures must not leave pending operations or idle WASM heaps.
- Use header-only FFprobe validation and serialize audio/video passes only when audio is present, because validation should not decode media and silent videos must not enter an audio mux pass.
- Track stalled conversion status and one-shot notifications using advancing progress/frame/time values; reset notifications on real progress, because repeated logs do not prove progress and silence does not prove a specific crash cause.
- Hold a best-effort Screen Wake Lock for each conversion, reacquire it when visible, and release it on every exit; never use media playback or worker pings to simulate activity, because iOS controls background suspension.
- Restart encoding only after a bounded visible inactivity period, not a short progress stall, because slow encoders may still be working without emitting progress.- Discard any idle FFmpeg engine when the site is loaded or restored from the back/forward cache, because a worker frozen while the site was closed may never respond again.
