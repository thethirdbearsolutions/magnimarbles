import * as THREE from 'three';
import { MARBLE_RADIUS, MAGNET_RADIUS } from './physics.js';

function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function marbleTexture() {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#f2ead8'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#c8412f';
    g.beginPath(); g.arc(s * 0.3, s * 0.35, s * 0.18, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2f5fc8';
    g.beginPath(); g.arc(s * 0.75, s * 0.7, s * 0.14, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e0b03a';
    g.beginPath(); g.arc(s * 0.7, s * 0.25, s * 0.08, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(0, s * 0.55); g.bezierCurveTo(s * 0.3, s * 0.2, s * 0.6, s * 0.9, s, s * 0.5); g.stroke();
  });
}

function floorTexture() {
  const t = canvasTexture(256, (g, s) => {
    g.fillStyle = '#2a3a2a'; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(s, 0); g.moveTo(0, 0); g.lineTo(0, s); g.stroke();
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function glowTexture() {
  const t = canvasTexture(128, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,.9)');
    r.addColorStop(0.35, 'rgba(255,255,255,.25)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, s, s);
  });
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

const RED = 0xff5a4e, BLUE = 0x4ea1ff;

export class View {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setClearColor(0x0b0d12, 1);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.desktop = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0b0d12, 40, 90);

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
    this.camTarget = new THREE.Vector3();
    this.camPos = new THREE.Vector3();

    const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x1a2414, 0.7);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2dc, 1.6);
    sun.position.set(-8, 18, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -20; sun.shadow.camera.right = 20;
    sun.shadow.camera.top = 20; sun.shadow.camera.bottom = -20;
    sun.shadow.camera.far = 60;
    this.scene.add(sun);

    this.tex = { marble: marbleTexture(), floor: floorTexture(), glow: glowTexture() };
    this.raycaster = new THREE.Raycaster();
    this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.levelGroup = null;
    this.magnetMeshes = new Map();
    this.ghost = null;
    this.chaseDir = new THREE.Vector3(1, 0, 0);
    this.time = 0;

    addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.world) this.snapDesignCamera();
  }

  // ---- building ----

  buildLevel(world) {
    this.world = world;
    if (this.levelGroup) this.scene.remove(this.levelGroup);
    this.magnetMeshes.clear();
    const g = this.levelGroup = new THREE.Group();
    const [W, D] = world.level.size;

    // floor; on the desktop the floor is DOM wallpaper and WebGL only draws shadows on it
    const floorTex = this.tex.floor;
    floorTex.repeat.set(W / 2, D / 2);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D),
      this.desktop ? new THREE.ShadowMaterial({ opacity: 0.35 }) : new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    g.add(floor);

    // walls
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.8 });
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0x4d3b2a, roughness: 0.9 });
    for (const w of world.staticWalls) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w.w, w.h, w.d), w.edge ? edgeMat : wallMat);
      m.position.set(w.x, w.h / 2, w.z);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    }

    // pits
    for (const p of world.pits) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.d), new THREE.MeshBasicMaterial({ color: 0x000000 }));
      m.rotation.x = -Math.PI / 2; m.position.set(p.x, 0.01, p.z);
      g.add(m);
      const rim = new THREE.Mesh(new THREE.PlaneGeometry(p.w + 0.3, p.d + 0.3), new THREE.MeshBasicMaterial({ color: 0x141a14 }));
      rim.rotation.x = -Math.PI / 2; rim.position.set(p.x, 0.005, p.z);
      g.add(rim);
    }

    // ice
    for (const i of world.ice) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(i.w, i.d), new THREE.MeshStandardMaterial({ color: 0x9fd8ff, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.55 }));
      m.rotation.x = -Math.PI / 2; m.position.set(i.x, 0.02, i.z);
      g.add(m);
    }

    // spikes
    const spikeMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c8, roughness: 0.4, metalness: 0.5 });
    for (const s of world.spikes) {
      const cluster = new THREE.Group();
      const r = s.r || 0.5;
      for (let k = 0; k < 7; k++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 6), spikeMat);
        const a = k / 7 * Math.PI * 2, rr = k === 0 ? 0 : r * 0.6;
        cone.position.set(Math.cos(a) * rr, 0.45, Math.sin(a) * rr);
        cone.castShadow = true;
        cluster.add(cone);
      }
      const base = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.12, 16), new THREE.MeshStandardMaterial({ color: 0x5a1c1c }));
      base.position.y = 0.06;
      cluster.add(base);
      cluster.position.set(s.x, 0, s.z);
      g.add(cluster);
    }

    // goal
    const goal = world.goal;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(goal.r, 0.12, 12, 40), new THREE.MeshStandardMaterial({ color: 0x7ce07c, emissive: 0x2a6a2a, roughness: 0.4 }));
    ring.rotation.x = Math.PI / 2; ring.position.set(goal.x, 0.12, goal.z);
    g.add(ring);
    const cup = new THREE.Mesh(new THREE.CircleGeometry(goal.r - 0.05, 40), new THREE.MeshBasicMaterial({ color: 0x0a2a0a }));
    cup.rotation.x = -Math.PI / 2; cup.position.set(goal.x, 0.015, goal.z);
    g.add(cup);
    this.goalRing = ring;

    // start pad
    const [sx, sz] = world.level.start;
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.9, 32), new THREE.MeshBasicMaterial({ color: 0x25303f }));
    pad.rotation.x = -Math.PI / 2; pad.position.set(sx, 0.012, sz);
    g.add(pad);

    // fixed magnets
    for (const m of world.fixedMagnets) g.add(this.makeMagnetMesh(m));

    // marble
    const marble = new THREE.Mesh(new THREE.SphereGeometry(MARBLE_RADIUS, 40, 28), new THREE.MeshStandardMaterial({ map: this.tex.marble, roughness: 0.25, metalness: 0.05 }));
    marble.castShadow = true;
    g.add(marble);
    this.marbleMesh = marble;

    // trail
    this.trailGeom = new THREE.BufferGeometry();
    this.trailGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 600), 3));
    this.trailGeom.setDrawRange(0, 0);
    this.trailLine = new THREE.Line(this.trailGeom, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
    g.add(this.trailLine);

    // ghost for placement
    this.ghost = this.makeMagnetMesh({ q: 1, x: 0, z: 0, fixed: false }, true);
    this.ghost.visible = false;
    g.add(this.ghost);

    this.scene.add(g);
    this.syncMagnets(world);
    this.syncMarble(world);
    this.snapDesignCamera();
  }

  makeMagnetMesh(m, ghost = false) {
    const group = new THREE.Group();
    const color = m.q > 0 ? RED : BLUE;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(MAGNET_RADIUS, MAGNET_RADIUS, 0.5, 24),
      new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3, emissive: color, emissiveIntensity: 0.25, transparent: ghost, opacity: ghost ? 0.45 : 1 }));
    body.position.y = 0.25;
    body.castShadow = !ghost;
    group.add(body);
    if (m.fixed) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(MAGNET_RADIUS + 0.08, 0.06, 8, 32), new THREE.MeshStandardMaterial({ color: 0xd8d2c8, metalness: 0.7, roughness: 0.3 }));
      band.rotation.x = Math.PI / 2; band.position.y = 0.25;
      group.add(band);
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.glow, color, transparent: true, opacity: ghost ? 0.2 : 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
    const size = 4.5 * Math.sqrt(Math.abs(m.q));
    glow.scale.set(size, size, 1);
    glow.position.y = 0.3;
    group.add(glow);
    group.userData = { body, glow, magnet: m };
    group.position.set(m.x, 0, m.z);
    return group;
  }

  syncMagnets(world) {
    const live = new Set(world.magnets);
    for (const [m, mesh] of this.magnetMeshes) {
      if (!live.has(m)) { this.levelGroup.remove(mesh); this.magnetMeshes.delete(m); }
    }
    for (const m of world.magnets) {
      let mesh = this.magnetMeshes.get(m);
      if (!mesh) { mesh = this.makeMagnetMesh(m); this.magnetMeshes.set(m, mesh); this.levelGroup.add(mesh); }
      mesh.position.set(m.x, 0, m.z);
      const color = m.q > 0 ? RED : BLUE;
      mesh.userData.body.material.color.setHex(color);
      mesh.userData.body.material.emissive.setHex(color);
      mesh.userData.glow.material.color.setHex(color);
    }
  }

  syncMarble(world) {
    const b = world.marble;
    if (!b) return;
    this.marbleMesh.position.set(b.x, b.y, b.z);
    if (b.spinAngle > 0) {
      const axis = new THREE.Vector3(b.spinAxisX, 0, b.spinAxisZ);
      const q = new THREE.Quaternion().setFromAxisAngle(axis, b.spinAngle);
      this.marbleMesh.quaternion.premultiply(q);
    }
    // trail
    const pos = this.trailGeom.attributes.position;
    const n = Math.min(world.trail.length, 600);
    for (let i = 0; i < n; i++) { const p = world.trail[world.trail.length - n + i]; pos.setXYZ(i, p.x, 0.06, p.z); }
    pos.needsUpdate = true;
    this.trailGeom.setDrawRange(0, n);
  }

  showGhost(x, z, ok, q) {
    if (!this.ghost) return;
    this.ghost.visible = true;
    this.ghost.position.set(x, 0, z);
    const color = !ok ? 0x777777 : (q > 0 ? RED : BLUE);
    this.ghost.userData.body.material.color.setHex(color);
    this.ghost.userData.body.material.emissive.setHex(color);
    this.ghost.userData.glow.material.color.setHex(color);
  }
  hideGhost() { if (this.ghost) this.ghost.visible = false; }

  // the editor's drag rectangle
  showRect(r, tool) {
    if (!this.rectMesh) {
      this.rectMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
      this.rectMesh.rotation.x = -Math.PI / 2;
      this.rectMesh.renderOrder = 5;
      this.scene.add(this.rectMesh);
    }
    const color = tool === 'wall' ? 0xc9a070 : tool === 'pit' ? 0x000000 : 0x9fd8ff;
    this.rectMesh.material.color.setHex(color);
    this.rectMesh.visible = true;
    this.rectMesh.position.set(r.x, 0.6, r.z);
    this.rectMesh.scale.set(r.w, r.d, 1);
  }
  hideRect() { if (this.rectMesh) this.rectMesh.visible = false; }

  // ---- cameras ----

  snapDesignCamera() {
    const [W, D] = this.world.level.size;
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const dist = Math.max(W / (2 * Math.tan(fov / 2) * this.camera.aspect), D / (2 * Math.tan(fov / 2))) * 1.12;
    const shift = this.editShift || 0;
    const zoom = shift ? 1.3 : 1;   // editing: back off so the whole board clears the toolbar
    if (this.desktop) {
      // a stage seen from the front, the way Looking Glass showed a desktop
      this.designPos = new THREE.Vector3(0, dist * 0.55, dist * 0.95);
      this.designTarget = new THREE.Vector3(0, 1.5, 0);
    } else {
      this.designPos = new THREE.Vector3(0, dist * 0.92 * zoom, dist * 0.48 * zoom - shift);
      this.designTarget = new THREE.Vector3(0, 0, -shift);
    }
    this.camera.position.copy(this.designPos);
    this.camPos.copy(this.designPos);
    this.camTarget.copy(this.designTarget);
    this.camera.lookAt(this.camTarget);
  }

  setDesktop(on) {
    this.desktop = on;
    this.scene.fog = on ? null : new THREE.Fog(0x0b0d12, 40, 90);
    this.renderer.setClearColor(0x0b0d12, on ? 0 : 1);
  }

  updateCamera(world, phase, dt) {
    const k = 1 - Math.exp(-dt * 3.5);
    let wantPos, wantTarget;
    if (phase === 'run' && world.marble) {
      const b = world.marble;
      const v = new THREE.Vector3(b.vx, 0, b.vz);
      if (v.lengthSq() > 1) this.chaseDir.lerp(v.normalize(), k).normalize();
      wantTarget = new THREE.Vector3(b.x, b.y, b.z);
      wantPos = wantTarget.clone().addScaledVector(this.chaseDir, -9).add(new THREE.Vector3(0, 7, 0));
    } else {
      wantPos = this.designPos;
      wantTarget = this.designTarget;
    }
    this.camPos.lerp(wantPos, k);
    this.camTarget.lerp(wantTarget, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);
  }

  // ---- picking ----

  pickFloor(clientX, clientY) { return this.pickAt(clientX, clientY, 0); }

  /** Where the pointer ray crosses the horizontal plane at height y. */
  pickAt(clientX, clientY, y) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    const plane = y === 0 ? this.floorPlane : new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
    if (!this.raycaster.ray.intersectPlane(plane, hit)) return null;
    return { x: hit.x, z: hit.z };
  }

  // ---- frame ----

  render(world, phase, dt) {
    this.time += dt;
    this.syncMarble(world);
    for (const mesh of this.magnetMeshes.values()) {
      const s = 4.5 * (1 + 0.06 * Math.sin(this.time * 4));
      mesh.userData.glow.scale.set(s, s, 1);
    }
    if (this.goalRing) this.goalRing.rotation.z = this.time * 0.6;
    this.updateCamera(world, phase, dt);
    this.renderer.render(this.scene, this.camera);
  }
}
