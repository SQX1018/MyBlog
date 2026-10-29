import {
  AmbientLight,
  Box3,
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SphereGeometry,
  Spherical,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ECAL, crystals, parts, steps, type PartId } from "@/data/ecal";

const STEP_DURATION = 3200;
const totalDuration = steps.length * STEP_DURATION;
type Cell = {
  object: Group;
  row: number;
  column: number;
  baseY: number;
  lift: number;
};
type Surface = {
  mesh: Mesh;
  material: MeshStandardMaterial;
  part: PartId;
  crystal?: string;
  original: Color;
};

export function mountEcalExplorer(root: HTMLElement): () => void {
  const canvas = root.querySelector<HTMLCanvasElement>("[data-ecal-canvas]")!;
  const abort = new AbortController();
  const signal = abort.signal;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let renderer: WebGLRenderer | undefined;
  let controls: OrbitControls | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let themeObserver: MutationObserver | undefined;
  let intersectionObserver: IntersectionObserver | undefined;
  let disposed = false;
  let frame = 0;
  let visible = true;
  let inViewport = true;
  let dirty = true;
  let mode: "structure" | "demo" = "structure";
  let selected: PartId = "crystals";
  let selectedCrystal: string | undefined;
  let exploded = 0;
  let stepIndex = 0;
  let demoTime = 0;
  let playing = false;
  let lastTime = 0;
  const scene = new Scene();
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const cells: Cell[] = [];
  const surfaces: Surface[] = [];
  const selectable: Mesh[] = [];
  const groups = Object.fromEntries(
    parts.map(part => [part.id, new Group()])
  ) as Record<PartId, Group>;
  const stage = root.querySelector<HTMLElement>(".ecal-stage")!;
  const explodeInput = root.querySelector<HTMLInputElement>("[data-explode]")!;
  const status = root.querySelector<HTMLElement>("[data-render-status]")!;
  const labels = [...root.querySelectorAll<HTMLElement>("[data-model-label]")];
  const initialTarget = new Vector3(0, 35, 0);
  const camera = new PerspectiveCamera(40, 1, 1, 5000);
  camera.position.set(540, 440, 610);
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  let pointerDown = { x: 0, y: 0 };

  function dispose() {
    if (disposed) return;
    disposed = true;
    abort.abort();
    cancelAnimationFrame(frame);
    frame = 0;
    playing = false;
    controls?.dispose();
    resizeObserver?.disconnect();
    themeObserver?.disconnect();
    intersectionObserver?.disconnect();
    reduceMotion.removeEventListener("change", onReducedMotion);
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    renderer?.dispose();
    renderer?.forceContextLoss();
    root.dataset.playing = "false";
  }

  function fallback(message: string) {
    dispose();
    root.dataset.state = "fallback";
    status.textContent = message;
    root
      .querySelectorAll<HTMLButtonElement | HTMLInputElement>("button,input")
      .forEach(element => {
        element.disabled = true;
      });
    labels.forEach(label => {
      label.hidden = true;
    });
  }

  function requestRender() {
    dirty = true;
    if (!disposed && visible && !frame) frame = requestAnimationFrame(tick);
  }

  function ownGeometry<T extends BufferGeometry>(geometry: T): T {
    geometries.add(geometry);
    return geometry;
  }
  function ownMaterial<T extends Material>(material: T): T {
    materials.add(material);
    return material;
  }
  const boxGeometry = ownGeometry(new BoxGeometry(1, 1, 1));
  const boxEdges = ownGeometry(new EdgesGeometry(boxGeometry));
  const boltGeometry = ownGeometry(new CylinderGeometry(3.4, 3.4, 1, 12));
  const outline = ownMaterial(
    new LineBasicMaterial({ color: 0x555c63, transparent: true, opacity: 0.24 })
  );
  const baseColors: Record<PartId, number> = {
    crystals: 0xd9c58a,
    apd: 0x866793,
    fam: 0x427f68,
    fee: 0x477b9d,
    support: 0x9baebc,
  };

  function box(
    parent: Group,
    part: PartId,
    size: [number, number, number],
    position: [number, number, number],
    color = baseColors[part],
    crystal?: string,
    outlined = false
  ) {
    const material = ownMaterial(
      new MeshStandardMaterial({
        color,
        roughness: part === "crystals" ? 0.32 : 0.65,
        metalness: part === "support" ? 0.4 : 0.08,
      })
    );
    const mesh = new Mesh(boxGeometry, material);
    mesh.position.set(...position);
    mesh.scale.set(...size);
    mesh.userData = { part, crystal };
    parent.add(mesh);
    surfaces.push({
      mesh,
      material,
      part,
      crystal,
      original: new Color(color),
    });
    selectable.push(mesh);
    if (outlined) {
      const edges = new LineSegments(boxEdges, outline);
      mesh.add(edges);
    }
    return mesh;
  }

  function buildModel() {
    Object.values(groups).forEach(group => scene.add(group));
    crystals.forEach(({ row, column, id }) => {
      for (const [part, baseY, lift] of [
        ["crystals", 0, 65],
        ["apd", 0, -25],
        ["fam", 0, -70],
      ] as const) {
        const cell = new Group();
        groups[part].add(cell);
        cells.push({ object: cell, row, column, baseY, lift });
        if (part === "crystals") {
          box(
            cell,
            part,
            [ECAL.crystal.width, ECAL.crystal.height, ECAL.crystal.depth],
            [0, 75, 0],
            baseColors[part],
            id,
            true
          );
          // A fine inset on the top face makes the packing visible without changing pitch.
          box(cell, part, [57.5, 0.2, 57.5], [0, 150.15, 0], 0xf0dfae, id);
        } else if (part === "apd") {
          box(cell, part, [40, 2, 40], [0, -8, 0], 0xb9b4a4, id);
          box(cell, part, [14, 2, 19], [-9, -6, 0], 0x745681, id);
          box(cell, part, [9, 2, 13], [9, -6, 0], 0x745681, id);
          box(cell, part, [35, 4, 35], [0, -12, 0], 0x7f8c96, id);
        } else {
          box(cell, part, [49, 2.5, 49], [0, -26, 0], baseColors.fam, id);
          box(cell, part, [13, 3, 10], [-8, -23.3, -6], 0x263943, id);
          box(cell, part, [8, 3, 13], [10, -23.3, 7], 0x263943, id);
          box(cell, part, [30, 2.5, 12], [0, -31, 0], 0x8d9aa1, id);
        }
      }
    });
    box(
      groups.fee,
      "fee",
      [292, 58, 3],
      [0, -44, 174],
      undefined,
      undefined,
      true
    );
    for (const x of [-105, -35, 35, 105]) {
      box(groups.fee, "fee", [25, 21, 5], [x, -38, 178], 0x263943);
      box(groups.fee, "fee", [17, 6, 7], [x, -61, 180], 0xc0b58d);
    }
    box(
      groups.support,
      "support",
      [332, 10, 332],
      [0, -76, 0],
      undefined,
      undefined,
      true
    );
    for (const z of [-159, 159])
      box(groups.support, "support", [326, 5, 8], [0, 154, z]);
    for (const x of [-159, 159])
      box(groups.support, "support", [8, 5, 326], [x, 154, 0]);
    for (const x of [-159, 159]) {
      for (const z of [-159, 159]) {
        box(groups.support, "support", [5, 225, 5], [x, 38, z]);
        const bolt = new Mesh(
          boltGeometry,
          ownMaterial(
            new MeshStandardMaterial({
              color: 0x8799a9,
              metalness: 0.7,
              roughness: 0.4,
            })
          )
        );
        bolt.position.set(x, 158, z);
        bolt.scale.y = 4;
        groups.support.add(bolt);
      }
    }
    scene.add(new AmbientLight(0xffffff, 2));
    const key = new DirectionalLight(0xfff7e4, 3.1);
    key.position.set(200, 550, 300);
    scene.add(key);
    const fill = new DirectionalLight(0xb9d9ff, 1.3);
    fill.position.set(-300, 120, -200);
    scene.add(fill);
  }

  const demonstration = new Group();
  const incoming = new Group();
  const shower = new Group();
  const photons = new Group();
  const signalPath = new Group();
  const photonDots: Mesh[] = [];
  const electricDots: Mesh[] = [];
  const incomingDotMaterial = ownMaterial(
    new MeshBasicMaterial({ color: 0x5daeff })
  );
  const photonMaterial = ownMaterial(
    new MeshBasicMaterial({ color: 0xf6b939, depthTest: false })
  );
  const electricMaterial = ownMaterial(
    new MeshBasicMaterial({ color: 0x5daeff })
  );
  const dotGeometry = ownGeometry(new SphereGeometry(2.5, 10, 8));
  const photonRoute: Vector3[] = [];
  const electricalRoute = [
    new Vector3(0, -7, 0),
    new Vector3(0, -25, 0),
    new Vector3(0, -39, 80),
    new Vector3(0, -44, 178),
    new Vector3(60, -44, 178),
  ];

  function line(points: number[][], color: number, parent: Group, opacity = 1) {
    const vertices: number[] = [];
    for (let index = 1; index < points.length; index++)
      vertices.push(...points[index - 1], ...points[index]);
    const geometry = ownGeometry(new BufferGeometry());
    geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
    const material = ownMaterial(
      new LineBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthTest: false,
      })
    );
    const segment = new LineSegments(geometry, material);
    segment.renderOrder = 5;
    parent.add(segment);
  }

  const gammaDot = new Mesh(dotGeometry, incomingDotMaterial);
  function buildDemonstration() {
    scene.add(demonstration);
    demonstration.add(incoming, shower, photons, signalPath);
    line(
      [
        [0, 260, 0],
        [0, 135, 0],
      ],
      0x5daeff,
      incoming,
      0.8
    );
    line(
      [
        [-7, 150, 0],
        [0, 135, 0],
        [7, 150, 0],
      ],
      0x5daeff,
      incoming
    );
    incoming.add(gammaDot);
    line(
      [
        [0, 135, 0],
        [-12, 108, 8],
        [-28, 80, 15],
        [-60, 35, 28],
      ],
      0xf6b939,
      shower
    );
    line(
      [
        [0, 135, 0],
        [16, 103, -12],
        [28, 77, -24],
        [55, 32, -45],
      ],
      0xf6b939,
      shower
    );
    line(
      [
        [-12, 108, 8],
        [-40, 86, -10],
        [-70, 48, -32],
      ],
      0xf6b939,
      shower,
      0.7
    );
    line(
      [
        [28, 77, -24],
        [15, 53, 5],
        [30, 21, 20],
      ],
      0xf6b939,
      shower,
      0.7
    );
    for (let index = 0; index < 20; index++) {
      const dot = new Mesh(dotGeometry, photonMaterial);
      dot.renderOrder = 6;
      photons.add(dot);
      photonDots.push(dot);
      photonRoute.push(
        new Vector3(
          Math.sin(index * 2.4) * 24,
          40 + (index % 5) * 20,
          Math.cos(index * 1.8) * 24
        )
      );
    }
    line(
      electricalRoute.map(p => p.toArray()),
      0x5daeff,
      signalPath,
      0.8
    );
    line(
      [
        [0, -44, 178],
        [-45, -29, 178],
        [-90, -29, 178],
      ],
      0x5daeff,
      signalPath
    );
    line(
      [
        [0, -44, 178],
        [-45, -58, 178],
        [-90, -58, 178],
      ],
      0x5daeff,
      signalPath
    );
    for (let index = 0; index < 6; index++) {
      const dot = new Mesh(dotGeometry, electricMaterial);
      dot.material.depthTest = false;
      dot.renderOrder = 6;
      signalPath.add(dot);
      electricDots.push(dot);
    }
  }

  function updateMaterials() {
    const styles = getComputedStyle(root);
    const accent = new Color(styles.getPropertyValue("--accent").trim());
    for (const surface of surfaces) {
      const wasTransparent = surface.material.transparent;
      const focused =
        mode === "structure" &&
        (selectedCrystal
          ? surface.crystal === selectedCrystal && surface.part === "crystals"
          : surface.part === selected);
      surface.material.color.copy(surface.original);
      surface.material.emissive.setHex(0x000000);
      surface.material.emissiveIntensity = 0;
      if (focused) {
        surface.material.color.lerp(accent, 0.12);
        surface.material.emissive.copy(accent);
        surface.material.emissiveIntensity = 0.12;
      }
      if (mode === "demo") {
        const litCrystal =
          surface.part === "crystals" &&
          (surface.crystal === "C13" ||
            (stepIndex === 0 &&
              ["C12", "C14", "C08", "C18"].includes(surface.crystal ?? "")));
        const litAPD =
          stepIndex === 2 &&
          surface.part === "apd" &&
          surface.crystal === "C13";
        const litReadout =
          stepIndex === 3 &&
          ((surface.part === "fam" && surface.crystal === "C13") ||
            surface.part === "fee");
        if (litCrystal && stepIndex < 2) {
          surface.material.color.lerp(new Color(0xffd670), 0.55);
          surface.material.emissive.setHex(0xe7a229);
          surface.material.emissiveIntensity =
            surface.crystal === "C13" ? 0.3 : 0.07;
        }
        if (litAPD || litReadout) {
          surface.material.emissive.copy(accent);
          surface.material.emissiveIntensity = 0.65;
        }
        // Reveal the path through the central crystal without obscuring its shape.
        surface.material.transparent = surface.part === "crystals";
        surface.material.opacity = surface.material.transparent
          ? surface.crystal === "C13"
            ? 0.22
            : 0.1
          : 1;
        surface.material.depthWrite = !surface.material.transparent;
      } else {
        surface.material.transparent = false;
        surface.material.opacity = 1;
        surface.material.depthWrite = true;
      }
      // Transparency changes the shader's OPAQUE define as well as blend state.
      if (wasTransparent !== surface.material.transparent)
        surface.material.needsUpdate = true;
    }
    outline.color.set(styles.getPropertyValue("--foreground").trim());
    outline.opacity =
      document.documentElement.dataset.theme === "dark" ? 0.26 : 0.19;
    incomingDotMaterial.color.copy(accent);
    electricMaterial.color.copy(accent);
  }

  function applyExplosion(value: number) {
    exploded = Math.min(1, Math.max(0, value));
    const pitch = ECAL.crystal.width + exploded * 18;
    cells.forEach(cell =>
      cell.object.position.set(
        (cell.column - 2) * pitch,
        cell.baseY + cell.lift * exploded,
        (cell.row - 2) * pitch
      )
    );
    groups.fee.position.set(0, -80 * exploded, 35 * exploded);
    groups.support.position.y = -125 * exploded;
    // Move the top frame with the base; its open shape keeps the array accessible.
    explodeInput.value = String(Math.round(exploded * 100));
    root.querySelector<HTMLOutputElement>("[data-explode-value]")!.value =
      `${Math.round(exploded * 100)}%`;
    root.dataset.exploded = String(exploded);
    fitCamera();
    requestRender();
  }

  // Fit the real assembled/exploded geometry, leaving room for the overlay controls.
  // Zoom changes preserve the visitor's orbit and distance when the viewport resizes.
  function fitCamera() {
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    scene.updateMatrixWorld(true);
    camera.clearViewOffset();
    camera.aspect = rect.width / rect.height;
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const bounds = new Box3();
    Object.values(groups).forEach(group => bounds.expandByObject(group));
    if (mode === "demo") bounds.expandByObject(incoming);
    if (bounds.isEmpty()) return;
    const corners: Vector3[] = [];
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z])
          corners.push(new Vector3(x, y, z));
    const projected = corners.map(point => point.clone().project(camera));
    const sideLimit = Math.max(0.1, 1 - 48 / rect.width);
    const topLimit = Math.max(
      0.1,
      1 - (mode === "demo" ? 160 : 116) / rect.height
    );
    const toolbar = root.querySelector<HTMLElement>(".ecal-camera-tools")!;
    const bottomPadding = Math.max(112, toolbar.offsetHeight + 64);
    const bottomLimit = Math.max(0.1, 1 - (2 * bottomPadding) / rect.height);
    const minX = Math.min(...projected.map(point => point.x));
    const maxX = Math.max(...projected.map(point => point.x));
    const minY = Math.min(...projected.map(point => point.y));
    const maxY = Math.max(...projected.map(point => point.y));
    camera.zoom = Math.max(
      0.2,
      Math.min(
        1,
        (2 * sideLimit) / (maxX - minX),
        (topLimit + bottomLimit) / (maxY - minY)
      )
    );
    // Offset the frustum to centre the geometry in the usable region, not behind
    // the bottom toolbar. OrbitControls and Raycaster use this same projection.
    const centreX = ((minX + maxX) / 2) * camera.zoom;
    const centreY = ((minY + maxY) / 2) * camera.zoom;
    const desiredY = (topLimit - bottomLimit) / 2;
    camera.setViewOffset(
      rect.width,
      rect.height,
      (centreX * rect.width) / 2,
      ((desiredY - centreY) * rect.height) / 2,
      rect.width,
      rect.height
    );
    const pixels = corners.map(point => {
      const projectedPoint = point.clone().project(camera);
      return new Vector2(
        ((projectedPoint.x + 1) * rect.width) / 2,
        ((1 - projectedPoint.y) * rect.height) / 2
      );
    });
    root.dataset.fitBounds = JSON.stringify({
      left: Math.min(...pixels.map(p => p.x)),
      right: Math.max(...pixels.map(p => p.x)),
      top: Math.min(...pixels.map(p => p.y)),
      bottom: Math.max(...pixels.map(p => p.y)),
      width: rect.width,
      height: rect.height,
      bottomPadding,
    });
  }

  function selectPart(part: PartId, crystal?: string) {
    selected = part;
    selectedCrystal = part === "crystals" ? crystal : undefined;
    const data = parts.find(item => item.id === part)!;
    root.querySelector<HTMLElement>("[data-part-title]")!.textContent =
      selectedCrystal ? `${selectedCrystal} · ${data.name}` : data.name;
    root.querySelector<HTMLElement>("[data-part-description]")!.textContent =
      data.description;
    root.querySelector<HTMLElement>("[data-part-detail]")!.textContent =
      selectedCrystal
        ? `第 ${crystals.find(item => item.id === selectedCrystal)!.row + 1} 行，第 ${crystals.find(item => item.id === selectedCrystal)!.column + 1} 列。单根尺寸 60 × 60 × 150 mm。`
        : data.detail;
    root.querySelector<HTMLElement>("[data-crystal-name]")!.textContent =
      selectedCrystal ?? "5 × 5";
    root
      .querySelectorAll<HTMLButtonElement>("[data-part]")
      .forEach(button =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.part === part)
        )
      );
    root
      .querySelectorAll<HTMLButtonElement>("[data-crystal]")
      .forEach(button =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.crystal === selectedCrystal)
        )
      );
    root.dataset.selectedPart = part;
    root.dataset.selectedCrystal = selectedCrystal ?? "";
    updateMaterials();
    requestRender();
  }

  function updatePlayback() {
    root.dataset.playing = String(playing);
    root.dataset.step = String(stepIndex);
    const play = root.querySelector<HTMLButtonElement>(
      '[data-demo-action="play"]'
    )!;
    play.textContent = reduceMotion.matches
      ? "自动播放已关闭"
      : playing
        ? "暂停演示"
        : demoTime >= totalDuration
          ? "重播演示"
          : demoTime > 0
            ? "继续播放"
            : "播放演示";
    play.disabled = reduceMotion.matches;
    const stagePlay =
      root.querySelector<HTMLButtonElement>("[data-stage-play]")!;
    stagePlay.textContent = playing
      ? "暂停"
      : demoTime >= totalDuration
        ? "重播"
        : "播放";
    stagePlay.disabled = reduceMotion.matches;
    root.querySelector<HTMLButtonElement>(
      '[data-demo-action="previous"]'
    )!.disabled = stepIndex === 0;
    root.querySelector<HTMLButtonElement>(
      '[data-demo-action="next"]'
    )!.disabled = stepIndex === steps.length - 1;
  }

  function setStep(index: number, moveTime = true) {
    stepIndex = Math.min(steps.length - 1, Math.max(0, index));
    if (moveTime) demoTime = stepIndex * STEP_DURATION;
    root.querySelector<HTMLElement>("[data-step-title]")!.textContent =
      steps[stepIndex].title;
    root.querySelector<HTMLElement>("[data-step-description]")!.textContent =
      steps[stepIndex].description;
    root.querySelector<HTMLElement>("[data-active-step]")!.textContent =
      `${stepIndex + 1} / ${steps.length} · ${steps[stepIndex].title}`;
    root.querySelectorAll<HTMLButtonElement>("[data-step]").forEach(button => {
      if (Number(button.dataset.step) === stepIndex)
        button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
    updateMaterials();
    updatePlayback();
    requestRender();
  }

  function setMode(next: "structure" | "demo") {
    mode = next;
    playing = false;
    lastTime = 0;
    root.dataset.mode = mode;
    root.querySelector<HTMLElement>("[data-structure-panel]")!.hidden =
      mode !== "structure";
    root.querySelector<HTMLElement>("[data-demo-panel]")!.hidden =
      mode !== "demo";
    root
      .querySelectorAll<HTMLButtonElement>("[data-mode-button]")
      .forEach(button =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.modeButton === mode)
        )
      );
    if (mode === "demo") {
      applyExplosion(0);
      demoTime = 0;
      setStep(0);
    } else {
      updateMaterials();
      updatePlayback();
    }
    demonstration.visible = mode === "demo";
    fitCamera();
    requestRender();
  }

  function reset() {
    playing = false;
    demoTime = 0;
    lastTime = 0;
    controls?.reset();
    applyExplosion(0);
    selectPart("crystals");
    setStep(0);
    requestRender();
  }

  function moveCamera(action: string) {
    if (!controls) return;
    const offset = camera.position.clone().sub(controls.target);
    const spherical = new Spherical().setFromVector3(offset);
    if (action === "left") spherical.theta -= Math.PI / 12;
    if (action === "right") spherical.theta += Math.PI / 12;
    if (action === "up") spherical.phi -= Math.PI / 18;
    if (action === "down") spherical.phi += Math.PI / 18;
    if (action === "in") spherical.radius *= 0.85;
    if (action === "out") spherical.radius /= 0.85;
    spherical.radius = Math.max(
      controls.minDistance,
      Math.min(controls.maxDistance, spherical.radius)
    );
    spherical.phi = Math.max(0.12, Math.min(Math.PI - 0.12, spherical.phi));
    camera.position
      .copy(controls.target)
      .add(new Vector3().setFromSpherical(spherical));
    controls.update();
    requestRender();
  }

  function updateDemoObjects() {
    demonstration.visible = mode === "demo";
    if (mode !== "demo") return;
    const progress = playing
      ? (demoTime % STEP_DURATION) / STEP_DURATION
      : 0.55;
    incoming.visible = stepIndex === 0;
    shower.visible = stepIndex === 0;
    photons.visible = stepIndex === 1 || stepIndex === 2;
    signalPath.visible = stepIndex >= 2;
    gammaDot.position.set(0, 260 - progress * 125, 0);
    photonDots.forEach((dot, index) => {
      const fraction = playing
        ? (progress * 1.5 + index / photonDots.length) % 1
        : (index + 0.5) / photonDots.length;
      const origin = photonRoute[index];
      dot.position.copy(origin).lerp(new Vector3(0, -5, 0), fraction);
      dot.scale.setScalar(stepIndex === 2 ? 0.7 : 1);
    });
    electricDots.forEach((dot, index) => {
      const fraction = playing
        ? (progress + index / electricDots.length) % 1
        : (index + 0.5) / electricDots.length;
      const scaled = fraction * (electricalRoute.length - 1);
      const segment = Math.min(electricalRoute.length - 2, Math.floor(scaled));
      dot.position
        .copy(electricalRoute[segment])
        .lerp(electricalRoute[segment + 1], scaled - segment);
      dot.visible = stepIndex === 3 || fraction < 0.28;
    });
  }

  const labelPoints: Record<string, Vector3> = {
    crystals: new Vector3(190, 120, 70),
    apd: new Vector3(190, -7, 100),
    fam: new Vector3(185, -31, 110),
    fee: new Vector3(175, -44, 174),
  };
  function render() {
    if (!renderer || disposed) return;
    updateDemoObjects();
    renderer.render(scene, camera);
    const bounds = canvas.getBoundingClientRect();
    labels.forEach(label => {
      const part = label.dataset.modelLabel!;
      const vector = labelPoints[part].clone();
      if (part === "crystals") vector.y += exploded * 65;
      if (part === "apd") vector.y -= exploded * 25;
      if (part === "fam") vector.y -= exploded * 70;
      if (part === "fee") {
        vector.y -= exploded * 80;
        vector.z += exploded * 35;
      }
      vector.project(camera);
      label.hidden =
        exploded < 0.35 ||
        Math.abs(vector.x) > 0.9 ||
        Math.abs(vector.y) > 0.8 ||
        vector.z > 1;
      label.style.transform = `translate(${((vector.x + 1) * bounds.width) / 2}px, ${((1 - vector.y) * bounds.height) / 2}px)`;
    });
    root.dataset.frames = String(Number(root.dataset.frames ?? 0) + 1);
    root.dataset.camera = camera.position
      .toArray()
      .map(n => n.toFixed(1))
      .join(",");
    dirty = false;
  }

  function tick(time: number) {
    frame = 0;
    if (disposed || !visible) {
      lastTime = 0;
      return;
    }
    if (playing && !reduceMotion.matches) {
      if (lastTime)
        demoTime = Math.min(
          totalDuration,
          demoTime + Math.max(0, time - lastTime)
        );
      lastTime = time;
      const current = Math.min(
        steps.length - 1,
        Math.floor(demoTime / STEP_DURATION)
      );
      if (current !== stepIndex) setStep(current, false);
      if (demoTime >= totalDuration) {
        playing = false;
        lastTime = 0;
        updatePlayback();
      }
      dirty = true;
    }
    if (dirty) render();
    if (playing && !frame) frame = requestAnimationFrame(tick);
  }

  function syncVisibility() {
    visible = !document.hidden && inViewport;
    lastTime = 0;
    if (!visible) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else requestRender();
  }

  function onReducedMotion() {
    playing = false;
    lastTime = 0;
    updatePlayback();
    requestRender();
  }

  try {
    renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 0);
    controls = new OrbitControls(camera, canvas);
    controls.target.copy(initialTarget);
    controls.enablePan = false;
    controls.enableDamping = false;
    controls.minDistance = 440;
    controls.maxDistance = 1700;
    controls.minPolarAngle = 0.12;
    controls.maxPolarAngle = Math.PI - 0.12;
    controls.update();
    controls.saveState();
    controls.addEventListener("change", requestRender);
    buildModel();
    buildDemonstration();
    applyExplosion(0);
    updateMaterials();

    root
      .querySelectorAll<HTMLButtonElement | HTMLInputElement>("button,input")
      .forEach(element => {
        element.disabled = false;
      });
    root.addEventListener(
      "click",
      event => {
        const button = (event.target as Element).closest<HTMLButtonElement>(
          "button"
        );
        if (!button || button.disabled) return;
        if (button.dataset.part) selectPart(button.dataset.part as PartId);
        if (button.dataset.crystal)
          selectPart("crystals", button.dataset.crystal);
        if (button.dataset.camera) moveCamera(button.dataset.camera);
        if (button.hasAttribute("data-reset")) reset();
        if (button.dataset.modeButton)
          setMode(button.dataset.modeButton as "structure" | "demo");
        if (button.dataset.step !== undefined) {
          playing = false;
          lastTime = 0;
          setStep(Number(button.dataset.step));
        }
        const action = button.hasAttribute("data-stage-play")
          ? "play"
          : button.dataset.demoAction;
        if (action === "previous" || action === "next") {
          playing = false;
          lastTime = 0;
          setStep(stepIndex + (action === "next" ? 1 : -1));
        }
        if (action === "restart") {
          playing = false;
          lastTime = 0;
          setStep(0);
        }
        if (action === "play" && !reduceMotion.matches) {
          if (demoTime >= totalDuration) setStep(0);
          playing = !playing;
          lastTime = 0;
          updatePlayback();
          requestRender();
          if (playing && window.innerWidth < 768)
            stage.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      },
      { signal }
    );
    explodeInput.addEventListener(
      "input",
      () => applyExplosion(Number(explodeInput.value) / 100),
      { signal }
    );
    canvas.addEventListener(
      "keydown",
      event => {
        const actions: Record<string, string> = {
          ArrowLeft: "left",
          ArrowRight: "right",
          ArrowUp: "up",
          ArrowDown: "down",
          "+": "in",
          "=": "in",
          "-": "out",
        };
        if (actions[event.key]) {
          event.preventDefault();
          moveCamera(actions[event.key]);
        }
        if (event.key === "Home") {
          event.preventDefault();
          reset();
        }
      },
      { signal }
    );
    canvas.addEventListener(
      "pointerdown",
      event => {
        pointerDown = { x: event.clientX, y: event.clientY };
      },
      { signal }
    );
    canvas.addEventListener(
      "pointerup",
      event => {
        if (
          mode !== "structure" ||
          Math.hypot(
            event.clientX - pointerDown.x,
            event.clientY - pointerDown.y
          ) > 6
        )
          return;
        const rect = canvas.getBoundingClientRect();
        pointer.set(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(selectable, false)[0];
        if (hit)
          selectPart(
            hit.object.userData.part as PartId,
            hit.object.userData.part === "crystals"
              ? (hit.object.userData.crystal as string)
              : undefined
          );
      },
      { signal }
    );
    canvas.addEventListener(
      "webglcontextlost",
      event => {
        event.preventDefault();
        fallback(
          "三维视图已暂停。你仍可查看结构示意和下方说明，刷新页面可重新加载。"
        );
      },
      { signal }
    );
    document.addEventListener("visibilitychange", syncVisibility, { signal });
    reduceMotion.addEventListener("change", onReducedMotion);
    resizeObserver = new ResizeObserver(() => {
      if (!renderer || disposed) return;
      const bounds = stage.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      fitCamera();
      renderer.setSize(bounds.width, bounds.height, false);
      requestRender();
    });
    resizeObserver.observe(stage);
    themeObserver = new MutationObserver(() => {
      updateMaterials();
      requestRender();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    intersectionObserver = new IntersectionObserver(entries => {
      inViewport = entries[0].isIntersecting;
      syncVisibility();
    });
    intersectionObserver.observe(stage);
    setMode("structure");
    selectPart("crystals");
    root.dataset.crystalCount = String(crystals.length);
    root.dataset.crystalSize = `${ECAL.crystal.width},${ECAL.crystal.height},${ECAL.crystal.depth}`;
    root.dataset.pixelRatio = String(renderer.getPixelRatio());
    const initialBounds = stage.getBoundingClientRect();
    camera.aspect = initialBounds.width / initialBounds.height;
    camera.updateProjectionMatrix();
    renderer.setSize(initialBounds.width, initialBounds.height, false);
    render();
    root.dataset.state = "ready";
  } catch {
    fallback(
      "当前设备无法打开三维视图，已显示静态结构示意。部件和原理说明仍可在下方阅读。"
    );
  }
  return dispose;
}
