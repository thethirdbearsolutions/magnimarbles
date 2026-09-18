import { World, WON, ALIVE, MAGNET_CHARGE } from './physics.js';
import { LEVELS } from './levels.js';
import { Editor, decodeLevel } from './editor.js';
import { Desktop } from './desktop.js';

const DT = 1 / 120;
const STORE = 'magnimarbles.best.v1';

export class Game {
  constructor(view) {
    this.view = view;
    this.levels = LEVELS;
    this.best = JSON.parse(localStorage.getItem(STORE) || '{}');
    this.el = {};
    for (const id of ['levelNo', 'levelName', 'attempts', 'time', 'magnets', 'best', 'phase', 'challenges', 'run', 'reset', 'clear', 'prev', 'next', 'edit', 'desktop', 'toast', 'help'])
      this.el[id] = document.getElementById(id);
    this.el.desktop.onclick = () => this.desktop.toggle();
    this.el.run.onclick = () => this.run();
    this.el.reset.onclick = () => this.reset();
    this.el.clear.onclick = () => this.clearMagnets();
    this.el.prev.onclick = () => this.loadLevel(this.levelIndex - 1);
    this.el.next.onclick = () => this.loadLevel(this.levelIndex + 1);
    this.el.edit.onclick = () => this.editor.toggle();
    addEventListener('keydown', (e) => this.onKey(e));
    const c = view.renderer.domElement;
    c.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    c.addEventListener('pointermove', (e) => this.onPointerMove(e));
    c.addEventListener('pointerup', (e) => this.onPointerUp(e));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    this.drag = null;
    this.accumulator = 0;
    this.editor = new Editor(this, view);
    this.desktop = new Desktop(this, view);
    const hash = (location.hash || '').replace('#', '');
    const custom = decodeLevel(hash);
    if (custom) this.loadCustom(custom);
    else {
      const fromHash = parseInt(hash, 10);
      this.loadLevel(Number.isFinite(fromHash) ? fromHash - 1 : 0);
    }
  }

  // ---- levels & phases ----

  loadLevel(i) {
    i = ((i % this.levels.length) + this.levels.length) % this.levels.length;
    this.levelIndex = i;
    this.custom = false;
    this.setLevel(this.levels[i]);
    location.hash = String(i + 1);
  }

  /** A level from the editor or a shared link. */
  loadCustom(level, keepProgress = false) {
    this.levelIndex = 0;
    this.custom = true;
    const magnets = keepProgress && this.world ? this.world.magnets.map(m => ({ x: m.x, z: m.z, q: m.q })) : [];
    this.setLevel(level);
    for (const m of magnets) this.world.place(m.x, m.z, m.q);
    this.view.syncMagnets(this.world);
    this.updateHud();
  }

  setLevel(level) {
    this.level = level;
    this.world = new World(this.level);
    this.world.onBounce = (kind, speed) => this.onBounce(kind, speed);
    this.world.reset();
    this.phase = 'design';
    this.attempts = 0;
    this.result = null;
    this.view.buildLevel(this.world);
    this.updateHud();
  }

  run() {
    if (this.phase === 'run') return;
    this.world.reset();
    this.attempts++;
    this.phase = 'run';
    this.result = null;
    this.accumulator = 0;
    this.view.hideGhost();
    this.updateHud();
  }

  reset() {
    this.world.reset();
    this.phase = 'design';
    this.result = null;
    this.updateHud();
  }

  clearMagnets() {
    if (this.phase === 'run') return;
    this.world.magnets = [];
    this.view.syncMagnets(this.world);
    this.updateHud();
  }

  finish(state) {
    this.phase = 'done';
    this.result = { state, time: this.world.time, magnets: this.world.magnets.length, attempts: this.attempts };
    if (state === WON) {
      const met = this.challengesMet(this.result);
      if (!this.custom && !this.desktop.active) {
        const key = this.level.name;
        const b = this.best[key];
        const rec = { time: this.result.time, magnets: this.result.magnets, attempts: this.result.attempts, met };
        if (!b || rec.time < b.time) this.best[key] = { ...rec, met: (b ? b.met.map((v, i) => v || met[i]) : met) };
        else this.best[key].met = b.met.map((v, i) => v || met[i]);
        localStorage.setItem(STORE, JSON.stringify(this.best));
      }
      this.toast(`Goal in ${this.result.time.toFixed(2)}s`, '#7ce07c');
    } else {
      this.toast(state, '#ff5a4e');
    }
    this.updateHud();
  }

  challengesMet(r) {
    return (this.level.challenges || []).map(c => {
      if (c.time !== undefined) return r.time <= c.time;
      if (c.magnets !== undefined) return r.magnets === c.magnets;
      if (c.attempts !== undefined) return r.attempts <= c.attempts;
      return false;
    });
  }

  // ---- input ----

  onKey(e) {
    if (e.repeat) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    switch (e.key) {
    case ' ': case 'Enter': e.preventDefault(); if (this.editor.active) break; if (this.phase === 'design') this.run(); else if (this.phase === 'done') this.reset(); break;
    case 'r': case 'R': this.reset(); break;
    case 'e': case 'E': if (this.phase !== 'run' && !this.desktop.active) this.editor.toggle(); break;
    case 'd': case 'D': if (this.phase !== 'run' && !this.editor.active) this.desktop.toggle(); break;
    case '[': if (!this.desktop.active) this.loadLevel(this.levelIndex - 1); break;
    case ']': if (!this.desktop.active) this.loadLevel(this.levelIndex + 1); break;
    }
  }

