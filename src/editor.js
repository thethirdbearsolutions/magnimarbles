// The level editor. Draws on the same board the game plays on; every change
// rebuilds the world so what you see is what will run.

const RECT_TOOLS = new Set(['wall', 'pit', 'ice']);
const POINT_TOOLS = new Set(['spike', 'plus', 'minus', 'start', 'goal']);

export function blankLevel() {
  return {
    name: 'Untitled',
    size: [24, 16],
    start: [-9, 0],
    startVelocity: [0, 0],
    goal: { x: 9, z: 0, r: 1.1 },
    budget: 3,
    walls: [], pits: [], ice: [], spikes: [], magnets: [],
    challenges: [],
  };
}

export function encodeLevel(level) {
  const json = JSON.stringify(level);
  return 'L' + btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeLevel(hash) {
  if (!hash || hash[0] !== 'L') return null;
  try {
    let b = hash.slice(1).replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    const level = JSON.parse(decodeURIComponent(escape(atob(b))));
    if (!level.size || !level.start || !level.goal) return null;
    return level;
  } catch (e) {
    return null;
  }
}

function snap(v) { return Math.round(v * 2) / 2; }

function clone(level) { return JSON.parse(JSON.stringify(level)); }

export class Editor {
  constructor(game, view) {
    this.game = game;
    this.view = view;
    this.active = false;
    this.tool = 'wall';
    this.drag = null;
    this.panel = document.getElementById('editor');
    this.panel.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => this.setTool(b.dataset.tool));
    this.inputs = {};
    for (const id of ['name', 'budget', 'vx', 'vz', 'time', 'magnets', 'attempts', 'width', 'depth'])
      this.inputs[id] = document.getElementById('ed-' + id);
    for (const [id, el] of Object.entries(this.inputs)) el.onchange = () => this.readInputs();
    document.getElementById('ed-new').onclick = () => this.load(blankLevel());
    document.getElementById('ed-test').onclick = () => this.close();
    document.getElementById('ed-share').onclick = () => this.share();
    document.getElementById('ed-export').onclick = () => this.exportJson();
    document.getElementById('ed-close').onclick = () => this.close();
    this.status = document.getElementById('ed-status');
  }

  open() {
    this.active = true;
    this.draft = clone(this.game.level);
    delete this.draft.solution;
    this.panel.style.display = 'block';
    this.view.editShift = 2.5;
    this.game.reset();
    this.game.el.help.style.display = 'none';
    document.getElementById('buttons').style.display = 'none';
    this.setTool(this.tool);
    this.writeInputs();
    this.apply();
  }

  close() {
    this.active = false;
    this.drag = null;
    this.view.hideRect();
    this.view.editShift = 0;
    this.panel.style.display = 'none';
    this.game.el.help.style.display = '';
    document.getElementById('buttons').style.display = '';
    this.apply();
    this.game.updateHud();
  }

  toggle() { this.active ? this.close() : this.open(); }

  load(level) { this.draft = clone(level); this.writeInputs(); this.apply(); }

  setTool(t) {
    this.tool = t;
    this.panel.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  }

  /** Push the draft into the running game. */
  apply() {
    this.game.loadCustom(this.draft, true);
    location.hash = encodeLevel(this.draft);
  }

  // ---- fields ----

  writeInputs() {
    const d = this.draft, i = this.inputs;
    i.name.value = d.name || '';
    i.budget.value = d.budget;
    i.vx.value = (d.startVelocity || [0, 0])[0];
    i.vz.value = (d.startVelocity || [0, 0])[1];
    i.width.value = d.size[0]; i.depth.value = d.size[1];
    const c = d.challenges || [];
    const get = (k) => { const f = c.find(x => x[k] !== undefined); return f ? f[k] : ''; };
    i.time.value = get('time'); i.magnets.value = get('magnets'); i.attempts.value = get('attempts');
  }

  readInputs() {
    const d = this.draft, i = this.inputs;
    d.name = i.name.value.trim() || 'Untitled';
    d.budget = Math.max(0, parseInt(i.budget.value, 10) || 0);
    d.startVelocity = [parseFloat(i.vx.value) || 0, parseFloat(i.vz.value) || 0];
    d.size = [Math.max(8, parseFloat(i.width.value) || 24), Math.max(6, parseFloat(i.depth.value) || 16)];
    const c = [];
    const num = (el) => { const v = parseFloat(el.value); return el.value.trim() !== '' && Number.isFinite(v) && v > 0 ? v : null; };
    const t = num(i.time), m = num(i.magnets), a = num(i.attempts);
    if (t !== null) c.push({ time: t });
    if (m !== null) c.push({ magnets: Math.round(m) });
    if (a !== null) c.push({ attempts: Math.round(a) });
    d.challenges = c;
    this.apply();
  }

  // ---- pointer ----

  inBoard(p) {
    return Math.abs(p.x) <= this.draft.size[0] / 2 && Math.abs(p.z) <= this.draft.size[1] / 2;
  }

  itemAt(p) {
    const d = this.draft;
    for (const s of d.spikes || []) if (Math.hypot(p.x - s.x, p.z - s.z) <= (s.r || 0.5) + 0.3) return { list: d.spikes, item: s };
    for (const m of d.magnets || []) if (Math.hypot(p.x - m.x, p.z - m.z) <= 0.9) return { list: d.magnets, item: m };
    for (const key of ['walls', 'pits', 'ice']) {
      for (const r of d[key] || []) if (Math.abs(p.x - r.x) <= r.w / 2 && Math.abs(p.z - r.z) <= r.d / 2) return { list: d[key], item: r };
    }
    return null;
  }

  pointerDown(p, e) {
    if (!p || !this.inBoard(p)) return;
    const d = this.draft;
    if (this.tool === 'erase' || e.ctrlKey || e.button === 2) {
      const hit = this.itemAt(p);
      if (hit) { hit.list.splice(hit.list.indexOf(hit.item), 1); this.apply(); }
      return;
    }
    if (RECT_TOOLS.has(this.tool)) {
      this.drag = { x0: snap(p.x), z0: snap(p.z) };
      this.view.showRect({ x: this.drag.x0, z: this.drag.z0, w: 0.5, d: 0.5 }, this.tool);
      return;
    }
    const x = snap(p.x), z = snap(p.z);
    switch (this.tool) {
    case 'spike': (d.spikes = d.spikes || []).push({ x, z, r: 0.6 }); break;
    case 'plus': (d.magnets = d.magnets || []).push({ x, z, q: 1 }); break;
    case 'minus': (d.magnets = d.magnets || []).push({ x, z, q: -1 }); break;
    case 'start': d.start = [x, z]; break;
    case 'goal': d.goal = { x, z, r: 1.1 }; break;
    }
    this.apply();
  }

  pointerMove(p) {
    if (!this.drag || !p) return;
    const r = this.dragRect(p);
    this.view.showRect(r, this.tool);
  }

  dragRect(p) {
    const x1 = snap(Math.max(-this.draft.size[0] / 2, Math.min(this.draft.size[0] / 2, p.x)));
    const z1 = snap(Math.max(-this.draft.size[1] / 2, Math.min(this.draft.size[1] / 2, p.z)));
    const w = Math.max(0.5, Math.abs(x1 - this.drag.x0)), dd = Math.max(0.5, Math.abs(z1 - this.drag.z0));
    return { x: (x1 + this.drag.x0) / 2, z: (z1 + this.drag.z0) / 2, w, d: dd };
  }

  pointerUp(p) {
    if (!this.drag) return;
    const r = this.dragRect(p || { x: this.drag.x0, z: this.drag.z0 });
    this.drag = null;
    this.view.hideRect();
    if (r.w < 1 && r.d < 1) return;
    const key = this.tool === 'wall' ? 'walls' : this.tool === 'pit' ? 'pits' : 'ice';
    (this.draft[key] = this.draft[key] || []).push(r);
    this.apply();
  }

  // ---- out ----

  share() {
    const url = location.origin + location.pathname + '#' + encodeLevel(this.draft);
    navigator.clipboard && navigator.clipboard.writeText(url);
    this.status.textContent = 'link copied: ' + url.length + ' chars';
  }

  exportJson() {
    const json = JSON.stringify(this.draft, null, 2);
    navigator.clipboard && navigator.clipboard.writeText(json);
    this.status.textContent = 'JSON copied';
    console.log(json);
  }
}
