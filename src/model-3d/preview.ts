// Presents a separate Three.js character turntable with rig, pose, movement and sprite-reference controls.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createBenModel, type BenModel } from "./model.ts";
import {
  benBuilds,
  createHybridBenModel,
  shirtPrints,
  type BenBuild,
  type HybridBenModel,
} from "./hybrid.ts";
import { headStyles } from "./head.ts";
import {
  applyBenPose,
  poseNames,
  poseDuration,
  syncLegJoints,
  serialisePose,
  ladder,
  ladderRungs,
  type BenPose,
} from "./poses.ts";
import skinSvg from "../../source/ben-3d-skins.svg?raw";
import config from "../../source/ben-3d.json";
import type { WorkshopData } from "../types.ts";

export function mountBen3D(data: WorkshopData): void {
  const mount = document.querySelector<HTMLElement>("#ben-3d");
  if (!mount) return;
  const section: HTMLElement = mount;
  section.innerHTML = `<h2>Ben in three dimensions</h2><p>A lean, rigged character with a vented bicycle helmet, brown-blond hair, a white-collared shirt, tapered jeans, red running shoes with white soles and a holstered Fizz Stunner. The SVG artwork is bound to the curved surfaces.</p><div class="controls"><button id="model-play">Pause rotation</button><label>Pose <select id="model-pose">${poseNames.map((name) => `<option>${name}</option>`).join("")}</select></label><label>Build <select id="model-build">${benBuilds.map((build) => `<option value="${build.id}">${build.label}</option>`).join("")}</select></label><label>Head style <select id="model-head"></select></label><label>Shirt print <select id="model-print">${shirtPrints.map((print) => `<option value="${print.id}">${print.label}</option>`).join("")}</select></label><label>View <select id="model-camera"><option value="studio">Studio · orbit freely</option><option value="sprite">Sprite orthographic</option></select></label><label><input id="model-rig" type="checkbox">Show skeleton</label><label><input id="model-animate" type="checkbox" checked>Animate pose</label><button id="model-reset">Reset model</button></div><label class="rig-scrubber">Turn <input id="model-yaw" type="range" min="0" max="360" value="25"><output id="model-angle">25°</output></label><div class="model-comparison"><div class="model-stage"><canvas id="model-canvas" aria-label="Rigged three-dimensional Ben character" role="img"></canvas><p id="model-status" class="small" role="status"></p></div><article class="model-reference"><h3>Calibrated sprite reference</h3><label>Reference <select id="model-reference">${config.references.map((ref, i) => `<option value="${i}">${ref.label}</option>`).join("")}</select></label><canvas id="model-sprite" width="320" height="440" role="img" aria-label="Calibrated sprite for model proportion review"></canvas><div class="controls"><button id="model-align">Match reference view</button><label><input id="model-overlay" type="checkbox">Overlay reference</label></div><p class="small">Orthographic view uses the same 32 × 44 frame and one world unit per source pixel. Compare the standing pose for proportions; the quarter sprites have different hand and foot poses.</p></article></div><details class="model-rig-controls"><summary>Pose the rig and move Ben</summary><div class="controls"><label>Bone <select id="model-bone">${config.bones
    .filter((b) => !b.name.endsWith("Knee") && b.name !== "muzzleFlash")
    .map((b) => `<option>${b.name}</option>`)
    .join(
      "",
    )}</select></label>${["x", "y", "z"].map((axis) => `<label>Rotate ${axis.toUpperCase()} <input data-joint-axis="${axis}" type="range" min="-150" max="150" value="0"></label>`).join("")}<button id="model-export-pose">Save pose JSON</button></div><div class="controls">${["x", "y", "z"].map((axis) => `<label>Position ${axis.toUpperCase()} <input data-model-position="${axis}" type="range" min="-10" max="10" step="0.25" value="0"></label>`).join("")}</div></details><p class="small"><a href="models/ben-3d/ben.glb" download>Download rigged GLB + animations</a> · <a href="models/ben-3d/rig.json">Rig configuration</a> · <a href="models/ben-3d/skins.svg">SVG skin layers</a> · <a href="docs/BEN_3D.md">Model and proportion review</a></p>`;
  const $ = <T extends HTMLElement>(q: string): T =>
    section.querySelector<T>(q)!;
  const canvas = $<HTMLCanvasElement>("#model-canvas"),
    stage = $<HTMLElement>(".model-stage"),
    sprite = $<HTMLCanvasElement>("#model-sprite"),
    status = $<HTMLElement>("#model-status");
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
  } catch {
    status.textContent =
      "WebGL 2 is unavailable. The downloadable model and sprite previews are still available.";
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor("#1b2b23");
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene(),
    build = (id: BenBuild): BenModel | HybridBenModel =>
      id === "hybrid" ? createHybridBenModel(skinSvg) : createBenModel(skinSvg);
  let buildId: BenBuild = "hybrid",
    model = build(buildId);
  scene.add(model.root);
  applyBenPose(model, "Standing");
  const studio = new THREE.PerspectiveCamera(35, 1, 0.1, 300);
  studio.position.set(-36, 27, 63);
  const ortho = new THREE.OrthographicCamera(-15.5, 16.5, 34.5, -9.5, 0.1, 200);
  ortho.position.set(0, 0, 80);
  ortho.lookAt(0, 0, 0);
  const controls = new OrbitControls(studio, canvas);
  controls.target.set(0, 15.3, 0);
  controls.enableDamping = true;
  controls.minDistance = 38;
  controls.maxDistance = 120;
  controls.maxPolarAngle = Math.PI * 0.78;
  controls.update();
  scene.add(new THREE.HemisphereLight("#ffffff", "#516447", 2.2));
  const key = new THREE.DirectionalLight("#fff3dc", 3.0);
  key.position.set(-20, 44, 35);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -25;
  key.shadow.camera.right = 25;
  key.shadow.camera.top = 38;
  key.shadow.camera.bottom = -10;
  key.shadow.normalBias = 0.12;
  key.shadow.bias = -0.0005;
  scene.add(key);
  const fill = new THREE.DirectionalLight("#b9d7ff", 1.2);
  fill.position.set(30, 22, -25);
  scene.add(fill);
  const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(13, 13, 0.35, 64),
    new THREE.MeshStandardMaterial({ color: "#263e30", roughness: 0.9 }),
  );
  floor.position.y = -0.72;
  floor.receiveShadow = true;
  scene.add(floor);
  // A ladder prop for the climb; it follows Ben's turn and scrolls down as he climbs in place.
  const ladderProp = new THREE.Group(),
    rail = new THREE.BoxGeometry(0.35, 34, 0.35),
    rung = new THREE.CylinderGeometry(
      0.17,
      0.17,
      ladder.halfWidth * 2,
      10,
    ).rotateZ(Math.PI / 2),
    wood = new THREE.MeshStandardMaterial({
      color: data.palette.N ?? "#aa5500",
      roughness: 0.8,
    });
  for (const side of [-1, 1]) {
    const mesh = new THREE.Mesh(rail, wood);
    mesh.position.set(side * ladder.halfWidth, 14, ladder.z + 0.2);
    ladderProp.add(mesh);
  }
  const rungs = ladderRungs(0).map(() => {
    const mesh = new THREE.Mesh(rung, wood);
    ladderProp.add(mesh);
    return mesh;
  });
  ladderProp.visible = false;
  model.root.add(ladderProp);
  const placeLadder = (shown: BenPose, at: number): void => {
    ladderProp.visible = shown === "Climb";
    if (!ladderProp.visible) return;
    const r = ladder.rungSpacing,
      shift = (((-2 * r * at) % r) + r) % r;
    rungs.forEach((mesh, k) =>
      mesh.position.set(
        0,
        ladder.top - r * 10 + shift + k * r - 0.17,
        ladder.z,
      ),
    );
  };
  let helper = new THREE.SkeletonHelper(model.root);
  helper.visible = false;
  (Array.isArray(helper.material)
    ? helper.material
    : [helper.material]
  ).forEach((m) => (m.depthTest = false));
  scene.add(helper);
  const overlayCanvas = document.createElement("canvas");
  overlayCanvas.id = "model-sprite-overlay";
  overlayCanvas.width = 320;
  overlayCanvas.height = 440;
  overlayCanvas.setAttribute("aria-hidden", "true");
  stage.append(overlayCanvas);
  let pose: BenPose = "Standing",
    yaw = 25,
    rotation = !matchMedia("(prefers-reduced-motion: reduce)").matches,
    animate = true,
    last = performance.now(),
    phase = 0,
    dead = false,
    visible = true,
    dirty = true;
  section.addEventListener("input", () => {
    dirty = true;
  });
  section.addEventListener("change", () => {
    dirty = true;
  });
  section.addEventListener("click", () => {
    dirty = true;
  });
  controls.addEventListener("change", () => {
    dirty = true;
  });
  const overrides = new Map<string, THREE.Euler>(),
    position = new THREE.Vector3();
  const cameraSelect = $<HTMLSelectElement>("#model-camera"),
    referenceSelect = $<HTMLSelectElement>("#model-reference"),
    yawSlider = $<HTMLInputElement>("#model-yaw"),
    play = $<HTMLButtonElement>("#model-play");
  const updatePlay = (): void => {
    play.textContent = rotation ? "Pause rotation" : "Play rotation";
    play.setAttribute("aria-pressed", String(rotation));
  };
  updatePlay();
  play.onclick = () => {
    rotation = !rotation;
    updatePlay();
  };
  yawSlider.oninput = () => {
    yaw = Number(yawSlider.value);
    rotation = false;
    updatePlay();
  };
  $<HTMLSelectElement>("#model-pose").onchange = (e) => {
    pose = (e.target as HTMLSelectElement).value as BenPose;
    overrides.clear();
    phase = 0;
    applyBenPose(model, pose);
  };
  // Rebuilding a head style takes a moment; the rest of the model and the pose are kept.
  $<HTMLSelectElement>("#model-head").onchange = (e) => {
    model.setHeadStyle((e.target as HTMLSelectElement).value);
    section.dataset.headStyle = model.headStyle();
    dirty = true;
  };
  // The hybrid has its own head and a choice of chest prints; the current build offers the head styles.
  const headSelect = $<HTMLSelectElement>("#model-head"),
    printSelect = $<HTMLSelectElement>("#model-print"),
    buildSelect = $<HTMLSelectElement>("#model-build");
  const syncBuildControls = (): void => {
    headSelect.innerHTML =
      buildId === "hybrid"
        ? `<option value="artifact">Artifact kid (hybrid head)</option>`
        : headStyles
            .map(
              (style) =>
                `<option value="${style.id}" title="${style.summary}">${style.label}</option>`,
            )
            .join("");
    headSelect.value = model.headStyle();
    headSelect.disabled = buildId === "hybrid";
    printSelect.disabled = buildId !== "hybrid";
    if ("print" in model) printSelect.value = model.print();
    buildSelect.value = buildId;
    section.dataset.build = buildId;
    section.dataset.headStyle = model.headStyle();
  };
  const setBuild = (id: BenBuild): void => {
    if (id === buildId) return;
    scene.remove(model.root, helper);
    model.root.remove(ladderProp);
    model.dispose();
    helper.dispose();
    buildId = id;
    model = build(id);
    scene.add(model.root);
    model.root.add(ladderProp);
    const shown = helper.visible;
    helper = new THREE.SkeletonHelper(model.root);
    helper.visible = shown;
    (Array.isArray(helper.material) ? helper.material : [helper.material]).forEach(
      (m) => (m.depthTest = false),
    );
    scene.add(helper);
    overrides.clear();
    applyBenPose(model, pose, phase);
    syncBuildControls();
    dirty = true;
  };
  buildSelect.onchange = () => setBuild(buildSelect.value as BenBuild);
  printSelect.onchange = () => {
    if ("setPrint" in model) model.setPrint(printSelect.value);
    dirty = true;
  };
  syncBuildControls();
  $<HTMLInputElement>("#model-rig").onchange = (e) => {
    helper.visible = (e.target as HTMLInputElement).checked;
  };
  $<HTMLInputElement>("#model-animate").onchange = (e) => {
    animate = (e.target as HTMLInputElement).checked;
  };
  const drawReference = (): void => {
    const ref = config.references[Number(referenceSelect.value)],
      frame = data.frames[ref.frame],
      context = sprite.getContext("2d")!,
      ghost = overlayCanvas.getContext("2d")!;
    context.clearRect(0, 0, 320, 440);
    ghost.clearRect(0, 0, 320, 440);
    frame.grid.forEach((row, y) =>
      [...row].forEach((code, x) => {
        const colour = data.palette[code];
        if (colour) {
          context.fillStyle = colour;
          context.fillRect(x * 10, y * 10, 10, 10);
          ghost.fillStyle = colour;
          ghost.fillRect(x * 10, y * 10, 10, 10);
        }
      }),
    );
  };
  const align = (): void => {
    yaw = config.references[Number(referenceSelect.value)].angle;
    cameraSelect.value = "sprite";
    pose = "Standing";
    $<HTMLSelectElement>("#model-pose").value = pose;
    overrides.clear();
    position.set(0, 0, 0);
    section
      .querySelectorAll<HTMLInputElement>("[data-model-position]")
      .forEach((input) => (input.value = "0"));
    applyBenPose(model, pose);
    rotation = false;
    updatePlay();
    drawReference();
  };
  referenceSelect.onchange = drawReference;
  $<HTMLButtonElement>("#model-align").onclick = align;
  drawReference();
  $<HTMLInputElement>("#model-overlay").onchange = (e) => {
    overlayCanvas.style.display = (e.target as HTMLInputElement).checked
      ? "block"
      : "none";
  };
  section.querySelectorAll<HTMLInputElement>("[data-joint-axis]").forEach(
    (input) =>
      (input.oninput = () => {
        const name = $<HTMLSelectElement>("#model-bone").value,
          e = overrides.get(name) ?? model.bones[name].rotation.clone();
        e[input.dataset.jointAxis as "x" | "y" | "z"] =
          THREE.MathUtils.degToRad(Number(input.value));
        overrides.set(name, e);
        animate = false;
        $<HTMLInputElement>("#model-animate").checked = false;
      }),
  );
  $<HTMLSelectElement>("#model-bone").onchange = () => {
    const bone = model.bones[$<HTMLSelectElement>("#model-bone").value];
    section
      .querySelectorAll<HTMLInputElement>("[data-joint-axis]")
      .forEach(
        (input) =>
          (input.value = String(
            Math.round(
              THREE.MathUtils.radToDeg(
                bone.rotation[input.dataset.jointAxis as "x" | "y" | "z"],
              ),
            ),
          )),
      );
  };
  section.querySelectorAll<HTMLInputElement>("[data-model-position]").forEach(
    (input) =>
      (input.oninput = () => {
        position[input.dataset.modelPosition as "x" | "y" | "z"] = Number(
          input.value,
        );
      }),
  );
  $<HTMLButtonElement>("#model-reset").onclick = () => {
    pose = "Standing";
    yaw = 25;
    phase = 0;
    position.set(0, 0, 0);
    overrides.clear();
    $<HTMLSelectElement>("#model-pose").value = pose;
    applyBenPose(model, pose);
  };
  $<HTMLButtonElement>("#model-export-pose").onclick = () => {
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(serialisePose(model), null, 2)], {
          type: "application/json",
        }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "ben-custom-pose.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const resize = (): void => {
    dirty = true;
    const width = Math.max(240, stage.clientWidth),
      height = 520;
    renderer.setSize(width, height, false);
    studio.aspect = width / height;
    studio.updateProjectionMatrix();
    const span = (44 * width) / height;
    ortho.left = 0.5 - span / 2;
    ortho.right = 0.5 + span / 2;
    ortho.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  resize();
  const intersection = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    dirty = true;
  });
  intersection.observe(section);
  const clean = (): void => {
    if (dead) return;
    dead = true;
    observer.disconnect();
    intersection.disconnect();
    controls.dispose();
    helper.geometry.dispose();
    (helper.material as THREE.Material).dispose();
    floor.geometry.dispose();
    (floor.material as THREE.Material).dispose();
    rail.dispose();
    rung.dispose();
    wood.dispose();
    model.dispose();
    renderer.dispose();
  };
  window.addEventListener("pagehide", clean, { once: true });
  let frame = 0;
  function tick(now: number): void {
    if (dead) return;
    const dt = Math.max(0, Math.min(0.06, (now - last) / 1000));
    last = now;
    controls.enabled = cameraSelect.value === "studio";
    if (visible && controls.enabled) controls.update();
    if (
      visible &&
      (dirty || rotation || (animate && poseDuration(pose) !== null))
    ) {
      if (rotation) yaw = (yaw + dt * 24) % 360;
      if (animate && poseDuration(pose) !== null)
        phase = (phase + dt / (poseDuration(pose) ?? 1)) % 1;
      applyBenPose(model, pose, phase);
      placeLadder(pose, phase);
      for (const [name, e] of overrides) model.bones[name].rotation.copy(e);
      syncLegJoints(model);
      model.root.rotation.y = THREE.MathUtils.degToRad(yaw);
      model.root.position.copy(position);
      model.root.updateMatrixWorld(true);
      model.skeleton.update();
      controls.enabled = cameraSelect.value === "studio";
      controls.update();
      floor.visible = cameraSelect.value === "studio";
      renderer.render(scene, cameraSelect.value === "sprite" ? ortho : studio);
      yawSlider.value = String(Math.round(yaw));
      $<HTMLOutputElement>("#model-angle").textContent = Math.round(yaw) + "°";
      section.dataset.angle = String(Math.round(yaw));
      section.dataset.pose = pose;
      section.dataset.phase = String(phase);
      section.dataset.ready = "true";
      overlayCanvas.classList.toggle(
        "visible",
        cameraSelect.value === "sprite",
      );
      dirty = false;
      if (frame++ % 30 === 0)
        status.textContent = `${model.skeleton.bones.length} bones · ${model.meshes.length} volumetric/detail meshes · ${pose}`;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  const renderReview = (
    angle: number,
    width = 320,
    height = 440,
    part = "all",
    reviewPose: BenPose = "Standing",
    reviewPhase = 0,
  ): { width: number; height: number; pixels: number[] } => {
    const oldPose = pose,
      oldRotation = rotation,
      oldYaw = yaw,
      oldTarget = renderer.getRenderTarget(),
      oldColour = renderer.getClearColor(new THREE.Color()),
      oldAlpha = renderer.getClearAlpha(),
      oldFloor = floor.visible,
      oldHelper = helper.visible;
    const oldVisibility = model.meshes.map((m) => m.visible),
      oldPosition = model.root.position.clone();
    applyBenPose(model, reviewPose, reviewPhase);
    placeLadder(reviewPose, reviewPhase);
    model.root.position.set(0, 0, 0);
    model.root.rotation.y = THREE.MathUtils.degToRad(angle);
    model.root.updateMatrixWorld(true);
    model.skeleton.update();
    if (part !== "all")
      model.meshes.forEach(
        (m) =>
          (m.visible =
            part === "helmet"
              ? /^Helmet|^helmet-/.test(m.name)
              : part === "head"
                ? m.userData.bone === "head" && !/^Helmet|^helmet-/.test(m.name)
                : part === "shoes"
                  ? /Foot|Toe/.test(m.userData.bone ?? "")
                  : true),
      );
    floor.visible = false;
    helper.visible = false;
    const camera = new THREE.OrthographicCamera(
      -15.5,
      16.5,
      34.5,
      -9.5,
      0.1,
      200,
    );
    camera.position.set(0, 0, 80);
    camera.lookAt(0, 0, 0);
    if (reviewPose !== "Standing") {
      camera.top += 4;
      camera.bottom += 4;
      camera.updateProjectionMatrix();
    }
    const target = new THREE.WebGLRenderTarget(width, height, { samples: 4 });
    renderer.setRenderTarget(target);
    renderer.setClearColor("#000000", 0);
    renderer.render(scene, camera);
    const pixels = new Uint8Array(width * height * 4);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    renderer.setRenderTarget(oldTarget);
    renderer.setClearColor(oldColour, oldAlpha);
    target.dispose();
    dirty = true;
    floor.visible = oldFloor;
    helper.visible = oldHelper;
    model.meshes.forEach((m, i) => (m.visible = oldVisibility[i]));
    model.root.position.copy(oldPosition);
    pose = oldPose;
    rotation = oldRotation;
    yaw = oldYaw;
    applyBenPose(model, pose, phase);
    placeLadder(pose, phase);
    model.root.rotation.y = THREE.MathUtils.degToRad(yaw);
    return { width, height, pixels: Array.from(pixels) };
  };
  // A perspective view from any camera position, for close inspection from below, behind or the sides.
  const captureView = (
    eye: readonly number[],
    look: readonly number[],
    reviewPose: BenPose = "Standing",
    reviewPhase = 0,
    width = 640,
    height = 640,
    fov = 30,
    turn = 0,
  ): string => {
    const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 300),
      target = new THREE.WebGLRenderTarget(width, height, { samples: 4 }),
      oldTarget = renderer.getRenderTarget(),
      oldPosition = model.root.position.clone(),
      oldYaw = model.root.rotation.y;
    camera.position.set(eye[0], eye[1], eye[2]);
    camera.lookAt(look[0], look[1], look[2]);
    applyBenPose(model, reviewPose, reviewPhase);
    placeLadder(reviewPose, reviewPhase);
    model.root.position.set(0, 0, 0);
    model.root.rotation.y = THREE.MathUtils.degToRad(turn);
    model.root.updateMatrixWorld(true);
    model.skeleton.update();
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    const pixels = new Uint8Array(width * height * 4);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    renderer.setRenderTarget(oldTarget);
    target.dispose();
    model.root.position.copy(oldPosition);
    model.root.rotation.y = oldYaw;
    applyBenPose(model, pose, phase);
    dirty = true;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const bytes = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++)
      bytes.set(
        pixels.subarray((height - 1 - y) * width * 4, (height - y) * width * 4),
        y * width * 4,
      );
    canvas
      .getContext("2d")!
      .putImageData(new ImageData(bytes, width, height), 0, 0);
    return canvas.toDataURL("image/png");
  };
  const captureReview = (
    angle: number,
    width = 320,
    height = 440,
    part = "all",
    pose: BenPose = "Standing",
    phase = 0,
  ): string => {
    const result = renderReview(angle, width, height, part, pose, phase),
      canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const bytes = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width * 4; x++)
        bytes[y * width * 4 + x] =
          result.pixels[(height - 1 - y) * width * 4 + x];
    canvas
      .getContext("2d")!
      .putImageData(new ImageData(bytes, width, height), 0, 0);
    return canvas.toDataURL("image/png");
  };
  // Browser review automation uses the same live model and orthographic camera, without a second implementation.
  Object.assign(section, {
    modelReview: {
      get model() {
        return model;
      },
      setBuild,
      setPrint: (id: string) => {
        if ("setPrint" in model) model.setPrint(id);
        printSelect.value = id;
        dirty = true;
      },
      renderer,
      scene,
      camera: ortho,
      align,
      setHeadStyle: (id: string) => {
        model.setHeadStyle(id);
        $<HTMLSelectElement>("#model-head").value = model.headStyle();
        section.dataset.headStyle = model.headStyle();
      },
      renderReview,
      captureReview,
      captureView,
      setAngle: (value: number) => {
        yaw = value;
        rotation = false;
        cameraSelect.value = "sprite";
      },
      dispose: clean,
    },
  });
}
