# Changelog

This project follows a Keep a Changelog-inspired format. Version numbers follow semantic versioning.

## [0.8.1] - 2026-11-07

### Added

- Added a GitHub source code link at the bottom of the Help guide.

### Changed

- Set the default angle for Chisel and Split Chisel tips to 140°.

## [0.8.0] - 2026-11-06

### Added

- Added selectable Solid, Concrete and Steel Gate canvas surfaces with separate background, paint and physical-detail layers.
- Added surface-aware runoff obstacles that stop paint at physical joints and gate thresholds.
- Added timestamped PNG export filenames in local time.

### Changed

- Surface changes now clear paint, runoff, splatter and undo history while preserving brush and material settings.
- Replaced procedural surface artwork with darker photographic concrete and a painted steel double gate.
- Refined Steel Gate foreground compositing with pixel-level alpha masks for naturally edged physical details.

## [0.7.0] - 2026-11-05

### Added

- Made the shared environment-map chrome rendering permanent for Silver, Copper and Gold Chrome at 100% reflection intensity.

### Changed

- Reduced the maximum brush size from 96 px to 50 px.

### Removed

- Removed the experimental 3D Chrome toggle and reflection-intensity controls.

## [0.6.0] - 2026-11-04

### Added

- Incremental rendering of new paint segments to avoid unnecessary full redraws.

### Changed

- Optimized runoff geometry generation with reusable buffers and component-based caching.
- Batched adjacent drop channels to reduce draw calls.

### Fixed

- Prevented new runoff effects from spawning when run intensity is set to zero.

## [0.5.0] - 2026-11-03

### Added

- Stationary two-finger undo and three-finger canvas-clear gestures on touchscreens, with movement cancelling the gesture.
- Help button and compact quick guide covering drawing, gestures and other controls.

### Changed

- Extended brush-tip rotation to the full 0°–360° range with continuous dial movement.
- Made the Split Chisel tip slightly thinner while preserving its segment gap and aligning rendered geometry, preview and runoff sampling.
- Set default stroke smoothing to 50% without overriding saved user preferences.
- Simplified the interface by removing decorative top-bar and tools-panel labels, the white T mark and the center document-status text.

## [0.4.0] - 2026-11-02

### Added

- Split Chisel brush tip with a transverse gap, shared rotation control and runoff sampling from its two separate segments.
- Gold Chrome material, joining Silver and Copper Chrome in the shared reflection compositor.
- Mobile portrait canvas scaling that fills the available canvas-stage height and centers the wider canvas with clipped horizontal edges.

### Changed

- Chrome strokes now share a continuous surface across consecutive material changes, with coverage-weighted material tint blending and runoff included in the same surface.
- Balanced Chrome reflections with brighter shadow regions, smoother broad transitions and distinct studio highlights.
- Made color and Chrome material active selections mutually exclusive.
- Removed the instructional/status overlay from the bottom of the canvas.

## [0.3.0] - 2026-11-01

### Added

- Interactive rotation dial for Square and Chisel brush tips, with an orientation-aware brush cursor preview.
- Paint Splatter checkbox, persisted across sessions and applied to newly created strokes.
- Velocity-based paint particles with stored landing positions and optional short secondary runoff from selected particles.
- Fullscreen mode, with optional mobile landscape orientation locking.

### Changed

- Increased the effect of stroke smoothing across its adjustable range and ensured strokes finish at the pointer endpoint.
- Refined Wet and Dry Paint runoff so Paint Load primarily controls channel form and width, with a wet-end spawn boost; Run Intensity continues to control runoff quantity and reach.
- Refined chrome reflections and shared-surface shading, including canvas-space studio reflections and subtle merged-coverage edge lighting.
- Improved wet-paint runoff visibility with more narrow channels at high Paint Load.

### Fixed

- Ctrl+Z and Cmd+Z now invoke the same undo action as the UI control without interfering with text-entry fields.
- Fixed Vite version injection so the application header receives its version from `package.json` in development and production builds.
