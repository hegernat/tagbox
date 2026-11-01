# Changelog

This project follows a Keep a Changelog-inspired format. Version numbers follow semantic versioning.

## [0.3.0] - 2026-11-01

### Added

- Interactive rotation dial for Square and Chisel brush tips, with an orientation-aware brush cursor preview.
- Paint Splatter checkbox, persisted across sessions and applied to newly created strokes.
- Velocity-based paint particles with stored landing positions and optional short secondary runoff from selected particles.
- Canvas Only mode and fullscreen support, with optional mobile landscape orientation locking.

### Changed

- Increased the effect of stroke smoothing across its adjustable range and ensured strokes finish at the pointer endpoint.
- Refined Wet and Dry Paint runoff so Paint Load primarily controls channel form and width, with a wet-end spawn boost; Run Intensity continues to control runoff quantity and reach.
- Refined chrome reflections and shared-surface shading, including canvas-space studio reflections and subtle merged-coverage edge lighting.
- Improved wet-paint runoff visibility with more narrow channels at high Paint Load.

### Fixed

- Ctrl+Z and Cmd+Z now invoke the same undo action as the UI control without interfering with text-entry fields.
- Fixed Vite version injection so the application header receives its version from `package.json` in development and production builds.
