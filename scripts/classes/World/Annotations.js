import * as THREE from "three";

// Floating callouts: 3D markers at notable moments + HTML labels projected to screen each frame.
export default class Annotations {
  constructor(world, games, hills) {
    this.world = world;
    this.hills = hills;
    this.group = new THREE.Group();
    this.items = [];
    this.container = document.getElementById("annotations");
    if (this.container) this.container.innerHTML = "";
    this._v = new THREE.Vector3();
    this.build(games);
  }

  // the sample where pd is most extreme (min/max) in a game
  extremeSample(game, kind) {
    let best = game.samples[0];
    let val = kind === "max" ? -Infinity : Infinity;
    for (const s of game.samples) {
      if (kind === "max" ? s.pd > val : s.pd < val) { val = s.pd; best = s; }
    }
    return best;
  }

  anchor(game, sample) {
    const wps = this.hills.widthPerSecond;
    const hpp = this.hills.heightPerPoint;
    const z = this.hills.zForOrder(game.order) + this.hills.depth / 2;
    return new THREE.Vector3(sample.t * wps, sample.pd * hpp, z);
  }

  add(game, sample, text, color) {
    if (!game || !sample) return;
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(2.4, 14, 14),
      new THREE.MeshBasicMaterial({ color })
    );
    marker.position.copy(this.anchor(game, sample));
    this.group.add(marker);

    let el = null;
    if (this.container) {
      el = document.createElement("div");
      el.className = "annotation";
      el.innerHTML = `<span class="dot" style="background:${color}"></span>${text}`;
      this.container.appendChild(el);
    }
    this.items.push({ marker, el });
  }

  build(games) {
    const wins = games.filter((g) => g.win);
    const losses = games.filter((g) => !g.win);
    const comeback = wins.reduce((a, g) => (g.maxTrail < (a?.maxTrail ?? Infinity) ? g : a), null);
    const collapse = losses.reduce((a, g) => (g.maxLead > (a?.maxLead ?? -Infinity) ? g : a), null);
    const biggestWin = wins.reduce((a, g) => (g.finalDiff > (a?.finalDiff ?? -Infinity) ? g : a), null);

    if (comeback && comeback.maxTrail < 0)
      this.add(comeback, this.extremeSample(comeback, "min"),
        `Biggest comeback · from ${comeback.maxTrail} vs ${comeback.opponent}`, "#3a7bd5");
    if (collapse && collapse.maxLead > 0)
      this.add(collapse, this.extremeSample(collapse, "max"),
        `Worst collapse · blew +${collapse.maxLead} vs ${collapse.opponent}`, "#d8463e");
    if (biggestWin && biggestWin !== comeback)
      this.add(biggestWin, this.extremeSample(biggestWin, "max"),
        `Biggest win · +${biggestWin.finalDiff} vs ${biggestWin.opponent}`, "#2b63b0");
  }

  update(camera, width, height) {
    for (const it of this.items) {
      if (!it.el) continue;
      it.marker.getWorldPosition(this._v);
      this._v.project(camera);
      const x = (this._v.x * 0.5 + 0.5) * width;
      const y = (-this._v.y * 0.5 + 0.5) * height;
      it.el.style.left = `${x}px`;
      it.el.style.top = `${y}px`;
      it.el.style.display = this._v.z < 1 ? "block" : "none";
    }
  }

  dispose() {
    this.items.forEach((it) => {
      it.el?.remove();
      it.marker.geometry.dispose();
      it.marker.material.dispose();
    });
    this.items = [];
  }
}
