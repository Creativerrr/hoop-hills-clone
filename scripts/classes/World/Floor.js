import * as THREE from "three";

// Court floor at the base of the terrain: soft drop shadow, subtle grid,
// white period boundary lines, and Q1–OT labels (matching the original).
export default class Floor {
  constructor(world, opts) {
    this.world = world;
    this.group = new THREE.Group();

    const { sizeX, sizeZ, bottomY, wps, offX } = opts;
    const padX = sizeX * 0.18;
    const padZ = sizeZ * 0.06;
    const w = sizeX + padX * 2;
    const d = sizeZ + padZ * 2;
    const y = bottomY - sizeX * 0.015;
    const hz = d / 2;

    this.addShadow(w, d, y, sizeX, sizeZ);
    this.addCourt(sizeX * 1.04, sizeZ * 1.04, y);
    this.addGrid(w, d, y);
    this.addPeriods(wps, offX, hz, y, sizeZ);
  }

  // faint basketball-court watermark under the terrain
  addCourt(w, d, y) {
    const c = document.createElement("canvas");
    c.width = 1024; c.height = 1024;
    const ctx = c.getContext("2d");
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 4;
    const W = 1024, H = 1024, m = 70;
    ctx.strokeRect(m, m, W - 2 * m, H - 2 * m); // boundary
    ctx.beginPath(); ctx.moveTo(W / 2, m); ctx.lineTo(W / 2, H - m); ctx.stroke(); // half-court line
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 110, 0, Math.PI * 2); ctx.stroke(); // center circle
    // two keys + free-throw circles
    const keyW = 150, keyH = 230;
    for (const side of [m, W - m - keyH]) {
      ctx.strokeRect(side, H / 2 - keyW / 2, keyH, keyW);
      const cx = side < W / 2 ? side + keyH : side;
      ctx.beginPath(); ctx.arc(cx, H / 2, 75, 0, Math.PI * 2); ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.32, depthWrite: false })
    );
    plane.rotation.x = -Math.PI / 2;
    plane.rotation.z = Math.PI / 2; // align long axis of court with the games depth
    plane.position.y = y - 0.15;
    this.group.add(plane);
  }

  // soft radial drop shadow under the terrain
  addShadow(w, d, y, sizeX, sizeZ) {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
    g.addColorStop(0, "rgba(40,55,90,0.30)");
    g.addColorStop(0.6, "rgba(40,55,90,0.12)");
    g.addColorStop(1, "rgba(40,55,90,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(sizeX * 1.6, sizeZ * 1.15),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = y - 0.5;
    this.group.add(plane);
  }

  addGrid(w, d, y) {
    const positions = [];
    const stepX = w / 22, stepZ = d / 26;
    const hx = w / 2, hz = d / 2;
    for (let x = -hx; x <= hx + 1e-6; x += stepX) positions.push(x, 0, -hz, x, 0, hz);
    for (let z = -hz; z <= hz + 1e-6; z += stepZ) positions.push(-hx, 0, z, hx, 0, z);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const lines = new THREE.LineSegments(
      geom,
      new THREE.LineBasicMaterial({ color: 0xaab6cc, transparent: true, opacity: 0.4 })
    );
    lines.position.y = y;
    this.group.add(lines);
  }

  // white period boundary lines + Q1..OT labels running along the time axis
  addPeriods(wps, offX, hz, y, sizeZ) {
    const boundaries = [0, 720, 1440, 2160, 2880];
    const positions = [];
    for (const t of boundaries) {
      const x = t * wps + offX;
      positions.push(x, 0, -hz, x, 0, hz);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const lines = new THREE.LineSegments(
      geom,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1.0 })
    );
    lines.position.y = y + 0.2;
    this.group.add(lines);

    const labels = [["Q1", 360], ["Q2", 1080], ["Q3", 1800], ["Q4", 2520], ["OT", 3060]];
    for (const [text, t] of labels) {
      this.addLabel(text, t * wps + offX, y, hz + sizeZ * 0.04);
    }
  }

  // billboarded sprite label — readable from the low camera angle
  addLabel(text, x, y, z) {
    const c = document.createElement("canvas");
    c.width = 128; c.height = 64;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#6b7a95";
    ctx.font = "bold 38px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 64, 34);
    const tex = new THREE.CanvasTexture(c);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false })
    );
    sprite.scale.set(13, 6.5, 1);
    sprite.position.set(x, y + 4, z);
    this.group.add(sprite);
  }
}
