# Magnimarbles

Proposed in May 2006 for Project Looking Glass. Built in September 2026 for
a browser.

Two modes, as proposed. A windowed puzzle: place magnets, then take your
hands off. The marble rolls under gravity,
magnetism, and whatever it bumps into, and either reaches the goal or
doesn't. All magnets are monopoles: red pushes the marble, blue pulls it.
The marble cannot be steered. Chutes, pits, spikes, ice, and the magnets the
level came with are the course; the only thing you place is charge.

Score is attempts, the time of the winning run, and magnets used. Each level
carries three challenges.

And a desktop toy: the same marble and magnets loose on a desktop whose
windows are the obstacles, and where you may move the furniture while the
marble is rolling.

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
- `src/desktop.js` desktop toy mode: DOM windows in the scene via CSS3DRenderer
- `src/main.js` the loop

Controls: click to place, click a magnet to flip it, drag to move, Ctrl-click
to remove. Space runs, R resets, `[` and `]` change level.

D opens the desktop. The windows are real: a notes pad, a clock, a terminal
that watches the marble, and Bingleball in a frame. Drag one by its title
bar, turn it, flip it over and write on the back. Each one is a wall to the
marble, and a moving one is a paddle. Magnets go on the wallpaper as usual.

E opens the editor. Drag to draw walls, pits, and ice; click to drop spikes,
fixed magnets, the start, and the goal; Ctrl-click erases. Copy link puts the
whole level in the URL fragment, so a level is a link.
