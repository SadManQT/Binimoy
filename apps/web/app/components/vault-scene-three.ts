import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// The strongbox scene. Loaded only when a page shows it and the visitor has
// not asked for reduced data, so three.js is never in another page's bundle.
//
// The box is a generated model; everything around it is built here from
// primitives: two rings for the two parties, coins for the held money, a key
// for what goes into the vault. `progress` runs 0 to 4 and each whole number
// is one moment of a deal:
//   0 at rest · 1 both agree · 2 money held · 3 secret in the vault · 4 released

const TEAL = 0x3cc4ae;
const PALE = 0xe7f0ee;
const BRASS = 0xd9a94b;

const smooth = (t: number) => t * t * (3 - 2 * t);
// Value at `s` along evenly spaced keyframes, eased between neighbours.
function along(keys: readonly number[], s: number): number {
  const clamped = Math.min(Math.max(s, 0), keys.length - 1);
  const i = Math.floor(clamped);
  const a = keys[i] as number;
  const b = keys[Math.min(i + 1, keys.length - 1)] as number;
  return a + (b - a) * smooth(clamped - i);
}

export type SceneOptions = {
  // Elements whose position on screen drives the story; empty for a scene
  // that only idles.
  steps: HTMLElement[];
  reducedMotion: boolean;
  onReady: () => void;
};

