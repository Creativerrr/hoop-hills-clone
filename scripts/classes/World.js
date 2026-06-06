import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import Hills from "./World/Hills.js";
import Floor from "./World/Floor.js";
import Annotations from "./World/Annotations.js";

// The 3D engine: orthographic scene + camera + renderer + controls + the hills.
export default class World {
  constructor(app, canvas) {
    this.app = app;
    this.canvas = canvas;

    this.scene = new THREE.Scene();
    this.scene.background = null; // let the CSS gradient show through

    this.setupRenderer();
    this.setupCamera();
    this.setupControls();
    this.setupLights();

    this.hills = null;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.hovered = null;
    this.setupHover();

    const gizmo = document.getElementById("logo");
    if (gizmo) this.bindGizmo(gizmo);

    window.addEventListener("resize", () => this.onResize());
    this.animate = this.animate.bind(this);
    this.renderer.setAnimationLoop(this.animate);
  }

  setupHover() {
    this.canvas.addEventListener("pointermove", (e) => {
      this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
      this.pointerClient = { x: e.clientX, y: e.clientY };
      this.checkHover();
    });
    this.canvas.addEventListener("pointerleave", () => {
      this.hovered = null;
      this.app.onHover?.(null);
    });
  }

  // ViewCube: drag to free-rotate, click a face to snap to a canonical view
  VIEWS = {
    perspective: [225, 33], // 3/4 hero
    top: [270, 89.5],       // straight down, axis-aligned → heat map
    front: [270, 1.5],      // along games axis → line chart (time × margin)
    side: [180, 1.5],       // along time axis → bar chart (games × final margin)
  };

