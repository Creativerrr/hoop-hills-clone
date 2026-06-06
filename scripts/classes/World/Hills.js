import * as THREE from "three";
import { interpolateBlues, interpolateReds } from "d3";

// Builds the terrain: one ridge ("hill") per game.
// X = game time, Y = point differential, Z = game order. Blue above 0, red below.
const PERIOD_WINDOWS = {
  Q1: [0, 720],
  Q2: [720, 1440],
  Q3: [1440, 2160],
  Q4: [2160, 2880],
  OT: [2880, 1e9],
};

export default class Hills {
  constructor(world, games, options = {}) {
    this.world = world;
    this.games = games;
    this.periods = options.periods || new Set(["Q1", "Q2", "Q3", "Q4", "OT"]);
    this.windows = [...this.periods]
      .map((p) => PERIOD_WINDOWS[p])
      .filter(Boolean)
      .sort((a, b) => a[0] - b[0]);

    // encoding constants (exact values from the original source)
    this.widthPerSecond = 100 / 2880; // a regulation game (2880s) ≈ 100 units wide
    this.heightPerPoint = 0.75; // 1 point of differential = 0.75 units tall (original relief)
    this.depth = 1.3; // per-game ridge depth → ~square-ish footprint like the original
    this.gap = 0;

    // EXACT original palette: d3.interpolateBlues / interpolateReds on a FIXED ±50-point
    // scale. A 1-pt lead → dark blue; a 50-pt lead → near-white. Same for trails in red.
    // This is what gives the "snow-capped" look: peaks & valleys fade to white.
    this.tied = new THREE.Color("#201853"); // dark navy/purple for pd === 0 (legend.tied)
    this._c = new THREE.Color();

    this.group = new THREE.Group();
    this.meshes = [];

    this.build();
  }

  zForOrder(order) {
    return (this.depth + this.gap) * order;
  }

  // point differential holding at elapsed time t (step function)
  pdAtTime(game, t) {
    let pd = 0;
    for (const s of game.samples) { if (s.t <= t) pd = s.pd; else break; }
    return pd;
  }

  // EXACT original color mapping (Hill.js): color by point differential on a fixed
  // ±50 scale. leading → interpolateBlues((50-pd)/49); trailing → interpolateReds((pd+50)/51).
  // Big leads/trails approach white (peaks & valleys), small ones are dark & saturated.
  colorForPd(pd) {
    if (pd > 0) {
      const v = Math.max(0, Math.min(1, (50 - pd) / 49));
      return this._c.set(interpolateBlues(v));
    }
    if (pd < 0) {
      const v = Math.max(0, Math.min(1, (pd + 50) / 51));
      return this._c.set(interpolateReds(v));
    }
    return this._c.copy(this.tied);
  }

