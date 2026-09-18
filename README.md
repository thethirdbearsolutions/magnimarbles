# Magnimarbles

Proposed in May 2006 for Project Looking Glass. Built in September 2026 for
a browser.

Place magnets, then take your hands off. The marble rolls under gravity,
magnetism, and whatever it bumps into, and either reaches the goal or
doesn't. All magnets are monopoles: red pushes the marble, blue pulls it.
The marble cannot be steered. Chutes, pits, spikes, ice, and the magnets the
level came with are the course; the only thing you place is charge.

Score is attempts, the time of the winning run, and magnets used. Each level
carries three challenges.

## Running it

Static site, no build. `python3 -m http.server` in this directory and open
the page, or visit the deploy. Three.js comes from a CDN import map.

`node tools/solve.mjs` brute-forces every level to prove it is beatable and
prints the fastest placements it found.

## Layout

- `src/physics.js` the whole game: marble, monopoles, walls, pits, spikes,
  ice, goal, fixed timestep
- `src/levels.js` the courses
- `src/render.js` Three.js scene, magnet glow, chase camera
- `src/game.js` design phase, test phase, input, scoring, HUD
- `src/editor.js` the level editor and the link format
- `src/main.js` the loop

Controls: click to place, click a magnet to flip it, drag to move, Ctrl-click
to remove. Space runs, R resets, `[` and `]` change level.

E opens the editor. Drag to draw walls, pits, and ice; click to drop spikes,
fixed magnets, the start, and the goal; Ctrl-click erases. Copy link puts the
whole level in the URL fragment, so a level is a link.
