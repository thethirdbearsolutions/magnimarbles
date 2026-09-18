// Desktop toy mode. The windows are real DOM, stood up on the floor with
// CSS3DRenderer and sharing the WebGL camera; each one's footprint is a wall
// in the physics, with the velocity you drag it at, so a window is a paddle.

import * as THREE from 'three';
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';

export const PX_PER_UNIT = 40;

export const DESKTOP_LEVEL = {
  name: 'Desktop',
  size: [32, 18],
  start: [-13, 0],
  startVelocity: [0, 0],
  goal: { x: 13, z: 5, r: 1.2 },
  budget: 6,
  walls: [], pits: [], ice: [], spikes: [], magnets: [],
  challenges: [],
};

const APPS = {
  notes: {
    title: 'Notes',
    w: 380, h: 260,
    body: (el) => {
      const t = document.createElement('textarea');
      t.value = 'magnimarbles.txt\n\n- drag a window by its title bar\n- the marble bounces off it\n- flip it over and write on the back\n- move it while the marble rolls';
      el.appendChild(t);
    },
  },
  clock: {
    title: 'Clock',
    w: 300, h: 200,
    body: (el) => {
      const d = document.createElement('div');
      d.className = 'clock';
      el.appendChild(d);
      const tick = () => { d.textContent = new Date().toLocaleTimeString(); };
      tick(); setInterval(tick, 1000);
    },
  },
  terminal: {
    title: 'Terminal',
    w: 420, h: 240,
    body: (el, ctx) => {
      const pre = document.createElement('pre');
      pre.className = 'term';
      el.appendChild(pre);
      ctx.terminal = pre;
    },
  },
  bingleball: {
    title: 'Bingleball',
    w: 512, h: 384,
    body: (el) => {
      const f = document.createElement('iframe');
      f.src = 'https://bingleball.vercel.app/';
      f.title = 'Bingleball';
      el.appendChild(f);
    },
  },
};