  onPointerDown(e) {
    if (this.phase === 'run') return;
    // keep the rest of the drag even if it wanders over a panel
    try { this.view.renderer.domElement.setPointerCapture(e.pointerId); } catch (err) { }
    const p = this.view.pickFloor(e.clientX, e.clientY);
    if (this.editor.active) { this.editor.pointerDown(p, e); return; }
    if (this.phase === 'done') this.reset();
    if (!p) return;
    const m = this.world.magnetAt(p.x, p.z);
    if (m) {
      if (e.ctrlKey || e.button === 2) {
        this.world.remove(m);
        this.view.syncMagnets(this.world);
      } else {
        this.drag = { m, startX: p.x, startZ: p.z, moved: false, ox: m.x, oz: m.z };
      }
    } else if (e.button === 0 && !e.ctrlKey) {
      const placed = this.world.place(p.x, p.z, MAGNET_CHARGE);
      if (placed) { this.view.syncMagnets(this.world); this.drag = { m: placed, startX: p.x, startZ: p.z, moved: true, ox: placed.x, oz: placed.z }; }
    }
    this.updateHud();
  }

  onPointerMove(e) {
    if (this.phase === 'run') return;
    const p = this.view.pickFloor(e.clientX, e.clientY);
    if (this.editor.active) { this.editor.pointerMove(p); return; }
    if (!p) { this.view.hideGhost(); return; }
    if (this.drag) {
      const m = this.drag.m;
      if (Math.hypot(p.x - this.drag.startX, p.z - this.drag.startZ) > 0.15) this.drag.moved = true;
      if (this.world.canPlace(p.x, p.z, m)) { m.x = p.x; m.z = p.z; }
      this.view.syncMagnets(this.world);
      this.view.hideGhost();
      return;
    }
    if (this.world.magnetAt(p.x, p.z) || this.world.magnets.length >= this.world.budget) { this.view.hideGhost(); return; }
    this.view.showGhost(p.x, p.z, this.world.canPlace(p.x, p.z), MAGNET_CHARGE);
  }

  onPointerUp(e) {
    if (this.editor.active) { this.editor.pointerUp(this.view.pickFloor(e.clientX, e.clientY)); return; }
    if (!this.drag) return;
    const d = this.drag; this.drag = null;
    if (!d.moved) {
      d.m.q = -d.m.q;   // a click flips polarity
      this.view.syncMagnets(this.world);
    }
    this.updateHud();
  }

  onBounce(kind, speed) { }

  // ---- loop ----

  tick(dt) {
    if (this.desktop.active) this.desktop.tick(this.world);
    if (this.phase === 'run') {
      this.accumulator += Math.min(dt, 0.1);
      while (this.accumulator >= DT) {
        const s = this.world.step(DT);
        this.accumulator -= DT;
        if (s !== ALIVE) { this.finish(s); break; }
      }
      this.el.time.textContent = this.world.time.toFixed(1) + 's';
    }
    // the desktop's chase camera would put the DOM windows between the camera and the marble; stay on the stage view
    this.view.render(this.world, this.desktop.active ? 'design' : this.phase, dt);
    if (this.desktop.active) this.desktop.render();
  }

  // ---- hud ----

  updateHud() {
    const w = this.world, el = this.el;
    el.levelNo.textContent = this.desktop.active ? 'toy' : this.custom ? 'custom' : `${this.levelIndex + 1}/${this.levels.length}`;
    el.prev.disabled = el.next.disabled = el.edit.disabled = this.desktop.active;
    el.desktop.textContent = this.desktop.active ? 'Leave desktop' : 'Desktop';
    el.desktop.disabled = this.editor.active;
    el.levelName.textContent = this.level.name;
    el.attempts.textContent = String(this.attempts);
    el.time.textContent = (this.result ? this.result.time : w.time).toFixed(1) + 's';
    el.magnets.textContent = `${w.magnets.length} / ${w.budget}`;
    const b = this.custom ? null : this.best[this.level.name];
    el.best.textContent = b ? `${b.time.toFixed(2)}s, ${b.magnets} magnet${b.magnets === 1 ? '' : 's'}` : '–';
    el.phase.className = 'phase ' + (this.phase === 'run' ? 'run' : this.result ? (this.result.state === WON ? 'won' : 'lost') : '');
    el.phase.textContent = this.editor.active ? 'editing' : this.phase === 'design' ? 'design: place your magnets' : this.phase === 'run' ? 'rolling' : (this.result.state === WON ? 'reached the goal' : this.result.state);
    el.run.disabled = this.phase === 'run' || this.editor.active;
    el.run.textContent = this.phase === 'done' ? 'Run again' : 'Run';
    el.edit.textContent = this.editor.active ? 'Done editing' : 'Edit';
    const met = this.result && this.result.state === WON ? this.challengesMet(this.result) : (b ? b.met : []);
    el.challenges.innerHTML = (this.level.challenges || []).map((c, i) => {
      const text = c.time !== undefined ? `under ${c.time}s` : c.magnets !== undefined ? `exactly ${c.magnets} magnet${c.magnets === 1 ? '' : 's'}` : `within ${c.attempts} attempts`;
      return `<li class="${met[i] ? 'met' : ''}">${text}</li>`;
    }).join('');
  }

  toast(text, color) {
    const t = this.el.toast;
    t.textContent = text; t.style.color = color; t.style.display = 'block';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { t.style.display = 'none'; }, 2200);
  }
}
