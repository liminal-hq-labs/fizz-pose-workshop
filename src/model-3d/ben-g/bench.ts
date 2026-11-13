// Runs the cartoon Ben tuning bench: a posable figure, pose picker, design switches and sprite-pass renders.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as T from "three";
import assets from "../../../assets.json";
import { applyPose } from "./apply.ts";
import { applyFace, gazes, poseFaces, poseGazes } from "./faces.ts";
import { eulerQuaternion } from "./ik.ts";
import { poses } from "./poses.ts";
import { buildRig } from "./rig.ts";
import { inkMaterial, benGScale } from "./shared.ts";
import { benGSpec, defaultOptions, paletteColour, joints } from "./spec.ts";
import type { Fig, Options } from "./types.ts";
import type { SpriteFrame, SpritePasses } from "../sprite-passes.ts";

/** Poses as `[id, label, sprite frame shown on the button]`. */
const posePicks: readonly (readonly [string, string, string])[] = [
  ["stand", "Stand", "ben_standRight"],
  ["run", "Run", "ben_walkRight3"],
  ["pogo", "Pogo", "ben_pogoRight2"],
  ["fire", "Stunner", "ben_fireRight2"],
  ["jump", "Jump", "ben_jumpRig3"],
  ["fall", "Fall", "ben_fallRig3"],
  ["climb", "Climb", "ben_ladder2"],
  ["ledge", "Ledge", "ben_ledge2"],
  ["whistle", "Whistle", "ben_whistleRight3"],
  ["phone", "Phone", "ben_phone7"],
  ["wipeout", "Wipeout", "ben_death5"],
  ["wrist", "Wrist check", "ben_wristCheck1"],
  ["tip", "Helmet tip", "ben_helmetTip5"],
  ["scratch", "Head scratch", "ben_headScratch1"],
  ["rock", "Rock", "ben_rock1"],
  ["spin", "Helmet spin", "ben_helmetSpin1"],
  ["aerial", "Aerial", "ben_aerial4"],
  ["draw", "Pogo draw", "ben_pogoDraw4"],
  ["reload", "Reload", "ben_reload3"],
];
/** What the sprite-render scripts call on the page. */
export interface BenchApi {
  readonly poses: readonly string[];
  spritePasses(
    pose: string,
    time: number,
    yawDegrees: number,
    frame: SpriteFrame,
    scale: number,
  ): SpritePasses;
}
declare global {
  interface Window {
    benG?: BenchApi;
  }
}

const $ = <E extends HTMLElement = HTMLElement>(id: string): E => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`The bench page has no #${id}.`);
  return element as E;
};
const input = (id: string): HTMLInputElement => $<HTMLInputElement>(id);
const clamp = (value: number, low: number, high: number): number =>
  Math.max(low, Math.min(high, value));
const press = (container: ParentNode, test: (button: HTMLButtonElement) => boolean): void =>
  container
    .querySelectorAll("button")
    .forEach((button) => button.setAttribute("aria-pressed", test(button) ? "true" : "false"));

/** Draws each pose button from its saved sprite, cropped to its pixels. */
function buildPosePicker(strip: HTMLElement): void {
  const frames = assets.frames as Record<string, { grid: string[] } | undefined>,
    palette = assets.palette as Record<string, string | null>;
  for (const [id, label, sprite] of posePicks) {
    const button = document.createElement("button"),
      grid = frames[sprite]?.grid;
    button.type = "button";
    button.className = "pose";
    button.id = "pose-" + id;
    button.dataset.p = id;
    button.setAttribute("aria-pressed", "false");
    if (grid) {
      const rows = grid.map((row, y) => ({ row, y })).filter(({ row }) => /[^.]/.test(row)),
        left = Math.min(...rows.map(({ row }) => row.search(/[^.]/))),
        right = Math.max(...rows.map(({ row }) => row.replace(/\.+$/, "").length)),
        canvas = document.createElement("canvas"),
        context = canvas.getContext("2d");
      canvas.width = right - left;
      canvas.height = rows.length;
      canvas.style.width = canvas.width * 2 + "px";
      canvas.style.height = canvas.height * 2 + "px";
      canvas.setAttribute("aria-hidden", "true");
      if (context)
        rows.forEach(({ row }, y) => {
          for (let x = left; x < right; x++) {
            const colour = palette[row[x]];
            if (colour) {
              context.fillStyle = colour;
              context.fillRect(x - left, y, 1, 1);
            }
          }
        });
      button.appendChild(canvas);
    } else button.className = "pose nosprite";
    const name = document.createElement("span");
    name.textContent = label;
    button.appendChild(name);
    strip.appendChild(button);
  }
}

