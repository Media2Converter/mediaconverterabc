# Roadmap

## Sample-reference compatibility repair
- [ ] Select a separate input and reference sample; reject incompatible track specifications before remuxing the input.
- [ ] Test matching and mismatching reference files and verify repaired input content remains unchanged.

## Header-only sample repair
- [x] Rebuild container headers without dropping packets or rewriting timestamps; preserve original media specifications.
- [x] Validate specifications before download; 11 tests passed and browser MP4/WAV repair/download preserved packet hashes, timestamps and stream specifications. Physical iOS remains unverified.

## Sample media repair
- [x] Add Other Tools to format menus and a single audio/video sample picker with Start.
- [x] Repair using FFmpeg stream copy, with progress, cancellation, and downloadable output.
- [x] Test selection rules and stream-copy arguments; verify video/audio repair and download, with identical encoded packets. Native iOS chooser appearance requires a physical device.

## Version 1.7 sleep prevention
- [x] Keep the screen awake during conversion and reacquire protection when returning to the page.
- [x] Avoid premature restarts during slow encoding; bound core downloads and recover an unresponsive engine once.
- [x] Update to version 1.7 and verify conversion, cancellation, and wake-lock cleanup (20 tests and browser conversion/download/cancellation; physical iOS sleep prevention remains unverified).

## Version 1.63 stall notification
- [x] Show 原因不明 for an unconfirmed cause and alert once after 20 seconds with the exact status text.
- [x] Update to version 1.63 and verify timing and native alert text.

## Version 1.62 stall status
- [x] Show stalled duration each second and only the supported cause, then restore normal status on progress.
- [x] Update version to 1.62 and verify stalled/resumed/cancelled conversion.

- [x] Add the version 1.1 Safari-native update confirmation.
- [ ] Replace both Other Options pickers with checkless dropdown menus.
- [ ] Verify the confirmation and both dropdowns in the preview.

## Version 1.6 conversion reliability
- [x] Bound preparation and validation operations, and release idle conversion engines before repair.
- [x] Limit decoder/filter/encoder threading for the single-threaded WASM core.
- [x] Update to version 1.6 and test conversion, failure, and cancellation paths.