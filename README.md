# Tagbox

Tagbox is a browser-based graffiti painting application built with
TypeScript, Vite and WebGL2. It provides a canvas-oriented workspace for
creating freehand marks and experimenting with paint behavior, including
simulated paint runoff and drips.

**Live application:** https://tagbox.kebabstugan.com

## Features

-   WebGL2-based canvas rendering
-   Freehand drawing with adjustable brush size
-   Round, square and chisel brush tips
-   Brush smoothing
-   Color selection
-   Undo and clear-canvas controls
-   Fullscreen / canvas-only mode
-   Simulated paint runoff, including individual drips and broader paint
    sheets
-   Wet and dry paint behavior controls
-   Runoff intensity controls

The application is under active development. Features and behavior may
change.

## Technology

-   TypeScript
-   Vite
-   WebGL2
-   GLSL shaders

## Development

### Requirements

-   Node.js
-   npm
-   A browser with WebGL2 support

### Install dependencies

``` bash
npm install
```

### Start the development server

``` bash
npm run dev
```

Vite prints the local development URL in the terminal. To make the
server accessible from other devices on your local network:

``` bash
npm run dev -- --host 0.0.0.0
```

### Create a production build

``` bash
npm run build
```

The production files are generated in `dist/`.

## Deployment

The production deployment uses Docker and Nginx to serve the contents of
`dist/` as a static website. The current self-hosted deployment is
connected to a Cloudflare Tunnel.

To rebuild and restart the deployment from the project directory:

``` bash
npm run build
docker compose up -d --build
```

The included Compose configuration expects an existing external Docker
network named `kebabstugan_default`. This is specific to the current
self-hosted setup and must be adjusted if deploying elsewhere.

## Project structure

``` text
tagbox/
├── deploy/          # Nginx configuration and Dockerfile
├── src/             # Application source code
├── compose.yml      # Docker deployment configuration
├── index.html
├── package.json
└── tsconfig.json
```

## Browser support

Tagbox requires WebGL2. Performance depends on the browser, GPU and the
amount of paint and runoff retained on the canvas.

## License

No license has been specified yet. Unless a license is added, all rights
are reserved by the copyright holder.