export function mountScene(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  options: SceneOptions,
): () => void {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.5;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
  const key = new THREE.DirectionalLight(0xfff0d8, 2.4);
  key.position.set(2.6, 4.2, 3.2);
  const rim = new THREE.PointLight(TEAL, 16, 12);
  rim.position.set(-2.6, 1.5, -1.6);
  scene.add(key, rim, new THREE.HemisphereLight(0xcfe9e4, 0x0a1013, 0.35));

  // Everything that turns together.
  const rig = new THREE.Group();
  scene.add(rig);

  // A soft contact shadow, drawn once.
  const blob = document.createElement("canvas");
  blob.width = blob.height = 128;
  const ctx = blob.getContext("2d");
  if (ctx) {
    const fade = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    fade.addColorStop(0, "rgba(0,0,0,0.7)");
    fade.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, 128, 128);
  }
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 2.6),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(blob),
      transparent: true,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  rig.add(shadow);

  const ringMaterial = (color: number) =>
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.5,
      metalness: 0.7,
      roughness: 0.28,
    });
  const ringGeometry = new THREE.TorusGeometry(1.16, 0.008, 12, 180);
  const ringA = new THREE.Mesh(ringGeometry, ringMaterial(TEAL));
  const ringB = new THREE.Mesh(ringGeometry, ringMaterial(PALE));
  ringA.position.y = ringB.position.y = 0.46;
  rig.add(ringA, ringB);

  const brass = new THREE.MeshStandardMaterial({
    color: BRASS,
    metalness: 1,
    roughness: 0.3,
  });
  const coinGeometry = new THREE.CylinderGeometry(0.115, 0.115, 0.024, 44);
  const coins = Array.from({ length: 5 }, () => {
    const coin = new THREE.Mesh(coinGeometry, brass);
    rig.add(coin);
    return coin;
  });

  const keyGroup = new THREE.Group();
  const bow = new THREE.Mesh(
    new THREE.TorusGeometry(0.075, 0.018, 12, 40),
    brass,
  );
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.014, 0.3, 16),
    brass,
  );
  shaft.rotation.z = Math.PI / 2;
  shaft.position.x = 0.225;
  const teeth = [0.3, 0.355].map((x, n) => {
    const tooth = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.05 + n * 0.02, 0.014),
      brass,
    );
    tooth.position.set(x, -0.035 - n * 0.01, 0);
    return tooth;
  });
  keyGroup.add(bow, shaft, ...teeth);
  rig.add(keyGroup);

  let disposed = false;
  let loaded = false;
  new GLTFLoader().load(
    "/models/sinduk.glb",
    (gltf) => {
      if (disposed) return;
      const model = gltf.scene;
      // The generated box lies along z; turn its long face to the camera,
      // size it, and stand it on the floor at the centre.
      model.rotation.y = -Math.PI / 2;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      model.scale.setScalar(1.7 / Math.max(size.x, size.z));
      const fitted = new THREE.Box3().setFromObject(model);
      const centre = fitted.getCenter(new THREE.Vector3());
      model.position.x -= centre.x;
      model.position.z -= centre.z;
      model.position.y -= fitted.min.y;
      rig.add(model);
      loaded = true;
      dirty = true;
      options.onReady();
    },
    undefined,
    () => {
      // The poster image stays in place; nothing else to do.
    },
  );

  // ---- what drives it ----

  let target = 0;
  let progress = 0;
  let pointerX = 0;
  let pointerY = 0;
  let dirty = true;
  let visible = true;

  const measure = () => {
    if (options.steps.length === 0) return;
    const middle = window.innerHeight * 0.55;
    let active = 0;
    options.steps.forEach((step, n) => {
      if (step.getBoundingClientRect().top < middle) active = n + 1;
    });
    if (active !== target) {
      target = active;
      dirty = true;
    }
    options.steps.forEach((step, n) => {
      step.dataset.active = String(n + 1 === active);
    });
  };
  const onPointer = (event: PointerEvent) => {
    const rect = host.getBoundingClientRect();
    pointerX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    pointerY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    dirty = true;
  };
  const resize = () => {
    const { clientWidth: w, clientHeight: h } = host;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Far enough back that the rings fit the width, whatever the shape.
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const distance = Math.min(Math.max(1.45 / (half * camera.aspect), 4.4), 9);
    camera.position.set(0, 1.25, distance);
    camera.lookAt(0, 0.42, 0);
    camera.updateProjectionMatrix();
    dirty = true;
  };

  const sizeWatcher = new ResizeObserver(resize);
  sizeWatcher.observe(host);
  const viewWatcher = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
  });
  viewWatcher.observe(host);
  window.addEventListener("scroll", measure, { passive: true });
  if (!options.reducedMotion) {
    window.addEventListener("pointermove", onPointer, { passive: true });
  }
  resize();
  measure();

  const clock = new THREE.Clock();
  let frame = 0;
  const draw = () => {
    frame = requestAnimationFrame(draw);
    if (!visible || !loaded || document.hidden) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    if (options.reducedMotion) {
      // No easing and no idle movement: one still frame per state.
      if (!dirty) return;
      progress = target;
    } else {
      progress += (target - progress) * Math.min(1, dt * 3.2);
    }
    dirty = false;
    const s = progress;
    const sway = options.reducedMotion ? 0 : Math.sin(t * 0.45) * 0.07;

    rig.rotation.y =
      along([-0.52, -0.25, 0.32, 0, 0.5], s) + sway + pointerX * 0.14;
    rig.rotation.x = pointerY * 0.04;
    rig.position.y = options.reducedMotion ? 0 : Math.sin(t * 0.8) * 0.012;

    // The two parties: apart and tilted at rest, level and concentric once
    // they have agreed, opening again at release.
    const tilt = along([1.3, Math.PI / 2, Math.PI / 2, Math.PI / 2, 1.25], s);
    const lean = along([0.3, 0, 0, 0, 0.42], s);
    const spin = options.reducedMotion ? 0 : t * 0.12;
    ringA.rotation.set(tilt, lean, spin);
    ringB.rotation.set(tilt, -lean, -spin);
    ringB.scale.setScalar(along([1.1, 0.94, 0.94, 0.94, 1.12], s));
    const glow = along([0.35, 1.1, 0.8, 0.8, 0.45], s);
    (ringA.material as THREE.MeshStandardMaterial).emissiveIntensity = glow;
    (ringB.material as THREE.MeshStandardMaterial).emissiveIntensity =
      glow * 0.7;

    // The money: absent, then stacked beside the box, then moved to the
    // seller's side.
    coins.forEach((coin, n) => {
      const appear = along([0, 0, 1, 1, 1], s - n * 0.06);
      coin.scale.setScalar(Math.max(appear, 0.0001));
      coin.position.set(
        along([1.05, 1.05, 1.05, 1.05, 1.75], s) + (n % 2) * 0.012,
        along([1.6, 1.6, 0.012, 0.012, 0.012], s - n * 0.06) + n * 0.026,
        along([0.62, 0.62, 0.62, 0.62, 0.2], s),
      );
      coin.rotation.y = n * 0.7;
    });

    // The secret: arrives at the lock plate, stays there.
    const arrive = along([0, 0, 0, 1, 1], s);
    keyGroup.scale.setScalar(Math.max(arrive, 0.0001));
    keyGroup.position.set(
      along([-1.7, -1.7, -1.7, -0.36, -0.36], s),
      along([1.2, 1.2, 1.2, 0.45, 0.45], s),
      along([1.4, 1.4, 1.4, 0.72, 0.72], s),
    );
    keyGroup.rotation.set(0, along([0.9, 0.9, 0.9, 0.15, 0.15], s), 0);
    rim.intensity = along([14, 16, 14, 26, 18], s);

    renderer.render(scene, camera);
  };
  draw();

  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    sizeWatcher.disconnect();
    viewWatcher.disconnect();
    window.removeEventListener("scroll", measure);
    window.removeEventListener("pointermove", onPointer);
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      for (const material of [mesh.material].flat()) {
        if (!material) continue;
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) value.dispose();
        }
        material.dispose();
      }
    });
    environment.dispose();
    pmrem.dispose();
    renderer.dispose();
  };
}
