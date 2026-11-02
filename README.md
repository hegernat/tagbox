# Tagbox

Tagbox is a browser-based graffiti painting application built with TypeScript, Vite and WebGL2.

**Live application:** [tagbox.kebabstugan.com](https://tagbox.kebabstugan.com)

## Features

- Fixed 1920×1080 logical canvas with responsive display scaling.
- Freehand painting with Round, Square, Chisel and Split Chisel tips. Square, Chisel and Split Chisel support interactive rotation.
- Custom brush colors, 16 presets, a saved color palette and configurable canvas background.
- Silver Chrome, Copper Chrome and Gold Chrome with a shared procedural reflection environment. Consecutive Chrome strokes share a surface; overlapping material coverage blends their tints, while ordinary paint preserves stroke ordering.
- Adjustable Paint Load and Run Intensity, simulated paint runoff and optional velocity-based Paint Splatter. Selected landed particles can create short secondary runoff.
- Undo and clear-canvas controls, including Ctrl+Z and Cmd+Z shortcuts.
- Fullscreen / Canvas Only mode. Desktop and landscape layouts fit the whole canvas; mobile portrait layouts fill the available stage height and center the canvas, clipping its horizontal edges. No panning is provided.

## Controls and settings

- Brush Size ranges from 2 to 96 logical pixels (default 10). Stroke Smoothing ranges from 0% to 100% (default 12%), Paint Load from 0% to 100% (default 68%), and Run Intensity from 0% to 100% (default 58%).
- The rotation dial controls Square, Chisel and Split Chisel tips from 0° to 180°. Square starts at 0°; Chisel and Split Chisel start at 30°. Arrow keys adjust by 1° (Shift+Arrow by 5°); Home and End select the endpoints.
- Selecting a paint color activates Paint; selecting a Chrome material activates that material. Chrome uses its built-in material tint rather than the selected paint color.
- Brush color, selected material, saved colors, canvas background and Paint Splatter enabled state persist in the browser. Brush size, smoothing, Paint Load, Run Intensity, brush tip and tip rotation reset when the page reloads.
- Use Undo Stroke or Ctrl+Z / Cmd+Z to undo one stroke. Clear removes the current artwork. Canvas Only enters fullscreen when supported; Esc or the Studio button exits.

## Technology

- TypeScript
- Vite
- WebGL2
- GLSL shaders
- HTML and CSS

## Development

### Prerequisites

- Node.js 18 or newer
- npm
- A browser with WebGL2 support

Install dependencies and start the development server:

```sh
npm install
npm run dev
```

Vite prints the local development URL, usually `http://localhost:5173`.

To access the development server from another device on the LAN, bind Vite to all interfaces:

```sh
npm run dev -- --host 0.0.0.0
```

Open the LAN address printed by Vite from the other device. Ensure the host firewall allows the development-server port.

Create a production build with:

```sh
npm run build
```

The static production files are written to `dist/`.

## Deployment

The production image uses `deploy/Dockerfile` to serve the built `dist/` directory with Nginx, using `deploy/nginx.conf` for static-file and SPA fallback handling. Build the site before building the container image:

```sh
npm run build
docker compose build
```

The Compose service attaches to the external Docker network `kebabstugan_default`. Create that network before starting the service if it does not already exist:

```sh
docker network inspect kebabstugan_default >/dev/null 2>&1 || docker network create kebabstugan_default
docker compose up -d
```

The Cloudflare Tunnel is external to this repository and is not started or configured by Compose. Connect the tunnel to the same Docker network and route the public hostname to the Tagbox container on HTTP port 80 (for example, `http://tagbox:80`). Configure DNS and tunnel credentials in the Cloudflare Tunnel deployment, outside this project.

## Project structure

```text
.
├── CHANGELOG.md         # Release history
├── LICENSE              # MIT License
├── README.md            # Project documentation
├── deploy/
│   ├── Dockerfile       # Nginx production image
│   └── nginx.conf       # Static hosting and SPA fallback
├── src/
│   ├── brush.ts         # Brush input and stroke generation
│   ├── main.ts          # UI, pointer events and app wiring
│   ├── renderer.ts      # WebGL2 canvas and chrome compositor
│   ├── runoff.ts        # Runoff and splatter geometry
│   ├── settings.ts      # Canvas dimensions and material data types
│   ├── smoothing.ts     # Pointer smoothing and stroke interpolation
│   ├── style.css        # Application styles
│   └── version.d.ts     # TypeScript declaration for injected version
├── compose.yml          # Docker Compose service and external network
├── index.html           # Application document and UI structure
├── package.json         # Scripts, dependencies and version source
├── package-lock.json    # Locked npm dependency versions
├── tsconfig.json        # TypeScript compiler configuration
└── vite.config.ts       # Vite setup and package version injection
```

## Browser support and limitations

Tagbox requires a browser with WebGL2 enabled. Fullscreen and screen-orientation controls depend on browser and device support; the Canvas Only layout remains available when orientation locking is unavailable. Artwork is held in memory for the current page session; there is no document save, load or export feature. Portrait mobile canvas edges are clipped and cannot be reached by panning. Very large artworks retain stroke and runoff geometry for redraw and undo, so memory use and rendering cost can increase as artwork grows.

## License

Tagbox is released under the MIT License. See [LICENSE](LICENSE).
