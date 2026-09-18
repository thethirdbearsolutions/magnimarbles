// The whole game is in here. y is up, the board lies on the XZ plane.
// Units are meters and seconds, more or less.

export const MARBLE_RADIUS = 0.5;
export const MARBLE_MASS = 1;
export const MARBLE_CHARGE = 1;
export const MAGNET_RADIUS = 0.6;     // the physical puck the marble bumps into
export const MAGNET_CHARGE = 1;       // |q| of a placed magnet
export const GRAVITY = 9.8;
export const COULOMB = 80;            // F = COULOMB * q1 * q2 / r^2
export const SOFTENING = 1.2;         // r is never taken smaller than this
export const MU_FLOOR = 0.08;          // rolling resistance, as a deceleration
export const MU_ICE = 0.01;
export const WALL_RESTITUTION = 0.6;
export const MAGNET_RESTITUTION = 0.4;
export const MAX_SPEED = 28;
export const RUN_TIME_LIMIT = 45;     // seconds before a run is called off
export const SUBSTEPS = 4;

export const ALIVE = 'alive';
export const WON = 'won';
export const FELL = 'fell';           // into a pit
export const SPIKED = 'spiked';
export const TIMED_OUT = 'timed out';
export const STUCK = 'stuck';         // came to rest away from the goal

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/** A rectangle on the board: center (x, z), full size (w, d). */
export function inRect(px, pz, r) {
  return Math.abs(px - r.x) <= r.w / 2 && Math.abs(pz - r.z) <= r.d / 2;
}

/** Sphere (in the XZ plane, radius rad) against an axis-aligned box.
 *  Returns null or { nx, nz, depth } with the outward normal. */
function circleVsRect(px, pz, rad, r) {
  const cx = clamp(px, r.x - r.w / 2, r.x + r.w / 2);
  const cz = clamp(pz, r.z - r.d / 2, r.z + r.d / 2);
  let dx = px - cx, dz = pz - cz;
  let d2 = dx * dx + dz * dz;
  if (d2 > rad * rad) return null;
  if (d2 === 0) {
    // center is inside the box: push out through the nearest face
    const left = px - (r.x - r.w / 2), right = (r.x + r.w / 2) - px;
    const back = pz - (r.z - r.d / 2), front = (r.z + r.d / 2) - pz;
    const m = Math.min(left, right, back, front);
    if (m === left) return { nx: -1, nz: 0, depth: left + rad };
    if (m === right) return { nx: 1, nz: 0, depth: right + rad };
    if (m === back) return { nx: 0, nz: -1, depth: back + rad };
    return { nx: 0, nz: 1, depth: front + rad };
  }
  const d = Math.sqrt(d2);
  return { nx: dx / d, nz: dz / d, depth: rad - d };
}

export class Marble {
  constructor(x, z, vx = 0, vz = 0) {
    this.x = x; this.y = MARBLE_RADIUS; this.z = z;
    this.vx = vx; this.vy = 0; this.vz = vz;
    this.falling = false;
    // spin, as a quaternion-free axis/angle accumulator the renderer reads
    this.spinAxisX = 0; this.spinAxisZ = 0; this.spinAngle = 0;
  }
  speed() { return Math.hypot(this.vx, this.vz); }
}

export class Magnet {
  constructor(x, z, q, fixed = false) {
    this.x = x; this.z = z; this.q = q; this.fixed = fixed;
  }
}