class Win {
  constructor(desktop, kind, x, z, angle) {
    this.desktop = desktop;
    const app = APPS[kind];
    this.kind = kind;
    this.w = app.w / PX_PER_UNIT;
    this.h = app.h / PX_PER_UNIT;
    this.x = x; this.z = z; this.angle = angle;
    this.vx = 0; this.vz = 0;
    this.flipped = false;

    // front
    const el = document.createElement('div');
    el.className = 'lgwin';
    el.style.width = app.w + 'px'; el.style.height = app.h + 'px';
    el.innerHTML = `<div class="bar"><span class="title">${app.title}</span><span class="spacer"></span>
      <button data-act="ccw" title="turn">↶</button><button data-act="cw" title="turn">↷</button><button data-act="flip" title="flip">⇄</button><button data-act="close" title="close">×</button></div><div class="body"></div>`;
    app.body(el.querySelector('.body'), desktop.ctx);
    this.el = el;
    this.obj = new CSS3DObject(el);
    this.obj.scale.setScalar(1 / PX_PER_UNIT);

    // back: LG3D let you write on the back of a window
    const back = document.createElement('div');
    back.className = 'lgwin back';
    back.style.width = app.w + 'px'; back.style.height = app.h + 'px';
    back.innerHTML = `<div class="bar"><span class="title">back of ${app.title}</span><span class="spacer"></span><button data-act="flip" title="flip">⇄</button></div><div class="body"><textarea placeholder="notes on the back"></textarea></div>`;
    this.backEl = back;
    this.backObj = new CSS3DObject(back);
    this.backObj.scale.setScalar(1 / PX_PER_UNIT);

    // occluder: hides WebGL things behind the window without drawing anything
    this.occluder = new THREE.Mesh(new THREE.PlaneGeometry(this.w, this.h), new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }));
    this.occluder.renderOrder = -1;
    // shadow caster so the marble's world feels shared
    this.shadow = new THREE.Mesh(new THREE.BoxGeometry(this.w, this.h, 0.05), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    this.shadow.castShadow = true;

    for (const b of [el, back]) {
      b.querySelector('.bar').addEventListener('pointerdown', (e) => this.dragStart(e));
      b.querySelectorAll('button').forEach(btn => btn.addEventListener('pointerdown', (e) => { e.stopPropagation(); }));
      b.querySelectorAll('button').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); this.act(btn.dataset.act); }));
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('pointerup', (e) => e.stopPropagation());
    }
    this.sync();
  }

  act(a) {
    if (a === 'cw') this.angle -= Math.PI / 8;
    else if (a === 'ccw') this.angle += Math.PI / 8;
    else if (a === 'flip') this.flipped = !this.flipped;
    else if (a === 'close') this.desktop.remove(this);
    this.sync();
  }

  dragStart(e) {
    if (e.target.tagName === 'BUTTON') return;
    e.stopPropagation();
    // pick against the plane of the title bar, not the floor: from the low
    // camera a ray through the bar can miss the floor entirely
    const barY = this.h;
    const p = this.desktop.view.pickAt(e.clientX, e.clientY, barY);
    if (!p) return;
    this.drag = { ox: this.x - p.x, oz: this.z - p.z, lastX: this.x, lastZ: this.z, lastT: performance.now() };
    const move = (ev) => {
      const q = this.desktop.view.pickAt(ev.clientX, ev.clientY, barY);
      if (!q) return;
      const now = performance.now();
      const dt = Math.max(0.008, (now - this.drag.lastT) / 1000);
      const nx = q.x + this.drag.ox, nz = q.z + this.drag.oz;
      this.vx = (nx - this.x) / dt; this.vz = (nz - this.z) / dt;
      this.x = nx; this.z = nz;
      this.drag.lastT = now;
      this.sync();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      this.drag = null;
      this.vx = this.vz = 0;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  sync() {
    const a = this.angle + (this.flipped ? Math.PI : 0);
    const y = this.h / 2 + 0.05;
    this.obj.position.set(this.x, y, this.z);
    this.obj.rotation.set(0, a, 0);
    this.backObj.position.set(this.x, y, this.z);
    this.backObj.rotation.set(0, a + Math.PI, 0);
    this.occluder.position.set(this.x, y, this.z);
    this.occluder.rotation.set(0, a, 0);
    this.shadow.position.set(this.x, y, this.z);
    this.shadow.rotation.set(0, a, 0);
  }

  /** The footprint as a physics wall. Paddle speed is capped so a jerk of
   *  the mouse does not fling the marble off the table. */
  wall() {
    const sp = Math.hypot(this.vx, this.vz), cap = 18;
    const k = sp > cap ? cap / sp : 1;
    return { x: this.x, z: this.z, w: this.w, d: 0.35, a: -(this.angle + (this.flipped ? Math.PI : 0)), h: this.h, vx: this.vx * k, vz: this.vz * k, window: true };
  }
}

export class Desktop {
  constructor(game, view) {
    this.game = game;
    this.view = view;
    this.active = false;
    this.windows = [];
    this.ctx = {};
    this.css = new CSS3DRenderer();
    const el = this.css.domElement;
    el.id = 'css3d';
    el.style.position = 'fixed'; el.style.inset = '0';
    document.getElementById('stage').prepend(el);
    this.css.setSize(innerWidth, innerHeight);
    this.cssScene = new THREE.Scene();
    addEventListener('resize', () => this.css.setSize(innerWidth, innerHeight));

    // the floor is a DOM element too: wallpaper
    this.floorEl = document.createElement('div');
    this.floorEl.className = 'wallpaper';
    this.floorObj = new CSS3DObject(this.floorEl);
    this.floorObj.rotation.x = -Math.PI / 2;
    this.floorObj.scale.setScalar(1 / PX_PER_UNIT);
    this.floorEl.addEventListener('pointerdown', (e) => this.game.onPointerDown(e));
    this.floorEl.addEventListener('pointermove', (e) => this.game.onPointerMove(e));
    this.floorEl.addEventListener('pointerup', (e) => this.game.onPointerUp(e));
    this.floorEl.addEventListener('contextmenu', (e) => e.preventDefault());
    el.style.display = 'none';
  }

  open() {
    if (this.active) return;
    this.active = true;
    document.body.classList.add('desktop');
    this.css.domElement.style.display = '';
    this.view.setDesktop(true);
    this.game.loadCustom(DESKTOP_LEVEL);
    this.game.custom = false;
    const [W, D] = DESKTOP_LEVEL.size;
    this.floorEl.style.width = (W * PX_PER_UNIT) + 'px';
    this.floorEl.style.height = (D * PX_PER_UNIT) + 'px';
    this.cssScene.add(this.floorObj);
    if (this.windows.length === 0) {
      this.add('notes', -4, -4, 0.35);
      this.add('clock', 5, -2, -0.5);
      this.add('terminal', 1, 4, 0.15);
      this.add('bingleball', 9, 1, -0.9);
    } else {
      for (const w of this.windows) this.attach(w);
    }
    this.game.updateHud();
  }

  close() {
    if (!this.active) return;
    this.active = false;
    document.body.classList.remove('desktop');
    this.css.domElement.style.display = 'none';
    for (const w of this.windows) this.detach(w);
    this.cssScene.remove(this.floorObj);
    this.view.setDesktop(false);
    this.game.world.setDynamicWalls([]);
    this.game.loadLevel(0);
  }

  toggle() { this.active ? this.close() : this.open(); }

  add(kind, x, z, angle) {
    const w = new Win(this, kind, x, z, angle);
    this.windows.push(w);
    this.attach(w);
    return w;
  }

  attach(w) {
    this.cssScene.add(w.obj); this.cssScene.add(w.backObj);
    this.view.scene.add(w.occluder); this.view.scene.add(w.shadow);
  }

  detach(w) {
    this.cssScene.remove(w.obj); this.cssScene.remove(w.backObj);
    this.view.scene.remove(w.occluder); this.view.scene.remove(w.shadow);
  }

  remove(w) {
    this.detach(w);
    this.windows = this.windows.filter(o => o !== w);
  }

  pick(clientX, clientY) { return this.view.pickFloor(clientX, clientY); }

  /** Called every frame before physics. */
  tick(world) {
    world.setDynamicWalls(this.windows.map(w => w.wall()));
    for (const w of this.windows) if (!w.drag) { w.vx *= 0.5; w.vz *= 0.5; }
    if (this.ctx.terminal && world.marble) {
      const b = world.marble;
      const lines = [
        `$ magnimarbles --desktop`,
        `marble   x=${b.x.toFixed(2).padStart(7)}  z=${b.z.toFixed(2).padStart(7)}`,
        `speed    ${b.speed().toFixed(2)} u/s`,
        `state    ${world.state}   t=${world.time.toFixed(1)}s`,
        `magnets  ${world.magnets.length} / ${world.budget}`,
        `windows  ${this.windows.length}`,
        `_`,
      ];
      this.ctx.terminal.textContent = lines.join('\n');
    }
  }

  render() {
    // show whichever face points at the camera; CSS backface-visibility is
    // not reliable through CSS3DRenderer's transforms
    const cam = this.view.camera.position;
    for (const w of this.windows) {
      const a = w.angle + (w.flipped ? Math.PI : 0);
      const nx = Math.sin(a), nz = Math.cos(a);
      const facing = nx * (cam.x - w.x) + nz * (cam.z - w.z) > 0;
      w.el.style.visibility = facing ? 'visible' : 'hidden';
      w.backEl.style.visibility = facing ? 'hidden' : 'visible';
    }
    this.css.render(this.cssScene, this.view.camera);
  }
}