function start(): void {
  const stage = $("stage"),
    canvas = $<HTMLCanvasElement>("gl"),
    strip = $("poses");
  buildPosePicker(strip);
  let renderer: T.WebGLRenderer;
  try {
    renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    const note = document.createElement("div");
    note.className = "fail";
    note.textContent = "The 3D view needs WebGL, which is not available here.";
    stage.appendChild(note);
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(30, 16 / 9, 0.1, 60);
  // Intensities are in Three.js's physical light units.
  scene.add(new T.HemisphereLight(0xffffff, 0x9aa0cc, 0.8 * Math.PI));
  const key = new T.DirectionalLight(0xffffff, 0.8 * Math.PI);
  key.position.set(2.5, 5, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0015;
  Object.assign(key.shadow.camera, {
    left: -3.4,
    right: 3.4,
    top: 3,
    bottom: -1.5,
    near: 1,
    far: 14,
  });
  scene.add(key);
  const rim = new T.DirectionalLight(0xbfd0ff, 0.45 * Math.PI);
  rim.position.set(-3, 2, -3);
  scene.add(rim);
  const pedestal = new T.Group();
  pedestal.scale.setScalar(benGScale);
  scene.add(pedestal);
  const disc = new T.Mesh(
    new T.CylinderGeometry(12.4, 13.2, 2, 44),
    new T.MeshStandardMaterial({ color: 0xaa5500, roughness: 0.9 }),
  );
  disc.position.y = -1;
  disc.receiveShadow = true;
  pedestal.add(disc);
  const ring = new T.Mesh(
    new T.TorusGeometry(12.4, 0.22, 6, 48),
    new T.MeshBasicMaterial({ color: 0xffff55 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.02;
  pedestal.add(ring);

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const state = {
    pose: "stand",
    spin: false,
    bones: false,
    play: !reduce,
    zoom: 1,
    look: 0.98,
    panX: 0,
    yaw: 0.55,
    pitch: 0.1,
    manual: false,
    joint: "head",
    face: "auto",
    gaze: "auto",
  };
  const options: Options = { ...defaultOptions },
    view = { dist: 8, toDist: 8, y: 0.98 };
  let fig: Fig,
    blend = 1,
    from: { q: T.Quaternion[]; p: T.Vector3 } | null = null,
    dialBase: T.Quaternion | null = null;
  const gaze = (pose: string): readonly number[] =>
    state.gaze === "auto" ? (poseGazes[pose] ?? [0, 0]) : gazes[state.gaze];
  const disposeFigure = (old: Fig): void => {
    old.turn.traverse((object) => {
      const mesh = object as T.Mesh<T.BufferGeometry, T.Material>;
      mesh.geometry?.dispose();
      if (mesh.material && mesh.material !== inkMaterial) {
        (mesh.material as T.MeshToonMaterial).alphaMap?.dispose();
        mesh.material.dispose();
      }
    });
    scene.remove(old.turn);
  };
  const rebuild = (): void => {
    const old = fig as Fig | undefined,
      next = buildRig(benGSpec(options));
    scene.add(next.turn);
    next.bones.visible = state.bones;
    if (old) {
      next.jointList.forEach((joint, i) => joint.quaternion.copy(old.jointList[i].quaternion));
      next.J.pelvis.position.copy(old.J.pelvis.position);
      disposeFigure(old);
    }
    fig = next;
    fig.marker.visible = state.manual;
  };
  rebuild();

  const snapshot = (): void => {
    from = {
      q: fig.jointList.map((joint) => joint.quaternion.clone()),
      p: fig.J.pelvis.position.clone(),
    };
    blend = 0;
  };
  const syncDials = (): void => {
    dialBase = fig.J[state.joint].quaternion.clone();
    for (const [dial, out] of [
      ["rx", "ox"],
      ["ry", "oy"],
      ["rz", "oz"],
    ]) {
      input(dial).value = "0";
      $(out).textContent = "0°";
    }
    fig.marker.visible = state.manual;
  };
  const setManual = (on: boolean): void => {
    state.manual = on;
    $("status").textContent = on ? "Posing by hand · motion paused" : "Following the preset pose";
    if (!on && blend >= 1) snapshot();
    fig.marker.visible = on;
    if (on) syncDials();
  };
  const setPose = (pose: string): void => {
    snapshot();
    if (state.manual) setManual(false);
    state.pose = pose;
    press(strip, (button) => button.dataset.p === pose);
  };
  const select = (joint: string): void => {
    state.joint = joint;
    $<HTMLSelectElement>("selJoint").value = joint;
    if (state.manual) syncDials();
    else setManual(true);
  };
  const frame = (): void => {
    const half = Math.tan((camera.fov * Math.PI) / 360),
      width = 1.9 / state.zoom,
      height = 2.35 / state.zoom;
    view.toDist = Math.max(height / 2 / half, width / 2 / (half * camera.aspect)) * 1.05;
  };
  const toggle = (id: string, flip: () => boolean): void => {
    $(id).addEventListener("click", (event) =>
      (event.currentTarget as HTMLElement).setAttribute("aria-pressed", String(flip())),
    );
  };

  strip.addEventListener("click", (event) => {
    const pose = (event.target as HTMLElement).closest("button")?.dataset.p;
    if (pose) setPose(pose);
  });
  toggle("t-spin", () => (state.spin = !state.spin));
  toggle("t-bones", () => (fig.bones.visible = state.bones = !state.bones));
  toggle("t-play", () => (state.play = !state.play));
  $("t-play").setAttribute("aria-pressed", String(state.play));
  input("zoom").addEventListener("input", (event) => {
    state.zoom = +(event.currentTarget as HTMLInputElement).value;
    frame();
  });
  input("look").addEventListener("input", (event) => {
    state.look = +(event.currentTarget as HTMLInputElement).value;
  });
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      state.zoom = clamp(state.zoom * (event.deltaY < 0 ? 1.08 : 0.93), 0.6, 5);
      input("zoom").value = String(state.zoom);
      frame();
    },
    { passive: false },
  );
  $("b-view").addEventListener("click", () => {
    Object.assign(state, { zoom: 1, look: 0.98, panX: 0, yaw: 0.55, pitch: 0.1 });
    input("zoom").value = "1";
    input("look").value = "0.98";
    frame();
  });

  /* design switches */
  type Choice = "fizz" | "stunner" | "shoe" | "jeans" | "cheeks" | "vents";
  type Flag = "helmet" | "backpack" | "wrist";
  const syncOptions = (): void => {
    document
      .querySelectorAll<HTMLElement>("#tune .seg[data-opt]")
      .forEach((group) =>
        press(group, (button) => options[group.dataset.opt as Choice] === button.dataset.val),
      );
    press($("gear"), (button) => options[button.dataset.flag as Flag]);
    input("o-line").value = String(options.line);
    $("o-line-out").textContent = options.line.toFixed(2);
  };
  $("tune").addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest("button");
    if (!button) return;
    const group = button.parentElement?.dataset.opt as Choice | undefined,
      flag = button.dataset.flag as Flag | undefined;
    if (button.dataset.val && group) options[group] = button.dataset.val;
    else if (flag) options[flag] = !options[flag];
    else return;
    rebuild();
    syncOptions();
  });
  let linePending = false;
  input("o-line").addEventListener("input", (event) => {
    options.line = +(event.currentTarget as HTMLInputElement).value;
    $("o-line-out").textContent = options.line.toFixed(2);
    if (linePending) return;
    linePending = true;
    requestAnimationFrame(() => {
      linePending = false;
      rebuild();
    });
  });
  $<HTMLSelectElement>("selFace").addEventListener("change", (event) => {
    state.face = (event.currentTarget as HTMLSelectElement).value;
  });
  $<HTMLSelectElement>("selGaze").addEventListener("change", (event) => {
    state.gaze = (event.currentTarget as HTMLSelectElement).value;
  });
  const copyOut = (
    text: string,
    area: HTMLTextAreaElement,
    button: HTMLElement,
    label: string,
  ): void => {
    area.hidden = false;
    area.value = text;
    const select = (): void => {
      area.focus();
      area.select();
    };
    if (!navigator.clipboard?.writeText) {
      select();
      return;
    }
    navigator.clipboard.writeText(text).then(() => {
      button.textContent = "Copied";
      setTimeout(() => (button.textContent = label), 1400);
    }, select);
  };
  $("b-choices").addEventListener("click", (event) =>
    copyOut(
      JSON.stringify({ ...options, expression: state.face }),
      $<HTMLTextAreaElement>("choiceOut"),
      event.currentTarget as HTMLElement,
      "Copy my choices",
    ),
  );
  syncOptions();

  /* posing by hand: each dial turns the chosen joint from where it is, about one axis */
  const jointSelect = $<HTMLSelectElement>("selJoint");
  for (const [name, label] of joints) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = label;
    jointSelect.appendChild(option);
  }
  jointSelect.value = state.joint;
  jointSelect.addEventListener("change", () => select(jointSelect.value));
  for (const [dial, out] of [
    ["rx", "ox"],
    ["ry", "oy"],
    ["rz", "oz"],
  ])
    input(dial).addEventListener("input", () => {
      if (!state.manual) setManual(true);
      const joint = fig.J[state.joint],
        radians = (id: string): number => (+input(id).value * Math.PI) / 180;
      dialBase ??= joint.quaternion.clone();
      joint.quaternion.copy(
        eulerQuaternion(radians("rx"), 0, 0)
          .multiply(eulerQuaternion(0, 0, radians("rz")))
          .multiply(dialBase)
          .multiply(eulerQuaternion(0, radians("ry"), 0)),
      );
      $(out).textContent = input(dial).value + "°";
    });
  $("b-resume").addEventListener("click", () => {
    if (state.manual) setManual(false);
  });
  $("b-copy").addEventListener("click", (event) => {
    const angles: Record<string, number[]> = {};
    for (const [name] of joints) {
      const euler = new T.Euler().setFromQuaternion(fig.J[name].quaternion, "XYZ");
      angles[name] = [euler.x, euler.y, euler.z].map((value) =>
        Math.round((value * 180) / Math.PI),
      );
    }
    copyOut(
      JSON.stringify({
        basedOn: state.pose,
        hipHeight: +fig.J.pelvis.position.y.toFixed(2),
        joints: angles,
      }),
      $<HTMLTextAreaElement>("poseOut"),
      event.currentTarget as HTMLElement,
      "Copy pose",
    );
  });

  /* camera: drag orbits, shift- or right-drag moves, wheel or pinch zooms, a click picks a joint */
  interface Point {
    x: number;
    y: number;
  }
  const points = new Map<number, Point>(),
    ray = new T.Raycaster();
  let drag: (Point & { startX: number; startY: number; pan: boolean }) | null = null,
    pinch: { gap: number; x: number; y: number; zoom: number } | null = null;
  const worldPerPixel = (): number =>
    (2 * view.dist * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, canvas.clientHeight);
  const pan = (dx: number, dy: number): void => {
    state.panX = clamp(state.panX - dx * worldPerPixel(), -1.5, 1.5);
    state.look = clamp(state.look + dy * worldPerPixel(), 0, 2.2);
    input("look").value = String(state.look);
  };
  const pair = (): [Point, Point] | null => {
    const all = [...points.values()];
    return all.length === 2 ? [all[0], all[1]] : null;
  };
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("pointerdown", (event) => {
    points.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const two = pair();
    if (two) {
      pinch = {
        gap: Math.hypot(two[0].x - two[1].x, two[0].y - two[1].y),
        x: (two[0].x + two[1].x) / 2,
        y: (two[0].y + two[1].y) / 2,
        zoom: state.zoom,
      };
      drag = null;
      return;
    }
    drag = {
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      pan: event.shiftKey || event.button === 2 || event.button === 1,
    };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    const point = points.get(event.pointerId);
    if (point) {
      point.x = event.clientX;
      point.y = event.clientY;
    }
    const two = pair();
    if (pinch && two) {
      const gap = Math.hypot(two[0].x - two[1].x, two[0].y - two[1].y),
        x = (two[0].x + two[1].x) / 2,
        y = (two[0].y + two[1].y) / 2;
      state.zoom = clamp((pinch.zoom * gap) / Math.max(1, pinch.gap), 0.6, 5);
      input("zoom").value = String(state.zoom);
      frame();
      pan(x - pinch.x, y - pinch.y);
      pinch.x = x;
      pinch.y = y;
      return;
    }
    if (!drag) return;
    const dx = event.clientX - drag.x,
      dy = event.clientY - drag.y;
    if (drag.pan) pan(dx, dy);
    else {
      state.yaw += dx * 0.012;
      state.pitch = clamp(state.pitch + dy * 0.006, -0.7, 1.35);
    }
    drag.x = event.clientX;
    drag.y = event.clientY;
  });
  const release = (event: PointerEvent): void => {
    points.delete(event.pointerId);
    pinch = null;
    if (
      event.type === "pointerup" &&
      drag &&
      Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY) < 6
    ) {
      const box = canvas.getBoundingClientRect();
      ray.setFromCamera(
        new T.Vector2(
          ((event.clientX - box.left) / box.width) * 2 - 1,
          -(((event.clientY - box.top) / box.height) * 2 - 1),
        ),
        camera,
      );
      for (
        let object: T.Object3D | null =
          ray.intersectObjects(fig.pickables, false)[0]?.object ?? null;
        object;
        object = object.parent
      )
        if (object.userData.joint) {
          select(object.userData.joint as string);
          break;
        }
    }
    drag = null;
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  const resize = (): void => {
    const width = stage.clientWidth,
      height = stage.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    frame();
  };
  new ResizeObserver(resize).observe(stage);
  resize();
  view.dist = view.toDist;
  press(strip, (button) => button.dataset.p === state.pose);

  let last = performance.now(),
    time = 0,
    wall = 0;
  const tick = (now: number): void => {
    const dt = Math.min((now - last) / 1000, 0.05),
      ease = Math.min(1, dt * 6);
    last = now;
    wall += dt;
    if (state.play) time += dt;
    if (state.spin && !drag) state.yaw += dt * 0.35;
    view.dist += (view.toDist - view.dist) * ease;
    view.y += (state.look - view.y) * ease;
    camera.position.set(
      state.panX,
      view.y + Math.sin(state.pitch) * view.dist,
      Math.cos(state.pitch) * view.dist,
    );
    camera.lookAt(state.panX, view.y, 0);
    fig.turn.rotation.y = pedestal.rotation.y = state.yaw;
    if (!state.manual) {
      applyPose(fig, poses[state.pose](time, fig), time);
      if (blend < 1 && from) {
        blend = Math.min(1, blend + dt / 0.35);
        const weight = blend * blend * (3 - 2 * blend),
          start = from;
        fig.jointList.forEach((joint, i) =>
          joint.quaternion.copy(start.q[i].clone().slerp(joint.quaternion, weight)),
        );
        fig.J.pelvis.position.copy(start.p.clone().lerp(fig.J.pelvis.position, weight));
      }
    }
    applyFace(
      fig,
      state.face === "auto" ? fig.face || poseFaces[state.pose] : state.face,
      gaze(state.pose),
    );
    const blink = (wall + 2) % 3.7 < 0.12;
    fig.X.eyes.scale.y = blink ? 0.12 : 1;
    fig.X.eyes.position.y = blink ? 3.55 * 0.88 : 0;
    fig.turn.updateMatrixWorld(true);
    if (state.bones) {
      const positions = fig.bones.geometry.attributes.position as T.BufferAttribute;
      fig.bonePairs.forEach(([a, b], i) => {
        const start = fig.loc(fig.J[a]),
          end = fig.loc(fig.J[b]);
        positions.setXYZ(i * 2, start.x, start.y, start.z);
        positions.setXYZ(i * 2 + 1, end.x, end.y, end.z);
      });
      positions.needsUpdate = true;
    }
    if (fig.marker.visible) fig.marker.position.copy(fig.loc(fig.J[state.joint]));
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  /**
   * Renders the posed figure three times through an orthographic sprite camera: unlit colour mapped to the game palette,
   * view-space normals and depth. Ink shells, see-through props and the pedestal are left out.
   */
  const spritePasses = (
    pose: string,
    at: number,
    yawDegrees: number,
    sprite: SpriteFrame,
    scale: number,
  ): SpritePasses => {
    const width = sprite.width * scale,
      height = sprite.height * scale,
      hidden: T.Object3D[] = [],
      swapped: {
        mesh: T.Mesh<T.BufferGeometry, T.Material>;
        material: T.Material;
        colour: T.BufferAttribute | T.InterleavedBufferAttribute | null;
      }[] = [];
    fig.turn.rotation.y = (yawDegrees * Math.PI) / 180;
    blend = 1;
    // Twice: some poses aim a prop from where the previous frame left the hands.
    for (let i = 0; i < 2; i++) applyPose(fig, poses[pose](at, fig), at);
    applyFace(fig, fig.face || poseFaces[pose], poseGazes[pose]);
    fig.X.eyes.scale.y = 1;
    fig.X.eyes.position.y = 0;
    fig.turn.updateMatrixWorld(true);
    const left = (-sprite.centreX - 0.5) * benGScale,
      top = (sprite.groundY + 1) * benGScale,
      lens = new T.OrthographicCamera(
        left,
        left + sprite.width * benGScale,
        top,
        top - sprite.height * benGScale,
        64 * benGScale,
        96 * benGScale,
      );
    lens.position.set(0, 0, 80 * benGScale);
    lens.lookAt(0, 0, 0);
    lens.updateProjectionMatrix();
    const target = new T.WebGLRenderTarget(width, height, { samples: 0 }),
      pixels = new Uint8Array(width * height * 4),
      override = scene.overrideMaterial;
    pedestal.visible = false;
    fig.turn.traverse((object) => {
      const mesh = object as T.Mesh<T.BufferGeometry, T.Material>;
      if (!mesh.isMesh && !(object as T.Line).isLine) return;
      const material = mesh.material as T.MeshToonMaterial;
      if (
        !mesh.isMesh ||
        mesh.userData.ol ||
        mesh.material === inkMaterial ||
        !material.visible ||
        material.transparent
      ) {
        if (object.visible) {
          hidden.push(object);
          object.visible = false;
        }
        return;
      }
      const palette = mesh.geometry.getAttribute("colorEga") ?? null;
      swapped.push({
        mesh,
        material,
        colour: palette ? mesh.geometry.getAttribute("color") : null,
      });
      if (palette) mesh.geometry.setAttribute("color", palette);
      mesh.material = new T.MeshBasicMaterial({
        color: material.vertexColors ? 0xffffff : paletteColour(material.color.getHex(), fig.P.col),
        vertexColors: material.vertexColors,
        side: T.DoubleSide,
        toneMapped: false,
        alphaMap: material.alphaMap,
        alphaTest: material.alphaTest,
      });
    });
    const restore = (): void => {
      for (const { mesh, material, colour } of swapped.splice(0)) {
        mesh.material.dispose();
        mesh.material = material;
        if (colour) mesh.geometry.setAttribute("color", colour);
      }
    };
    const pass = (): string => {
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, lens);
      renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
      const flipped = new Uint8Array(pixels.length),
        stride = width * 4;
      for (let y = 0; y < height; y++)
        flipped.set(pixels.subarray((height - 1 - y) * stride, (height - y) * stride), y * stride);
      let binary = "";
      for (let i = 0; i < flipped.length; i += 0x8000)
        binary += String.fromCharCode(...flipped.subarray(i, i + 0x8000));
      return btoa(binary);
    };
    const normalMaterial = new T.MeshNormalMaterial({ side: T.DoubleSide }),
      depthMaterial = new T.MeshDepthMaterial({ side: T.DoubleSide });
    try {
      const colour = pass();
      restore();
      scene.overrideMaterial = normalMaterial;
      const normal = pass();
      scene.overrideMaterial = depthMaterial;
      const depth = pass();
      return { width, height, scale, colour, normal, depth, depthRange: 32 };
    } finally {
      restore();
      scene.overrideMaterial = override;
      for (const object of hidden) object.visible = true;
      pedestal.visible = true;
      renderer.setRenderTarget(null);
      renderer.setClearColor(0x000000, 0);
      target.dispose();
      normalMaterial.dispose();
      depthMaterial.dispose();
    }
  };
  window.benG = { poses: posePicks.map(([id]) => id), spritePasses };
}

start();