/** A level as loaded, plus the player's magnets and the running marble. */
export class World {
  constructor(level) {
    this.level = level;
    this.width = level.size[0];
    this.depth = level.size[1];
    // the board edge is a wall all the way round
    const W = this.width, D = this.depth, t = 1;
    this.walls = [
      { x: 0, z: -D / 2 - t / 2, w: W + 2 * t, d: t, h: 1, edge: true },
      { x: 0, z: D / 2 + t / 2, w: W + 2 * t, d: t, h: 1, edge: true },
      { x: -W / 2 - t / 2, z: 0, w: t, d: D, h: 1, edge: true },
      { x: W / 2 + t / 2, z: 0, w: t, d: D, h: 1, edge: true },
      ...(level.walls || []).map(w => ({ h: 1, ...w })),
    ];
    this.pits = level.pits || [];
    this.spikes = level.spikes || [];
    this.ice = level.ice || [];
    this.goal = level.goal;
    this.fixedMagnets = (level.magnets || []).map(m => new Magnet(m.x, m.z, m.q, true));
    this.magnets = [];          // the player's
    this.budget = level.budget;
    this.tilt = level.tilt || [0, 0];   // gravity component along x and z
    this.marble = null;
    this.state = ALIVE;
    this.time = 0;
    this.trail = [];
  }

  allMagnets() { return this.fixedMagnets.concat(this.magnets); }

  /** Can a player magnet go here? */
  canPlace(x, z, ignore = null) {
    if (Math.abs(x) > this.width / 2 - MAGNET_RADIUS || Math.abs(z) > this.depth / 2 - MAGNET_RADIUS) return false;
    for (const w of this.walls) if (circleVsRect(x, z, MAGNET_RADIUS, w)) return false;
    for (const p of this.pits) if (inRect(x, z, p)) return false;
    if (Math.hypot(x - this.goal.x, z - this.goal.z) < this.goal.r + MAGNET_RADIUS) return false;
    if (Math.hypot(x - this.level.start[0], z - this.level.start[1]) < MARBLE_RADIUS + MAGNET_RADIUS + 0.2) return false;
    for (const m of this.allMagnets()) {
      if (m === ignore) continue;
      if (Math.hypot(x - m.x, z - m.z) < 2 * MAGNET_RADIUS + 0.1) return false;
    }
    return true;
  }

  magnetAt(x, z) {
    for (const m of this.magnets) if (Math.hypot(x - m.x, z - m.z) <= MAGNET_RADIUS + 0.2) return m;
    return null;
  }

  place(x, z, q = MAGNET_CHARGE) {
    if (this.magnets.length >= this.budget || !this.canPlace(x, z)) return null;
    const m = new Magnet(x, z, q);
    this.magnets.push(m);
    return m;
  }

  remove(m) { this.magnets = this.magnets.filter(o => o !== m); }

  /** Put the marble at the start, ready to run. */
  reset() {
    const [sx, sz] = this.level.start;
    const [vx, vz] = this.level.startVelocity || [0, 0];
    this.marble = new Marble(sx, sz, vx, vz);
    this.state = ALIVE;
    this.time = 0;
    this.restTime = 0;
    this.trail = [];
  }

  /** Net force on the marble from every magnet, in the XZ plane. */
  magneticForce(px, pz) {
    let fx = 0, fz = 0;
    for (const m of this.allMagnets()) {
      let dx = px - m.x, dz = pz - m.z;
      let r2 = dx * dx + dz * dz;
      if (r2 < SOFTENING * SOFTENING) r2 = SOFTENING * SOFTENING;
      const r = Math.sqrt(dx * dx + dz * dz) || 1e-6;
      // like charges repel, so a positive product pushes the marble away
      const f = COULOMB * m.q * MARBLE_CHARGE / r2;
      fx += f * dx / r;
      fz += f * dz / r;
    }
    return [fx, fz];
  }

  frictionAt(px, pz) {
    for (const i of this.ice) if (inRect(px, pz, i)) return MU_ICE;
    return MU_FLOOR;
  }

  step(dt) {
    if (this.state !== ALIVE) return this.state;
    const h = dt / SUBSTEPS;
    for (let s = 0; s < SUBSTEPS; s++) {
      this.substep(h);
      if (this.state !== ALIVE) break;
    }
    return this.state;
  }

