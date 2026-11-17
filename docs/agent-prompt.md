# Build an interactive paper fortune teller for the web

You are building a small interactive 3D toy for a website. The toy is a paper fortune teller, also called a cootie catcher. The player clicks the paper. It opens and closes while it counts. At the end one panel lifts and shows a hidden fortune. The player can also write their own text on every panel.

Read this whole document before you write code. The folding geometry is the hard part of this task, so it is given to you as tested reference code in the section "Reference geometry". Use that code. Do not invent your own folding math, and do not use a physics or cloth simulation.

## Project context

These three lines are set by the person who sent this prompt.

- Where it runs: a standalone static page that must also work when it is embedded in another page.
- Hosting: any static file host. There is no server and no database.
- Existing code: none. Create a new project in the current directory.

## What the real toy is

A fortune teller is a square of paper, folded so that it has four finger pockets on the outside and eight small triangles on the inside. The player puts two fingers and two thumbs into the pockets and looks down into the paper from above. Moving the fingers opens the paper like a mouth. The mouth opens in two directions. Each direction shows four of the eight inside triangles and hides the other four. A fortune is written under each inside triangle.

This document uses the following terms. Use the same words in code, tests and text.

| Term | Meaning |
| --- | --- |
| centre | The middle of the folded square. It is the lowest point, at the bottom of the mouth. |
| tip | One of the four corners of the folded square. The tips point up, toward the player. All four tips meet when the toy is closed. |
| mid | The midpoint of one side of the folded square. There are four: north, east, south and west. |
| number triangle | One of the eight triangles inside the mouth. Its corners are the centre, one mid and one tip. It carries a label, by default a number from 1 to 8. |
| flap | The two number triangles that share one mid: the north, east, south and west flaps. |
| pocket | One of the four outside pieces that a finger goes into. It has a colour and a label. It is drawn as two triangles. |
| pocket corner | The outer corner of a pocket. |
| fortune triangle | The hidden triangle directly under a number triangle. It carries the fortune text. |
| tip offsets | Two numbers, `tipX` and `tipZ`, each from 0 to 1. Together they describe the whole pose of the paper. |

Axes: x points east (right on screen), y points up (toward the camera), z points south (down on screen). The camera looks down into the mouth with north at the top of the screen.

The number triangles are numbered 1 to 8 clockwise, seen from above, starting at north:

| Number | Flap | Half |
| --- | --- | --- |
| 1 | north | east |
| 2 | east | north |
| 3 | east | south |
| 4 | south | east |
| 5 | south | west |
| 6 | west | south |
| 7 | west | north |
| 8 | north | west |

## How the game is played

The game is a state machine with these phases.

| Phase | Pose | What the player can do |
| --- | --- | --- |
| `chooseColour` | closed | Choose one of the four pockets. |
| `counting` | opening and closing | Nothing. Input is ignored, not queued. |
| `chooseNumber` | open | Choose one of the four number triangles that face the camera. |
| `revealing` | moving to the reveal pose | Nothing. Input is ignored, not queued. |
| `revealed` | reveal pose, one triangle lifted | Choose "Play again". |

The order is: `chooseColour`, `counting`, `chooseNumber`, `counting`, `chooseNumber`, `revealing`, `revealed`, then back to `chooseColour`.

Rules:

1. **Count rule.** Every label has a count. If the label is a whole number from 1 to 12 written in digits, the count is that number. Otherwise the count is the number of letters and digits in the label. Examples: `red` is 3, `7` is 7, `12` is 12, `13` is 2, `Hi!` is 2, `ice cream` is 8.
2. **Opening rule.** One count is one opening. For each count the toy closes if it is open, then opens. Openings alternate between the two directions. The first opening of a game is north-south. The alternation continues through the whole game and never restarts. After the last count the toy stays open.
3. **Choice rule.** After a north-south opening the player can choose number triangles 2, 3, 6 and 7. After an east-west opening the player can choose 1, 4, 5 and 8.
4. **First number.** The first chosen number triangle starts a second count that uses its label.
5. **Second number.** The second chosen number triangle is lifted and its fortune is shown.

