import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// The front-page scene: a shop being looked at.
//
// The shop is a generated model. Everything that says what the product does
// is built here from simple shapes, so each piece can move on its own: a
// magnifying glass passing over the shop front, review stars above it, a
// speech bubble for what people wrote, and a warning sign for a report.
//
// Loaded only when the scene is about to be seen, so three.js is in no other
// page's bundle. There is no scroll listener: it idles, and follows the
// pointer a little.

const TEAL = 0x2fe0c4;
const GOLD = 0xffc24d;
const AMBER = 0xffa53a;
const NAVY = 0x16213f;
const PAPER = 0xeef2ff;

export type SceneOptions = { reducedMotion: boolean; onReady: () => void };

const clay = (
  color: number,
  extra: THREE.MeshStandardMaterialParameters = {},
) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness: 0.38,
    metalness: 0.08,
    ...extra,
  });

const solid = (shape: THREE.Shape, depth: number) => {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: depth * 0.45,
    bevelSize: depth * 0.45,
    bevelSegments: 4,
    curveSegments: 20,
  });
  geometry.center();
  return geometry;
};

function starShape(outer: number, inner: number) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function roundedRect(w: number, h: number, r: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  shape.lineTo(w / 2, h / 2 - r);
  shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  shape.lineTo(-w / 2 + r, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  shape.lineTo(-w / 2, -h / 2 + r);
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return shape;
}

function roundedTriangle(size: number, r: number) {
  const points = [0, 1, 2].map((i) => {
    const angle = Math.PI / 2 + (i * Math.PI * 2) / 3;
    return new THREE.Vector2(Math.cos(angle) * size, Math.sin(angle) * size);
  });
  const shape = new THREE.Shape();
  points.forEach((point, i) => {
    const next = points[(i + 1) % 3] as THREE.Vector2;
    const from = point.clone().lerp(next, r);
    const to = point.clone().lerp(next, 1 - r);
    if (i === 0) shape.moveTo(from.x, from.y);
    else shape.quadraticCurveTo(point.x, point.y, from.x, from.y);
    shape.lineTo(to.x, to.y);
  });
  const first = points[0] as THREE.Vector2;
  const start = first.clone().lerp(points[1] as THREE.Vector2, r);
  shape.quadraticCurveTo(first.x, first.y, start.x, start.y);
  return shape;
}

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
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.6;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
  const key = new THREE.DirectionalLight(0xfff1dd, 2.6);
  key.position.set(2.4, 4, 3.4);
  const rim = new THREE.PointLight(TEAL, 22, 12);
  rim.position.set(-2.8, 1.6, -1.4);
  const warm = new THREE.PointLight(AMBER, 9, 9);
  warm.position.set(2.6, 0.6, 1.2);
  scene.add(key, rim, warm, new THREE.HemisphereLight(0xd6defa, 0x070b18, 0.4));

  const rig = new THREE.Group();
  scene.add(rig);

  // A soft contact shadow and a faint ring of light on the ground.
  const blob = document.createElement("canvas");
  blob.width = blob.height = 128;
  const ctx = blob.getContext("2d");
  if (ctx) {
    const fade = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    fade.addColorStop(0, "rgba(0,0,0,0.75)");
    fade.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, 128, 128);
  }
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 2.6),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(blob),
      transparent: true,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(1.42, 1.45, 120),
    new THREE.MeshBasicMaterial({
      color: TEAL,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.004;
  rig.add(shadow, halo);

  // The magnifying glass: what the visitor is here to do.
  const glass = new THREE.Group();
  const rimRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.36, 0.05, 20, 80),
    clay(TEAL, { roughness: 0.22, metalness: 0.25 }),
  );
  const lens = new THREE.Mesh(
    new THREE.CircleGeometry(0.34, 64),
    new THREE.MeshPhysicalMaterial({
      color: 0xbdf6ec,
      transparent: true,
      opacity: 0.16,
      roughness: 0.02,
      metalness: 0,
      clearcoat: 1,
      side: THREE.DoubleSide,
    }),
  );
  const handle = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.055, 0.42, 8, 16),
    clay(NAVY, { roughness: 0.3 }),
  );
  handle.position.set(0.45, -0.45, 0);
  handle.rotation.z = Math.PI / 4;
  glass.add(rimRing, lens, handle);
  rig.add(glass);

  // Review stars in an arc above the shop.
  const starGeometry = solid(starShape(0.15, 0.068), 0.05);
  const gold = clay(GOLD, { roughness: 0.28, metalness: 0.45 });
  const stars = Array.from({ length: 5 }, () => {
    const star = new THREE.Mesh(starGeometry, gold);
    rig.add(star);
    return star;
  });

  // What someone wrote.
  const bubble = new THREE.Group();
  bubble.add(
    new THREE.Mesh(solid(roundedRect(0.62, 0.42, 0.14), 0.06), clay(TEAL)),
  );
  const tail = new THREE.Mesh(
    solid(roundedTriangle(0.1, 0.2), 0.06),
    clay(TEAL),
  );
  tail.position.set(-0.14, -0.26, 0);
  tail.rotation.z = Math.PI;
  bubble.add(tail);
  [0.09, -0.01, -0.11].forEach((y, n) => {
    const line = new THREE.Mesh(
      new THREE.BoxGeometry(n === 2 ? 0.24 : 0.4, 0.035, 0.03),
      clay(PAPER),
    );
    line.position.set(n === 2 ? -0.08 : 0, y, 0.075);
    bubble.add(line);
  });
  rig.add(bubble);

  // A report: an amber warning sign. Amber, not red: a claim, not a finding.
  const sign = new THREE.Group();
  const plate = clay(AMBER, { emissive: AMBER, emissiveIntensity: 0.12 });
  sign.add(new THREE.Mesh(solid(roundedTriangle(0.3, 0.18), 0.07), plate));
  const bar = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.03, 0.14, 6, 12),
    clay(NAVY),
  );
  bar.position.set(0, 0.02, 0.085);
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 16, 16),
    clay(NAVY),
  );
  dot.position.set(0, -0.14, 0.085);
  sign.add(bar, dot);
  rig.add(sign);

  let disposed = false;
  let loaded = false;
  let dirty = true;
  new GLTFLoader().load(
    "/models/shop.glb",
    (gltf) => {
      if (disposed) return;
      const model = gltf.scene;
      // Sized to a known width and stood on the floor at the centre.
      // The generated shop faces +x; turn its front to the camera.
      model.rotation.y = -Math.PI / 2;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      model.scale.setScalar(1.9 / Math.max(size.x, size.z));
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
      // The still image stays in place; nothing else to do.
    },
  );

  let pointerX = 0;
  let pointerY = 0;
  let visible = true;
  const onPointer = (event: PointerEvent) => {
    const rect = host.getBoundingClientRect();
    pointerX = THREE.MathUtils.clamp(
      ((event.clientX - rect.left) / rect.width - 0.5) * 2,
      -1.5,
      1.5,
    );
    pointerY = THREE.MathUtils.clamp(
      ((event.clientY - rect.top) / rect.height - 0.5) * 2,
      -1.5,
      1.5,
    );
  };
  const resize = () => {
    const { clientWidth: w, clientHeight: h } = host;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Far enough back that everything fits the width, whatever the shape.
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const distance = Math.min(Math.max(1.75 / (half * camera.aspect), 5.6), 10);
    camera.position.set(0, 1.5, distance);
    camera.lookAt(0, 1.05, 0);
    camera.updateProjectionMatrix();
    dirty = true;
  };
  const sizeWatcher = new ResizeObserver(resize);
  sizeWatcher.observe(host);
  const viewWatcher = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
  });
  viewWatcher.observe(host);
  if (!options.reducedMotion) {
    window.addEventListener("pointermove", onPointer, { passive: true });
  }
  resize();

  const clock = new THREE.Clock();
  let frame = 0;
  let easedX = 0;
  let easedY = 0;
  const draw = () => {
    frame = requestAnimationFrame(draw);
    if (!visible || !loaded || document.hidden) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    // With reduced motion: one still frame, drawn again only on resize.
    if (options.reducedMotion && !dirty) return;
    dirty = false;
    const t = options.reducedMotion ? 2.2 : clock.elapsedTime;
    easedX += (pointerX - easedX) * Math.min(1, dt * 4);
    easedY += (pointerY - easedY) * Math.min(1, dt * 4);

    rig.rotation.y = -0.3 + Math.sin(t * 0.35) * 0.1 + easedX * 0.16;
    rig.rotation.x = easedY * 0.04;

    // The glass sweeps slowly across the shop front, leaning toward the pointer.
    glass.position.set(
      0.55 + Math.sin(t * 0.55) * 0.3 + easedX * 0.16,
      0.62 + Math.sin(t * 0.9) * 0.12 - easedY * 0.1,
      1.25,
    );
    glass.rotation.set(0.08, -0.3 + Math.sin(t * 0.55) * 0.1, 0.05);

    stars.forEach((star, n) => {
      const spread = (n - 2) * 0.36;
      star.position.set(
        spread,
        2.2 - Math.abs(n - 2) * 0.11 + Math.sin(t * 1.3 + n * 0.9) * 0.035,
        0.1,
      );
      star.rotation.set(0, Math.sin(t * 0.7 + n) * 0.35, (2 - n) * 0.12);
    });

    bubble.position.set(-1.35, 1.45 + Math.sin(t * 0.8 + 1) * 0.05, 0.3);
    bubble.rotation.set(0, 0.5, -0.08);
    sign.position.set(1.4, 1.45 + Math.sin(t * 0.9 + 2.4) * 0.05, 0.3);
    sign.rotation.set(0, -0.45, 0.06);
    plate.emissiveIntensity = 0.12 + (Math.sin(t * 2.2) + 1) * 0.1;

    renderer.render(scene, camera);
  };
  draw();

  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    sizeWatcher.disconnect();
    viewWatcher.disconnect();
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