  build() {
    // double-sided so trailing boxes (which hang below y=0) still read from straight above
    const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });

    // global height range for a consistent color scale across all games
    let maxLead = 0, maxTrail = 0;
    for (const g of this.games) {
      if (g.maxLead > maxLead) maxLead = g.maxLead;
      if (g.maxTrail < maxTrail) maxTrail = g.maxTrail;
    }
    this.maxH = Math.max(0.001, maxLead * this.heightPerPoint);
    this.minH = Math.min(-0.001, maxTrail * this.heightPerPoint);

    this.games.forEach((game) => {
      const geom = this.buildGameGeometry(game);
      if (!geom) return;
      const mesh = new THREE.Mesh(geom, material);
      mesh.userData.game = game;
      this.group.add(mesh);
      this.meshes.push(mesh);
    });

    // center the whole terrain on the origin
    const box = new THREE.Box3().setFromObject(this.group);
    const center = box.getCenter(new THREE.Vector3());
    this.group.position.set(-center.x, 0, -center.z);
  }

  buildGameGeometry(game) {
    const samples = game.samples;
    if (!samples || samples.length < 2) return null;

    const wps = this.widthPerSecond;
    const hpp = this.heightPerPoint;
    const z0 = this.zForOrder(game.order);
    const z1 = z0 + this.depth;

    const positions = [];
    const colors = [];

    // one step-box per interval [t_i, t_{i+1}] at height pd_i, clipped to active periods
    for (let i = 0; i < samples.length - 1; i++) {
      const s = samples[i];
      const t0 = s.t;
      const t1 = samples[i + 1].t;
      if (t1 <= t0) continue;
      const h = s.pd * hpp;
      if (h === 0) continue;

      const base = this.colorForPd(s.pd);
      const yLo = Math.min(0, h);
      const yHi = Math.max(0, h);

      // clip this interval against each active period window
      for (const [ws, we] of this.windows) {
        const cs = Math.max(t0, ws);
        const ce = Math.min(t1, we);
        if (ce <= cs) continue;
        const x0 = cs * wps;
        const x1 = ce * wps;

        // original uses a flat single-color box per play; keep only a whisper of face
        // shading so same-height plateaus still read as 3D, otherwise faithful to flat
        const S = { top: 1.0, front: 0.95, side: 0.9 };
        this.pushQuad(positions, colors, [x0, h, z0], [x1, h, z0], [x1, h, z1], [x0, h, z1], base, S.top);
        this.pushQuad(positions, colors, [x0, yLo, z0], [x1, yLo, z0], [x1, yHi, z0], [x0, yHi, z0], base, S.front);
        this.pushQuad(positions, colors, [x1, yLo, z1], [x0, yLo, z1], [x0, yHi, z1], [x1, yHi, z1], base, S.front);
        this.pushQuad(positions, colors, [x0, yLo, z1], [x0, yLo, z0], [x0, yHi, z0], [x0, yHi, z1], base, S.side);
        this.pushQuad(positions, colors, [x1, yLo, z0], [x1, yLo, z1], [x1, yHi, z1], [x1, yHi, z0], base, S.side);
      }
    }

    // dark "win-margin" mark at the final score (original: navy 0x201853 cube at game end).
    // From the side view these line up into the dark margin profile the story calls out.
    const last = samples[samples.length - 1];
    const fh = game.finalDiff * hpp;
    if (last) {
      const xEnd = Math.min(last.t, 2880) * wps;
      const mW = 0.7, mH = 0.4;
      const xA = xEnd - mW, xB = xEnd;
      const yA = fh - mH / 2, yB = fh + mH / 2;
      const navy = this.tied;
      this.pushQuad(positions, colors, [xA, yB, z0], [xB, yB, z0], [xB, yB, z1], [xA, yB, z1], navy, 1);
      this.pushQuad(positions, colors, [xA, yA, z0], [xB, yA, z0], [xB, yB, z0], [xA, yB, z0], navy, 1);
      this.pushQuad(positions, colors, [xB, yA, z1], [xA, yA, z1], [xA, yB, z1], [xB, yB, z1], navy, 1);
      this.pushQuad(positions, colors, [xA, yA, z1], [xA, yA, z0], [xA, yB, z0], [xA, yB, z1], navy, 1);
      this.pushQuad(positions, colors, [xB, yA, z0], [xB, yA, z1], [xB, yB, z1], [xB, yB, z0], navy, 1);
    }

    if (positions.length === 0) return null;

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geom.computeBoundingBox();
    return geom;
  }

  // push two triangles (a, b, c) + (a, c, d) with a subtly shaded base color
  pushQuad(positions, colors, a, b, c, d, baseColor, shade = 1) {
    const r = baseColor.r * shade, g = baseColor.g * shade, bl = baseColor.b * shade;
    const verts = [a, b, c, a, c, d];
    for (const v of verts) {
      positions.push(v[0], v[1], v[2]);
      colors.push(r, g, bl);
    }
  }

  dispose() {
    this.meshes.forEach((m) => m.geometry.dispose());
    this.meshes.forEach((m) => m.material.dispose?.());
  }
}