Worked example with the default labels. Use it as a test case.

1. The player chooses the pocket `red`. The count is 3. The openings are north-south, east-west, north-south. The toy stays open north-south. The choices are 2, 3, 6, 7.
2. The player chooses 3. The openings are east-west, north-south, east-west. The toy stays open east-west. The choices are 1, 4, 5, 8.
3. The player chooses 5. The toy moves to the reveal pose, number triangle 5 lifts, and fortune 5 is shown.

Second test case: `blue` gives 4 openings and ends east-west, with choices 1, 4, 5, 8. Choosing 8 gives 8 openings that start north-south and end east-west.

## Reference geometry

The whole pose of the paper is a function of the two tip offsets. The function below returns the position of every corner. The paper is modelled as flat triangles with no thickness. The half-side of the folded square is 1 unit.

```js
// Computes the corner positions of a paper fortune teller, as rigid triangles, from two tip offsets.
//
// Model. The folded square has half-side 1. It is creased along both diagonals and both
// midlines, which gives 8 right triangles around the centre. Axes: x east, y up, z south.
//   centre        = (0, 0, 0)                          bottom of the mouth
//   tip(sx, sz)   = (sx * tipX, tipY, sz * tipZ)       the 4 corners of the square; sx, sz are -1 or +1
//   tipY          = sqrt(2 - tipX^2 - tipZ^2)          keeps |centre - tip| = sqrt(2)
//   midEast       = (cos a, sin a, 0)                  midpoint of the east side, |centre - mid| = 1
//   a             = atan2(tipY, tipX) - acos(1 / sqrt(2 - tipZ^2))    keeps |mid - tip| = 1
//   midSouth      = (0, sin b, cos b)
//   b             = atan2(tipY, tipZ) - acos(1 / sqrt(2 - tipX^2))
//   pocketCorner  = mirror image of the centre in the plane through (mid, tip, mid) of one quadrant
// Contract: 0 <= tipX <= 1 and 0 <= tipZ <= 1. (0, 0) is fully closed and (1, 1) is flat.
// Every triangle keeps its flat edge lengths (1, 1, sqrt(2)) for every input in that range.

const TIP_OFFSET_MIN = 0;
const TIP_OFFSET_MAX = 1;
const DIAGONAL_SQUARED = 2;

export const QUADRANTS = Object.freeze([
  Object.freeze({ name: "northEast", signX: 1, signZ: -1, midAlongZ: "north", midAlongX: "east" }),
  Object.freeze({ name: "southEast", signX: 1, signZ: 1, midAlongZ: "south", midAlongX: "east" }),
  Object.freeze({ name: "southWest", signX: -1, signZ: 1, midAlongZ: "south", midAlongX: "west" }),
  Object.freeze({ name: "northWest", signX: -1, signZ: -1, midAlongZ: "north", midAlongX: "west" }),
]);

// The 8 number triangles, clockwise from north when seen from above. Corner order makes the
// number side face +y in the flat pose.
export const INNER_TRIANGLES = Object.freeze([
  Object.freeze({ flap: "north", corners: ["centre", "tips.northEast", "mids.north"] }),
  Object.freeze({ flap: "east", corners: ["centre", "mids.east", "tips.northEast"] }),
  Object.freeze({ flap: "east", corners: ["centre", "tips.southEast", "mids.east"] }),
  Object.freeze({ flap: "south", corners: ["centre", "mids.south", "tips.southEast"] }),
  Object.freeze({ flap: "south", corners: ["centre", "tips.southWest", "mids.south"] }),
  Object.freeze({ flap: "west", corners: ["centre", "mids.west", "tips.southWest"] }),
  Object.freeze({ flap: "west", corners: ["centre", "tips.northWest", "mids.west"] }),
  Object.freeze({ flap: "north", corners: ["centre", "mids.north", "tips.northWest"] }),
]);

// The 8 outside triangles, two per finger pocket. Corner order makes the coloured side face
// away from the centre.
export const POCKET_TRIANGLES = Object.freeze([
  Object.freeze({ pocket: "northEast", corners: ["pocketCorners.northEast", "mids.north", "tips.northEast"] }),
  Object.freeze({ pocket: "northEast", corners: ["pocketCorners.northEast", "tips.northEast", "mids.east"] }),
  Object.freeze({ pocket: "southEast", corners: ["pocketCorners.southEast", "mids.east", "tips.southEast"] }),
  Object.freeze({ pocket: "southEast", corners: ["pocketCorners.southEast", "tips.southEast", "mids.south"] }),
  Object.freeze({ pocket: "southWest", corners: ["pocketCorners.southWest", "mids.south", "tips.southWest"] }),
  Object.freeze({ pocket: "southWest", corners: ["pocketCorners.southWest", "tips.southWest", "mids.west"] }),
  Object.freeze({ pocket: "northWest", corners: ["pocketCorners.northWest", "mids.west", "tips.northWest"] }),
  Object.freeze({ pocket: "northWest", corners: ["pocketCorners.northWest", "tips.northWest", "mids.north"] }),
]);

/** Returns every corner position of the fortune teller for one pair of tip offsets. */
export function computePose(tipX, tipZ) {
  requireTipOffset("tipX", tipX);
  requireTipOffset("tipZ", tipZ);
  const tipY = Math.sqrt(DIAGONAL_SQUARED - tipX * tipX - tipZ * tipZ);
  const eastAngle = Math.atan2(tipY, tipX) - Math.acos(1 / Math.sqrt(DIAGONAL_SQUARED - tipZ * tipZ));
  const southAngle = Math.atan2(tipY, tipZ) - Math.acos(1 / Math.sqrt(DIAGONAL_SQUARED - tipX * tipX));
  const mids = {
    north: [0, Math.sin(southAngle), -Math.cos(southAngle)],
    east: [Math.cos(eastAngle), Math.sin(eastAngle), 0],
    south: [0, Math.sin(southAngle), Math.cos(southAngle)],
    west: [-Math.cos(eastAngle), Math.sin(eastAngle), 0],
  };
  const tips = {};
  const pocketCorners = {};
  for (const quadrant of QUADRANTS) {
    const tip = [quadrant.signX * tipX, tipY, quadrant.signZ * tipZ];
    tips[quadrant.name] = tip;
    pocketCorners[quadrant.name] = mirrorOriginInPlane(mids[quadrant.midAlongZ], tip, mids[quadrant.midAlongX]);
  }
  return { centre: [0, 0, 0], tips, mids, pocketCorners };
}

/** Returns the position stored under a dotted corner name such as "tips.northEast". */
export function cornerPosition(pose, cornerName) {
  const [group, key] = cornerName.split(".");
  const position = key === undefined ? pose[group] : pose[group]?.[key];
  if (position === undefined) {
    throw new RangeError(`unknown corner \`${cornerName}\`; use a name listed in INNER_TRIANGLES or POCKET_TRIANGLES`);
  }
  return position;
}