  substep(h) {
    const b = this.marble;
    this.time += h;

    if (b.falling) {
      b.vy -= GRAVITY * h;
      b.y += b.vy * h;
      b.x += b.vx * h; b.z += b.vz * h;
      if (b.y < -6) this.state = FELL;
      return;
    }

    // forces
    let [fx, fz] = this.magneticForce(b.x, b.z);
    fx += MARBLE_MASS * GRAVITY * this.tilt[0];
    fz += MARBLE_MASS * GRAVITY * this.tilt[1];
    b.vx += fx / MARBLE_MASS * h;
    b.vz += fz / MARBLE_MASS * h;

    // rolling resistance
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > 0) {
      const mu = this.frictionAt(b.x, b.z);
      const dec = Math.min(sp, mu * GRAVITY * h);
      b.vx -= dec * b.vx / sp;
      b.vz -= dec * b.vz / sp;
    }
    const sp2 = Math.hypot(b.vx, b.vz);
    if (sp2 > MAX_SPEED) { b.vx *= MAX_SPEED / sp2; b.vz *= MAX_SPEED / sp2; }

    // move
    b.x += b.vx * h;
    b.z += b.vz * h;

    // spin for the renderer: rolling without slipping, axis = up x v
    const dist = sp2 * h;
    if (sp2 > 1e-4) {
      b.spinAxisX = -b.vz / sp2; b.spinAxisZ = b.vx / sp2;
      b.spinAngle = dist / MARBLE_RADIUS;
    } else {
      b.spinAngle = 0;
    }

    // walls
    for (const w of this.walls) {
      const c = circleVsRect(b.x, b.z, MARBLE_RADIUS, w);
      if (!c) continue;
      b.x += c.nx * c.depth; b.z += c.nz * c.depth;
      const vn = b.vx * c.nx + b.vz * c.nz;
      if (vn < 0) {
        b.vx -= (1 + WALL_RESTITUTION) * vn * c.nx;
        b.vz -= (1 + WALL_RESTITUTION) * vn * c.nz;
        this.onBounce && this.onBounce('wall', Math.abs(vn));
      }
    }

    // magnets are pucks
    for (const m of this.allMagnets()) {
      const dx = b.x - m.x, dz = b.z - m.z;
      const d = Math.hypot(dx, dz);
      const minD = MARBLE_RADIUS + MAGNET_RADIUS;
      if (d < minD && d > 0) {
        const nx = dx / d, nz = dz / d;
        b.x += nx * (minD - d); b.z += nz * (minD - d);
        const vn = b.vx * nx + b.vz * nz;
        if (vn < 0) {
          b.vx -= (1 + MAGNET_RESTITUTION) * vn * nx;
          b.vz -= (1 + MAGNET_RESTITUTION) * vn * nz;
          this.onBounce && this.onBounce('magnet', Math.abs(vn));
        }
      }
    }

    // spikes
    for (const sp of this.spikes) {
      if (Math.hypot(b.x - sp.x, b.z - sp.z) < MARBLE_RADIUS + (sp.r || 0.5)) {
        this.state = SPIKED;
        return;
      }
    }

    // goal
    if (Math.hypot(b.x - this.goal.x, b.z - this.goal.z) < this.goal.r) {
      this.state = WON;
      return;
    }

    // pits
    for (const p of this.pits) {
      if (inRect(b.x, b.z, p)) {
        b.falling = true;
        return;
      }
    }

    // trail for the renderer, ten points a second
    if (this.trail.length === 0 || this.time - this.trail[this.trail.length - 1].t > 0.1) {
      this.trail.push({ x: b.x, z: b.z, t: this.time });
    }

    if (this.time > RUN_TIME_LIMIT) { this.state = TIMED_OUT; return; }
    // resting away from the goal for a second and a half ends the run
    if (sp2 < 0.05) {
      this.restTime += h;
      if (this.restTime > 1.5) this.state = STUCK;
    } else {
      this.restTime = 0;
    }
  }
}