  bindGizmo(el) {
    let down = false, moved = false, lx = 0, ly = 0, startView = null;
    el.addEventListener("pointerdown", (e) => {
      down = true; moved = false; lx = e.clientX; ly = e.clientY;
      startView = e.target?.dataset?.view || null;
      el.setPointerCapture(e.pointerId); el.classList.add("grabbing"); e.preventDefault();
    });
    el.addEventListener("pointermove", (e) => {
      if (!down) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      lx = e.clientX; ly = e.clientY;
      if (moved) this.orbitDelta(-dx * 0.011, dy * 0.011);
    });
    const end = (e) => {
      if (down && !moved && startView && this.VIEWS[startView]) {
        this.snapToView(...this.VIEWS[startView]);
      }
      down = false; el.classList.remove("grabbing");
      try { el.releasePointerCapture(e.pointerId); } catch {}
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  posForView(azDeg, elDeg) {
    const az = THREE.MathUtils.degToRad(azDeg), el = THREE.MathUtils.degToRad(elDeg);
    const c = this.controls.target;
    return new THREE.Vector3(
      c.x + this.reach * Math.cos(el) * Math.cos(az),
      c.y + this.reach * Math.sin(el),
      c.z + this.reach * Math.cos(el) * Math.sin(az)
    );
  }

  snapToView(azDeg, elDeg) {
    this.snap = { from: this.camera.position.clone(), to: this.posForView(azDeg, elDeg), t: 0 };
  }

  orbitDelta(dTheta, dPhi) {
    this.snap = null; // manual drag cancels any running snap
    const offset = this.camera.position.clone().sub(this.controls.target);
    const sph = new THREE.Spherical().setFromVector3(offset);
    sph.theta += dTheta;
    sph.phi = Math.max(0.012, Math.min(Math.PI / 2 - 0.02, sph.phi + dPhi));
    offset.setFromSpherical(sph);
    this.camera.position.copy(this.controls.target).add(offset);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
  }

  checkHover() {
    if (!this.hills) return;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.hills.meshes, false);
    if (!hits.length) {
      if (this.hovered) { this.hovered = null; this.app.onHover?.(null); }
      return;
    }
    const game = hits[0].object.userData.game;
    // moment under the cursor: convert the hit's world-x back to game time → point differential
    const localX = hits[0].point.x - this.hills.group.position.x;
    const t = localX / this.hills.widthPerSecond;
    const pd = this.hills.pdAtTime(game, t);
    this.hovered = game;
    this.app.onHover?.(game, this.pointerClient, pd);
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  setupCamera() {
    // Orthographic camera = the whole trick. Far games stay as big as near ones.
    const aspect = window.innerWidth / window.innerHeight;
    this.frustum = 220; // world-units of vertical view; tuned after data loads
    this.camera = new THREE.OrthographicCamera(
      (-this.frustum * aspect) / 2,
      (this.frustum * aspect) / 2,
      this.frustum / 2,
      -this.frustum / 2,
      -2000,
      4000
    );
    // 3/4 hero angle via spherical-ish placement
    this.camera.position.set(380, 240, 380);
    this.camera.lookAt(0, 0, 0);
  }

  setupControls() {
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = true;
    this.controls.target.set(0, 0, 0);
    this.controls.autoRotate = false; // static hero angle, like the original
  }

  setupLights() {
    // bright ambient so the vivid base colors read; gentle directional for subtle depth
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const key = new THREE.DirectionalLight(0xffffff, 0.35);
    key.position.set(0.3, 1.2, 0.6); // upper-front so the faces we see stay vivid
    this.scene.add(key);
    const back = new THREE.DirectionalLight(0xffffff, 0.22);
    back.position.set(-0.3, 0.8, -1); // slight back rim for depth
    this.scene.add(back);
  }

  setGames(games, options = {}) {
    if (this.hills) {
      this.scene.remove(this.hills.group);
      this.hills.dispose();
    }
    if (this.floor) this.scene.remove(this.floor.group);

    if (this.annotations) this.annotations.dispose();

    this.hills = new Hills(this, games, options);
    this.scene.add(this.hills.group);

    // annotation markers ride inside the hills group so they inherit its centering offset
    this.annotations = new Annotations(this, games, this.hills);
    this.hills.group.add(this.annotations.group);

    const box = new THREE.Box3().setFromObject(this.hills.group);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    // court floor at the base of the terrain (shadow + grid + period lines + Q labels)
    this.floor = new Floor(this, {
      sizeX: size.x,
      sizeZ: size.z,
      bottomY: box.min.y,
      wps: this.hills.widthPerSecond,
      offX: this.hills.group.position.x,
    });
    this.scene.add(this.floor.group);

    // frame the terrain
    this.controls.target.copy(center);
    const aspect = window.innerWidth / window.innerHeight;
    const fit = Math.max(size.y * 1.6, (size.x + size.z) * 0.5);
    this.frustum = fit;
    this.updateFrustum(aspect);
    // low front-left hero angle: long (games) axis recedes to upper-right, like the original
    this.reach = Math.max(size.x, size.z) * 1.3;
    this.camera.position.copy(this.posForView(225, 33));
    this.camera.lookAt(center);
  }

  updateFrustum(aspect) {
    this.camera.left = (-this.frustum * aspect) / 2;
    this.camera.right = (this.frustum * aspect) / 2;
    this.camera.top = this.frustum / 2;
    this.camera.bottom = -this.frustum / 2;
    this.camera.updateProjectionMatrix();
  }

  onResize() {
    const aspect = window.innerWidth / window.innerHeight;
    this.updateFrustum(aspect);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  animate() {
    if (this.snap) {
      this.snap.t = Math.min(1, this.snap.t + 0.07);
      const k = this.snap.t < 0.5 ? 2 * this.snap.t * this.snap.t : 1 - Math.pow(-2 * this.snap.t + 2, 2) / 2; // easeInOutQuad
      this.camera.position.lerpVectors(this.snap.from, this.snap.to, k);
      this.camera.lookAt(this.controls.target);
      if (this.snap.t >= 1) this.snap = null;
    }
    this.controls.update();
    this.annotations?.update(this.camera, window.innerWidth, window.innerHeight);
    this.renderer.render(this.scene, this.camera);
  }
}