function requireTipOffset(name, value) {
  const isInRange = Number.isFinite(value) && value >= TIP_OFFSET_MIN && value <= TIP_OFFSET_MAX;
  if (!isInRange) {
    throw new RangeError(`${name} must be a number from ${TIP_OFFSET_MIN} to ${TIP_OFFSET_MAX}, got ${value}; clamp the animation value before calling computePose`);
  }
}

// The mirror image of the origin in the plane through three points is 2 * (n . first) * n,
// where n is the unit normal of the plane.
function mirrorOriginInPlane(first, second, third) {
  const normal = cross(subtract(second, first), subtract(third, first));
  const normalLength = Math.hypot(...normal);
  const unitNormal = normal.map((component) => component / normalLength);
  const signedDistance = dot(unitNormal, first);
  return unitNormal.map((component) => 2 * signedDistance * component);
}

function subtract(left, right) {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function dot(left, right) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}
```

This code was tested before it was given to you. At 441 poses on a 21 by 21 grid of tip offsets, every triangle keeps its edge lengths (1, 1 and the square root of 2) to within 1e-12. This means the paper never stretches, and any path between two poses is valid. You can port the code to TypeScript. Keep the formulas and the corner order unchanged.

Named poses. Start with these values and tune them only by looking at screenshots.

| Pose | tipX | tipZ | What the camera sees |
| --- | --- | --- | --- |
| closed | 0.05 | 0.05 | Four coloured pockets that meet at the centre. No number is readable. |
| open north-south | 0.05 | 0.75 | The tips move apart toward north and south. Number triangles 2, 3, 6 and 7 face the camera. |
| open east-west | 0.75 | 0.05 | The tips move apart toward east and west. Number triangles 1, 4, 5 and 8 face the camera. |
| reveal | 0.9 | 0.9 | A shallow bowl. All eight number triangles face the camera. |

To move between two poses, interpolate `tipX` and `tipZ` with an easing curve and call `computePose` on every frame. Do not rotate rigid groups about hinge axes. The pockets do not move like simple hinges.

Reference values for your port. Check them to 4 decimal places.

| Input | Corner | Position (x, y, z) |
| --- | --- | --- |
| (0, 0) | every tip | (0, 1.4142, 0) |
| (0, 0) | `mids.east` | (0.7071, 0.7071, 0) |
| (0, 0) | `pocketCorners.northEast` | (0.9428, 0.9428, -0.9428) |
| (1, 1) | `tips.northEast` | (1, 0, -1) |
| (1, 1) | every pocket corner | (0, 0, 0) |
| (0.05, 0.75) | `tips.northEast` | (0.0500, 1.1979, -0.7500) |
| (0.05, 0.75) | `mids.north` | (0.0000, 0.2247, -0.9744) |
| (0.05, 0.75) | `mids.east` | (0.5860, 0.8103, 0.0000) |
| (0.05, 0.75) | `pocketCorners.northEast` | (0.9222, 0.0935, -0.6108) |

## Requirements

### Rendering

- Draw 8 number triangles, 8 fortune triangles and 8 pocket triangles. Each fortune triangle has the same corners as its number triangle.
- The paper looks matte. The number side is off-white. The back of every triangle is plain paper in a slightly darker tone. Each pocket has its own colour.
- Draw thin dark lines along the triangle edges so that the folds are clear.
- Use soft lighting with one main directional light. Neighbouring triangles must differ in brightness, because that difference is what makes the folds visible.
- Use a perspective camera with a field of view of about 30 degrees. It looks at the centre from above. Its elevation above the ground plane is between 75 and 90 degrees. Start at 80. Do not add orbit controls.
- While the toy waits for input, sway the whole toy slowly by a few degrees so that it reads as a 3D object.
- The whole toy, including a lifted triangle, fits inside the canvas at every container width from 320 pixels up.

### Interaction

- The player can click or tap a pocket or a number triangle directly on the canvas. Find the nearest surface under the pointer among all triangles, and accept it only if it is a valid choice in the current phase.
- A valid choice shows a hover highlight and a pointer cursor on devices that have hover.
- One count takes about 400 milliseconds. Tune it by eye.
- A status line under the canvas says what to do next. During a count it shows the count as it runs: the letters of a word one by one, or the numbers 1, 2, 3.
- The current choices also exist as real buttons under the canvas, so that the game works with a keyboard and a screen reader.

### Text on the paper

- Draw each label and each fortune on a 2D canvas, and use that canvas as the texture of its triangle.
- Use one handwriting-style font that has an open licence. Put the font file in the project. Wait until the font is loaded before you draw any texture.
- Text is upright on screen to within about 20 degrees, and is not mirrored, in the pose where the player reads it. Pocket labels are read in the closed pose, number labels in their open pose, and fortunes in the reveal pose. Compute the rotation of each texture from the projected triangle in that pose.
- Text stays inside its triangle with a margin. Wrap and shrink it as needed.

### Reveal

1. Move from the open pose to the reveal pose in about 600 milliseconds.
2. Make the fortune triangle under the chosen number triangle visible.
3. Rotate the chosen number triangle by about 150 degrees about its outer edge, which is the edge from its mid to its tip. Its centre corner swings up first and then outward past the edge.
4. At the same time, move the camera so that the fortune triangle spans at least half of the canvas width.
5. Show the fortune in the status line as well.

"Play again" lowers the triangle, hides the fortune triangle, moves the camera back and returns to the closed pose.

### Editing and saving

- An "Edit" control opens a form with the four pockets (label and colour) and the eight panels (label and fortune). The form makes clear which field belongs to which triangle. When a field has focus, its triangle is highlighted on the toy.
- The toy updates as soon as a valid value is entered.
- Validation: a label has 1 to 12 characters and at least one letter or digit. A fortune has 1 to 60 characters. A colour is `#rrggbb`. An invalid value shows a message next to its field and is not applied.
- The configuration is saved in `localStorage` under one key and has a `version` field. Validate it when you load it. If the saved value is invalid, use the defaults and show a visible notice that says so.
- "Copy link" writes the configuration into the URL fragment and copies the URL. A configuration in the URL fragment is validated in the same way and is used for that visit.
- "Reset" restores the defaults.

