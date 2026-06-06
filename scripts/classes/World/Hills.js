import * as THREE from "three";

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

    // encoding constants (from the original)
    this.widthPerSecond = 100 / 2880; // a regulation game (2880s) ≈ 100 units wide
    this.heightPerPoint = 0.58; // 1 point of differential = 0.58 units tall (relief like the original)
    this.depth = 1.3; // per-game ridge depth → ~square-ish footprint like the original
    this.gap = 0;

    // vivid diverging palette — lighten toward light-but-SATURATED hues (not washed
    // lavender/peach) so the flat top-view heatmap stays vivid like the original
    this.blueLow = new THREE.Color(0x1c5db0); // leading, near baseline (deep saturated blue)
    this.blueHigh = new THREE.Color(0x66a3ea); // biggest leads (light but saturated blue)
    this.redLow = new THREE.Color(0xd22e20); // trailing, near baseline (deep saturated red)
    this.redHigh = new THREE.Color(0xfa6a45); // deepest trails (bright saturated orange)
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

  // map a segment's top height to a base color (lighting adds the tonal depth on top)
  colorForHeight(h) {
    if (h >= 0) {
      const t = this.maxH > 0 ? Math.min(1, h / this.maxH) : 0;
      return this._c.copy(this.blueLow).lerp(this.blueHigh, Math.pow(t, 1.4));
    }
    const t = this.minH < 0 ? Math.min(1, h / this.minH) : 0;
    return this._c.copy(this.redLow).lerp(this.redHigh, Math.pow(t, 1.4));
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

      const base = this.colorForHeight(h);
      const yLo = Math.min(0, h);
      const yHi = Math.max(0, h);

      // clip this interval against each active period window
      for (const [ws, we] of this.windows) {
        const cs = Math.max(t0, ws);
        const ce = Math.min(t1, we);
        if (ce <= cs) continue;
        const x0 = cs * wps;
        const x1 = ce * wps;

        const S = { top: 1.0, front: 0.93, side: 0.84 };
        this.pushQuad(positions, colors, [x0, h, z0], [x1, h, z0], [x1, h, z1], [x0, h, z1], base, S.top);
        this.pushQuad(positions, colors, [x0, yLo, z0], [x1, yLo, z0], [x1, yHi, z0], [x0, yHi, z0], base, S.front);
        this.pushQuad(positions, colors, [x1, yLo, z1], [x0, yLo, z1], [x0, yHi, z1], [x1, yHi, z1], base, S.front);
        this.pushQuad(positions, colors, [x0, yLo, z1], [x0, yLo, z0], [x0, yHi, z0], [x0, yHi, z1], base, S.side);
        this.pushQuad(positions, colors, [x1, yLo, z0], [x1, yLo, z1], [x1, yHi, z1], [x1, yHi, z0], base, S.side);
      }
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
