import { View } from './render.js';
import { Game } from './game.js';

const view = new View(document.getElementById('stage'));
const game = new Game(view);

if (/[?&]debug/.test(location.search)) window.__magni = { game, view };

let last = performance.now();
function frame(now) {
  const dt = (now - last) / 1000;
  last = now;
  game.tick(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