The configuration has this shape:

```ts
type FortuneTellerConfig = Readonly<{
  version: 1;
  // Order: northEast, southEast, southWest, northWest.
  pockets: readonly [Pocket, Pocket, Pocket, Pocket];
  // Index 0 is number triangle 1. The order is clockwise, as in the table above.
  panels: readonly [Panel, Panel, Panel, Panel, Panel, Panel, Panel, Panel];
}>;
type Pocket = Readonly<{ label: string; colour: string }>;
type Panel = Readonly<{ label: string; fortune: string }>;
```

Defaults: the pockets are `red` (`#e5484d`), `blue` (`#3e63dd`), `green` (`#30a46c`) and `yellow` (`#f5d90a`), in the order above. The panel labels are `1` to `8`. The fortunes are:

1. You will make a new friend soon.
2. A good surprise is on its way.
3. Ask again after a snack.
4. Today is a lucky day for you.
5. Someone is thinking of you.
6. You will travel somewhere new.
7. Try the thing that scares you a little.
8. Your next idea will work.

### Embedding and hosting

- Export one function, `mountFortuneTeller(container, options)`. It returns an object with a `destroy` method. The demo page `index.html` calls it.
- The component fills the width of its container. It does not assume that it owns the whole window.
- `destroy` releases every geometry, material, texture, listener and observer, and the renderer.
- The build output is static files with relative URLs, so that it works from a sub-path.
- The page makes no network request to another host at run time.
- If WebGL is not available, show a clear message inside the container.
- Limit the device pixel ratio to 2. Stop rendering while the page is hidden or the canvas is off screen.

