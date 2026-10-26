# Project Decisions

- Keep update confirmation at the App entry point and accepted versions in local storage, because it must precede page-specific workflows.
- Bound preparation and validation worker requests and terminate conversion engines after each file, because silent worker failures must not leave pending operations or idle WASM heaps.
- Use header-only FFprobe validation and serialize audio/video passes only when audio is present, because validation should not decode media and silent videos must not enter an audio mux pass.