# Paper fortune teller

This project is an interactive 3D paper fortune teller (cootie catcher) for the web. A visitor
chooses a colour and two numbers, the paper opens and closes while it counts, and one panel lifts
to show a fortune. The visitor can write their own labels and fortunes.

The build is static files. It needs no server and makes no request to another host at run time.

Play it at <https://ilovehhhyn.github.io/fold/>.

## Run it

Prerequisites: Node.js 24 and npm 11. Google Chrome is needed for the browser tests.

```bash
npm ci
```

```bash
npm run dev
```

Expected result: Vite prints a local address. Open it to play.

## Test and build

| Command | What it does |
| --- | --- |
| `npm run test` | Runs the unit tests for the geometry, game rules, text placement, camera and storage. |
| `npm run test:browser` | Builds the site, serves it from a nested path and plays it in Google Chrome. |
| `npm run build` | Type-checks the code and writes the static site to `dist/`. |

The browser tests write screenshots to `screenshots/`.

## Hosting

Every push to `main` runs `.github/workflows/deploy-site.yml`. The workflow runs the unit tests,
builds the site and publishes `dist/` to GitHub Pages. It does not run the browser tests. Run
those on your machine before you push.

## Embed it in another page

```ts
import { mountFortuneTeller } from "./src/index";

const toy = mountFortuneTeller(document.getElementById("toy"));
// Later, to remove it and release its WebGL resources:
toy.destroy();
```

The toy fills the width of its container, up to 36 rem. The host page must also load the
component style sheet, which the import adds through the bundler.

## Demo page parameters

`?pose=tipX,tipZ` shows one fixed pose and turns the game off, for example `?pose=0.05,0.75`.
Both numbers must be from 0 to 1. An invalid value shows an error message.

## How it is organised

| File | Responsibility |
| --- | --- |
| `src/rig.ts` | Corner positions of the paper for a pose. Pure geometry. |
| `src/game.ts` | The game rules as a state machine. Pure. |
| `src/config.ts` | The editable text and colours, and their rules. |
| `src/config-storage.ts` | Saving in the browser and sharing in the URL fragment. |
| `src/text-layout.ts` | Where text sits on a triangle and how it turns. Pure. |
| `src/camera-framing.ts` | Camera positions. Pure. |
| `src/scene.ts`, `src/paper-meshes.ts`, `src/paper-textures.ts`, `src/paper-labels.ts` | Three.js drawing. |
| `src/game-flow.ts`, `src/toy-view.ts`, `src/animation.ts`, `src/render-loop.ts` | Motion. |
| `src/controls.ts`, `src/editor.ts`, `src/pointer-input.ts` | Page elements and input. |
| `src/mount.ts` | Connects the parts. `src/index.ts` exports `mountFortuneTeller`. |

## How it was specified

`docs/agent-prompt.md` is the task description this project was built from, and
`docs/reference-poses.png` is the sketch of the four poses that came with it. The prompt calls the
sketch `fortune-teller-reference-poses.png`, which was its name before it moved into `docs/`.

## Limits

- The handwriting font (Patrick Hand, SIL Open Font License 1.1) covers Latin letters. Other
  scripts are drawn in a system font.
- The toy needs WebGL. Without it, the page shows a message.
- The paper is drawn as flat triangles without thickness. It does not simulate paper bending.