### Accessibility

- Every action works with the keyboard, and focus is visible.
- The status line is a live region, so a screen reader announces the count and the fortune.
- If the visitor prefers reduced motion, stop the idle sway and skip the counting animation. Show the count in the status line and move to the final pose in one short step.
- Colour is never the only cue. Each pocket shows its label.

## Technical choices

- Use TypeScript, Vite and Three.js. Use Vitest for unit tests and Playwright for browser tests. Pin exact versions and commit the lock file. Add no other run-time dependency.
- Three.js is required because the triangles need a real depth buffer and per-triangle picking. CSS 3D transforms cannot sort intersecting triangles reliably.
- Keep the geometry and the game rules in pure modules that do not import Three.js. The game module is a function from a state and an event to a new state. Test both modules without a browser.
- The demo page accepts `?pose=tipX,tipZ`. It then shows that fixed pose and turns the game off. You need this for screenshots. An invalid value shows an error message, not a default pose.

## Known traps

1. **Camera too low.** Below about 75 degrees of elevation, the near walls of the mouth turn away from the camera and one of the four numbers disappears. This was observed at 60 degrees in an orthographic sketch. At 75, 80 and 85 degrees all four were visible. Confirm it with your own perspective camera.
2. **Coincident surfaces flicker.** A fortune triangle lies exactly under its number triangle. Keep each fortune triangle hidden until its reveal starts. Do not render at exactly (0, 0) or (1, 1), because layers coincide there.
3. **Picking fails after the corners move.** After you write new corner positions into a geometry, mark the position attribute as changed and recompute the bounding sphere. The raycaster uses the bounding sphere.
4. **Wrong font on the paper.** Canvas text that is drawn before the font loads uses a different font without any error.
5. **Mirrored or upside-down text.** This comes from the UV mapping and the texture flip setting. Check every text surface in a screenshot.
6. **Washed-out colours.** Set the colour space of every canvas texture to sRGB.
7. **A tap that is read as a drag.** Treat pointer down and pointer up within 10 pixels and 500 milliseconds as a tap.
8. **Blurry or stretched canvas.** Resize the renderer with a `ResizeObserver` on the container, and update the camera aspect.

