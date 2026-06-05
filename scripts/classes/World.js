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

  checkHover() {
    if (!this.hills) return;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.hills.meshes, false);
    const game = hits.length ? hits[0].object.userData.game : null;
    if (game !== this.hovered) {
      this.hovered = game;
      this.app.onHover?.(game, this.pointerClient);
    }
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

    // idle auto-rotate
    this.controls.autoRotateSpeed = 0.45;
    this.idleDelay = 4000;
    this.lastInteraction = performance.now();
    const wake = () => { this.lastInteraction = performance.now(); this.controls.autoRotate = false; };
    this.controls.addEventListener("start", wake);
    this.canvas.addEventListener("pointermove", wake);
    this.canvas.addEventListener("wheel", wake, { passive: true });
  }

  setupLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    // key light from upper-back → tonal gradient (front-dark, back-light) like the original
    const key = new THREE.DirectionalLight(0xffffff, 0.85);
    key.position.set(-0.4, 1.3, -1);
    this.scene.add(key);
    // soft fill from the front so shadows don't crush
    const fill = new THREE.DirectionalLight(0xdfe8fb, 0.3);
    fill.position.set(0.6, 0.5, 1);
    this.scene.add(fill);
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
    const fit = Math.max(size.y * 1.7, (size.x + size.z) * 0.6);
    this.frustum = fit;
    this.updateFrustum(aspect);
    // low front-left hero angle: long (games) axis recedes to upper-right, like the original
    const az = THREE.MathUtils.degToRad(this.camAzimuth ?? 225);
    const el = THREE.MathUtils.degToRad(this.camElevation ?? 33);
    const reach = Math.max(size.x, size.z) * 1.3;
    this.camera.position.set(
      center.x + reach * Math.cos(el) * Math.cos(az),
      center.y + reach * Math.sin(el),
      center.z + reach * Math.cos(el) * Math.sin(az)
    );
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
    if (performance.now() - this.lastInteraction > this.idleDelay) {
      this.controls.autoRotate = true;
    }
    this.controls.update();
    this.annotations?.update(this.camera, window.innerWidth, window.innerHeight);
    this.renderer.render(this.scene, this.camera);
  }
}
