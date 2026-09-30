# Notes for future agents

## Project

Thermal Print is a static Svelte 5 + TypeScript + Vite PWA. GitHub Pages serves it under `/thermal-print/`. Keep `vite.config.ts` base, manifest start URL/scope, and README deployment URL aligned if the repository name changes.

## Data and rendering

- `Workspace.version` is the JSON backup schema version (currently 2). `parseWorkspace` migrates version 1 backups to version 2. Update validation and migration before changing persisted shapes.
- All label coordinates are printer dots. Width is fixed at 384 dots; height is in multiples of 8 dots (8 dots/mm). Saved templates allow 160–2400 dots; the built-in adaptive template can be shorter.
- `renderLabel` is the single rendering path for on-screen preview and print raster. Editor preview passes an expanded viewport so off-canvas elements remain visible and draggable; print calls it without that viewport. Overflow is informative and must not block printing.
- Dynamic dates use the device's local calendar date at print time. Calendar years/months clamp to month end; days are applied after.
- Quick-print shelf life is ephemeral UI state. `withExpiry` resolves positioned expiry date fields or adds a 56-dot extension to old templates. Recompute it with a fresh `Date` immediately before sending the job.
- `system-adaptive` is a built-in template ID, not an editable saved template. `adaptiveTemplate` measures text with the same Canvas wrapping used by `renderLabel`, and must be rebuilt after font loading immediately before print.
- `Workspace.history` stores at most 10 successfully sent quick-print jobs. Restoring an entry uses its actual print date as a manual date, preserving the label values even on later days. Keep history validation and backup export aligned.
- Editor preview uses the sample product name, independently of the quick-print input. Do not leak quick-print text into saved templates.
- Theme is an additive field in version 1 backups; missing theme values load as light. Version 1 backups migrate with an empty history.
- Validate imports before writing IndexedDB. Exports are user data; do not overwrite them during development.

## Printer safety and tests

- The MX10 profile writes to AE01 (or AF01 fallback) and listens on AE02 where available. It uses plain `0xA2` 48-byte raster rows, LSB-first, with blank rows for feed. Do not assume the `0xA1` feed command works on MX10.
- Keep packet pacing and per-copy reconnect behavior unless actual MX10 tests justify a change. A build/test pass is not proof of physical print quality.
- Run `npm run check`, `npm test`, and `npm run build` before publishing. Test dates at month/year boundaries, command framing, import validation, and the actual browser UI.
- Chrome/Edge Web Bluetooth requires HTTPS or localhost and a user gesture for device selection. iOS Safari does not provide it.

## Sources and licensing

See README for the printer-protocol references and their licenses. `opuu/cat-printer` is AGPL-3.0 and should remain a reference only unless the project's licensing decision changes. The project's own code is MIT.