## Build order

Work in this order. Do not start a step until the check of the step before it passes.

1. **Geometry.** Create the project and port `computePose`. Test: the edge lengths hold on the 21 by 21 grid, the reference values match, and an input outside 0 to 1 is an error. Show that the test can fail: move one corner by 1 percent and confirm that the edge length test reports it.
2. **Static picture.** Draw the triangles from `computePose` with plain colours and number labels. Take one screenshot of each named pose with `?pose=`. Look at each screenshot yourself and compare it with the column "What the camera sees". If the picture `fortune-teller-reference-poses.png` came with this prompt, your four screenshots must show the same shapes. That picture is a flat sketch of the geometry. It is not a style guide.
3. **Game rules.** Write the pure game module. Test the count rule with the examples above, both worked examples, and that input during `counting` and `revealing` changes nothing.
4. **Motion and input.** Add the pose animation, picking on the canvas, the buttons and the status line.
5. **Text and reveal.** Add the textures, the lift and the camera move. Take screenshots of the closed pose, both open poses and the revealed state, and check the text rules.
6. **Editing.** Add the form, validation, saving, the link and reset.
7. **Finish.** Add lighting, edge lines, reduced motion, small screens, resize and `destroy`.

## Definition of done

- `npm run test`, `npm run test:browser` and `npm run build` each exit with code 0.
- A browser test plays the first worked example with the keyboard and checks that the status line shows fortune 5.
- A browser test changes a fortune in the form, reloads the page, plays to that panel and reads the new text.
- Screenshots exist for the four named poses and the revealed state, at 390 pixels and at 1280 pixels of width, and you have looked at each one.
- No text is mirrored or upside down, and no surface flickers during a full game.
- The built `dist` folder works when it is served from a sub-path.

## When something is unclear

Choose the option that is closest to how the real paper toy behaves, and list the choice in your report. Stop and ask only if the choice would be expensive to undo.

## Final report

When you finish, report these points:

1. What you built and how to run it.
2. The exact test commands and their results.
3. Where the screenshots are, and what you checked in each one.
4. Every place where you deviated from this document, and the reason.
5. What you could not verify. If you cannot take screenshots in your environment, say so, and list the visual checks that remain open.
