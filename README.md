# Tagbox

Tagbox is a browser-based graffiti painting application built with TypeScript, Vite and WebGL2.

**Live application:** [tagbox.kebabstugan.com](https://tagbox.kebabstugan.com)

## Features

- Fixed 1920×1080 logical canvas with responsive display scaling.
- Freehand painting with adjustable brush size.
- Round, Square and Chisel brush tips, with interactive rotation for Square and Chisel.
- Adjustable stroke smoothing.
- Custom brush colors, 16 color presets and a saved color palette.
- Configurable canvas background.
- Silver Chrome and Copper Chrome materials with procedural metallic reflections and shared chrome-surface compositing.
- Wet and Dry Paint behavior, adjustable runoff intensity and simulated paint drips.
- Velocity-based paint splatter with an enable/disable setting; selected landed particles can create short secondary runoff.
- Undo and clear-canvas controls, including Ctrl+Z and Cmd+Z shortcuts.
- Fullscreen / Canvas Only mode, with mobile landscape orientation support where the browser allows it.

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

Tagbox requires a browser with WebGL2 enabled. Fullscreen and screen-orientation controls depend on browser and device support; the Canvas Only layout remains available when orientation locking is not. Very large artworks retain stroke and runoff geometry for redraw and undo, so memory use and rendering cost can increase as artwork grows.

## License

Tagbox is released under the MIT License. See [LICENSE](LICENSE).
