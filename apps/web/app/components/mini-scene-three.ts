import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { clay, roundedTriangle, solid, starShape } from "./hero-scene-three";

// Small 3D objects used around the site, each tied to what its page is about:
//   gauge  - a shop's trust signal as a dial that fills to its score
//   alert  - a warning sign with rings going out, for the alerts page
//   stars  - five review stars in orbit, for the shop directory
//   lock   - a padlock with a turning key, for safe deals
// All four are built from primitives: no model file is downloaded.

export type MiniKind = "gauge" | "alert" | "stars" | "lock";
export type MiniOptions = {
  kind: MiniKind;
  // gauge only: 0 to 100, or null when there is not enough data.
  value?: number | null;
  reducedMotion: boolean;
  onReady: () => void;
};

const TEAL = 0x2fe0c4;
const AMBER = 0xffa53a;
const RED = 0xff7a85;
const GOLD = 0xffc24d;
const NAVY = 0x1a2649;

export function mountMini(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  options: MiniOptions,
): () => void {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.7;
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 30);
  camera.position.set(0, 0, 4.2);
  const key = new THREE.DirectionalLight(0xfff1dd, 2.4);
  key.position.set(2, 3, 4);
  const rim = new THREE.PointLight(TEAL, 14, 10);
  rim.position.set(-2.5, 1, -1);
  scene.add(key, rim);
  const rig = new THREE.Group();
  scene.add(rig);

  // Each kind returns a function that poses it at time t (seconds).
  let pose: (t: number) => void = () => {};

  if (options.kind === "gauge") {
    const score = options.value ?? null;
    const colour =
      score === null
        ? 0x7f8bb3
        : score >= 70
          ? TEAL
          : score >= 45
            ? AMBER
            : RED;
    const track = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.09, 20, 120, Math.PI * 1.5),
      clay(NAVY, { roughness: 0.5 }),
    );
    track.rotation.z = -Math.PI / 4;
    rig.add(track);
    const fill = new THREE.Group();
    rig.add(fill);
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.42, 1),
      clay(colour, { roughness: 0.25, metalness: 0.3, flatShading: true }),
    );
    rig.add(core);
    let shown = -1;
    pose = (t) => {
      // The dial sweeps up to the score once, then rests there.
      const target = score === null ? 0 : score / 100;
      const amount = options.reducedMotion ? target : Math.min(target, t * 0.6);
      if (Math.abs(amount - shown) > 0.004) {
        shown = amount;
        for (const child of [...fill.children]) {
          (child as THREE.Mesh).geometry.dispose();
          fill.remove(child);
        }
        if (amount > 0) {
          const arc = new THREE.Mesh(
            new THREE.TorusGeometry(1, 0.11, 20, 120, Math.PI * 1.5 * amount),
            clay(colour, {
              emissive: colour,
              emissiveIntensity: 0.35,
              roughness: 0.25,
            }),
          );
          // Mirrored, so it starts at the lower left and runs clockwise.
          arc.rotation.set(0, Math.PI, -Math.PI / 4);
          fill.add(arc);
        }
      }
      core.rotation.set(t * 0.4, t * 0.6, 0);
      rig.rotation.y = Math.sin(t * 0.5) * 0.25;
    };
  } else if (options.kind === "alert") {
    const plate = clay(AMBER, { emissive: AMBER, emissiveIntensity: 0.15 });
    const sign = new THREE.Group();
    sign.add(new THREE.Mesh(solid(roundedTriangle(0.95, 0.18), 0.2), plate));
    const bar = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.09, 0.42, 6, 12),
      clay(NAVY),
    );
    bar.position.set(0, 0.08, 0.26);
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 20, 20),
      clay(NAVY),
    );
    dot.position.set(0, -0.44, 0.26);
    sign.add(bar, dot);
    rig.add(sign);
    const rings = [0, 1, 2].map(() => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1, 0.012, 8, 90),
        new THREE.MeshBasicMaterial({ color: AMBER, transparent: true }),
      );
      rig.add(ring);
      return ring;
    });
    pose = (t) => {
      sign.rotation.y = Math.sin(t * 0.8) * 0.5;
      sign.position.y = Math.sin(t * 1.4) * 0.04 - 0.1;
      plate.emissiveIntensity = 0.15 + (Math.sin(t * 2.4) + 1) * 0.12;
      rings.forEach((ring, n) => {
        // Rings travel outward and fade: a warning being sent out.
        const phase = options.reducedMotion ? n / 3 : (t * 0.35 + n / 3) % 1;
        ring.scale.setScalar(1 + phase * 0.9);
        (ring.material as THREE.MeshBasicMaterial).opacity = (1 - phase) * 0.5;
      });
    };
  } else if (options.kind === "stars") {
    const geometry = solid(starShape(0.34, 0.15), 0.1);
    const gold = clay(GOLD, { roughness: 0.28, metalness: 0.45 });
    const stars = [0, 1, 2, 3, 4].map(() => {
      const star = new THREE.Mesh(geometry, gold);
      rig.add(star);
      return star;
    });
    pose = (t) => {
      stars.forEach((star, n) => {
        const angle = t * 0.5 + (n / 5) * Math.PI * 2;
        star.position.set(
          Math.cos(angle) * 1.15,
          Math.sin(angle * 2) * 0.18,
          Math.sin(angle) * 0.6,
        );
        star.rotation.set(0, angle, Math.sin(t + n) * 0.2);
        star.scale.setScalar(0.75 + (star.position.z + 0.6) * 0.3);
      });
    };
  } else {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.25, 1, 0.5, 4, 4, 4),
      clay(TEAL, { roughness: 0.3 }),
    );
    body.position.y = -0.35;
    const shackle = new THREE.Mesh(
      new THREE.TorusGeometry(0.4, 0.09, 16, 48, Math.PI),
      clay(0xdfe6ff, { metalness: 0.7, roughness: 0.25 }),
    );
    shackle.position.y = 0.15;
    const hole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.08, 24),
      clay(NAVY),
    );
    hole.rotation.x = Math.PI / 2;
    hole.position.set(0, -0.3, 0.26);
    const keyGroup = new THREE.Group();
    const brass = clay(GOLD, { metalness: 0.9, roughness: 0.3 });
    const bow = new THREE.Mesh(
      new THREE.TorusGeometry(0.16, 0.04, 12, 32),
      brass,
    );
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.6, 12),
      brass,
    );
    shaft.rotation.z = Math.PI / 2;
    shaft.position.x = 0.45;
    keyGroup.add(bow, shaft);
    rig.add(body, shackle, hole, keyGroup);
    pose = (t) => {
      rig.rotation.y = Math.sin(t * 0.6) * 0.45;
      const swing = options.reducedMotion ? 0.5 : (Math.sin(t * 0.9) + 1) / 2;
      keyGroup.position.set(-1.7 + swing * 0.5, -0.3, 0.55);
      keyGroup.rotation.x = t * 1.2;
      shackle.position.y = 0.15 + swing * 0.08;
    };
  }

  let visible = true;
  let dirty = true;
  const resize = () => {
    const { clientWidth: w, clientHeight: h } = host;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dirty = true;
  };
  const sizeWatcher = new ResizeObserver(resize);
  sizeWatcher.observe(host);
  const viewWatcher = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
  });
  viewWatcher.observe(host);
  resize();
  options.onReady();

  const clock = new THREE.Clock();
  let frame = 0;
  const draw = () => {
    frame = requestAnimationFrame(draw);
    if (!visible || document.hidden) return;
    if (options.reducedMotion && !dirty) return;
    dirty = false;
    pose(options.reducedMotion ? 3 : clock.getElapsedTime());
    renderer.render(scene, camera);
  };
  draw();

  return () => {
    cancelAnimationFrame(frame);
    sizeWatcher.disconnect();
    viewWatcher.disconnect();
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      for (const material of [mesh.material].flat()) material?.dispose();
    });
    environment.dispose();
    pmrem.dispose();
    renderer.dispose();
  };
}
