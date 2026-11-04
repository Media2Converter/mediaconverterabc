# Roadmap

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