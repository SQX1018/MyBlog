import {
  AmbientLight,
  Box3,
  BoxGeometry,
  BufferGeometry,
  Color,
  CanvasTexture,
  ConeGeometry,
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
  PlaneGeometry,
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
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
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
  const compactViewport = window.matchMedia("(max-width: 767px)");
  const partDetailPanel =
    root.querySelector<HTMLDetailsElement>(".ecal-part-detail")!;
  const syncDetailPanel = () => {
    partDetailPanel.open = !compactViewport.matches;
  };
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
  let spread = false;
  let isolated = false;
  let isolatedCrystal = "C13";
  let hasSelection = false;
  let cameraTransition:
    { from: Vector3; to: Vector3; start: number } | undefined;
  let stepIndex = 0;
  let demoTime = 0;
  let playing = false;
  let lastTime = 0;
  const scene = new Scene();
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<CanvasTexture>();
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
  const preset = root.querySelector<HTMLSelectElement>("[data-view-preset]")!;
  const supportFrame = new Group();
  let contactShadow: Mesh | undefined;
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
    compactViewport.removeEventListener("change", syncDetailPanel);
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    textures.forEach(texture => texture.dispose());
    renderer?.dispose();
    renderer?.forceContextLoss();
    root.dataset.playing = "false";
  }

  function fallback(message: string) {
    dispose();
    root.dataset.state = "fallback";
    status.textContent = message;
    root
      .querySelectorAll<
        HTMLButtonElement | HTMLInputElement | HTMLSelectElement
      >("button,input,select")
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
  const crystalGeometry = ownGeometry(
    new RoundedBoxGeometry(
      ECAL.crystal.width,
      ECAL.crystal.height,
      ECAL.crystal.depth,
      2,
      0.65
    )
  );
  const boxEdges = ownGeometry(new EdgesGeometry(boxGeometry));
  const boltGeometry = ownGeometry(new CylinderGeometry(3.4, 3.4, 1, 12));
  const outline = ownMaterial(
    new LineBasicMaterial({ color: 0x555c63, transparent: true, opacity: 0.24 })
  );
  const selectionMaterial = ownMaterial(
    new LineBasicMaterial({
      color: 0x2563eb,
      depthTest: true,
      transparent: true,
      opacity: 0.85,
    })
  );
  const selectionOutline = new LineSegments(boxEdges, selectionMaterial);
  selectionOutline.renderOrder = 9;
  selectionOutline.visible = false;
  scene.add(selectionOutline);
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
        roughness:
          part === "crystals" ? 0.27 : part === "support" ? 0.32 : 0.78,
        metalness: part === "support" ? 0.55 : 0.04,
      })
    );
    const bevelled = part === "crystals" && size[1] === ECAL.crystal.height;
    const mesh = new Mesh(bevelled ? crystalGeometry : boxGeometry, material);
    mesh.position.set(...position);
    if (!bevelled) mesh.scale.set(...size);
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
        ["crystals", 0, 100],
        ["apd", 0, 10],
        ["fam", 0, -60],
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
            false
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
    groups.support.add(supportFrame);
    for (const z of [-159, 159])
      box(supportFrame, "support", [326, 5, 8], [0, 154, z]);
    for (const x of [-159, 159])
      box(supportFrame, "support", [8, 5, 326], [x, 154, 0]);
    for (const x of [-159, 159]) {
      for (const z of [-159, 159]) {
        box(supportFrame, "support", [5, 225, 5], [x, 38, z]);
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
        supportFrame.add(bolt);
      }
    }
    // A generated contact shadow grounds the assembly without a shadow-map render pass.
    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = shadowCanvas.height = 128;
    const context = shadowCanvas.getContext("2d");
    if (context) {
      const gradient = context.createRadialGradient(64, 64, 12, 64, 64, 64);
      gradient.addColorStop(0, "rgba(0,0,0,0.3)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 128, 128);
      const texture = new CanvasTexture(shadowCanvas);
      textures.add(texture);
      contactShadow = new Mesh(
        ownGeometry(new PlaneGeometry(440, 440)),
        ownMaterial(
          new MeshBasicMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
            opacity: 0.65,
          })
        )
      );
      contactShadow.rotation.x = -Math.PI / 2;
      contactShadow.position.y = -83;
      scene.add(contactShadow);
    }
    scene.add(new AmbientLight(0xffffff, 1.45));
    const key = new DirectionalLight(0xfff7e4, 2.65);
    key.position.set(200, 550, 300);
    scene.add(key);
    const fill = new DirectionalLight(0xb9d9ff, 1.1);
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
  const electricGeometry = ownGeometry(new ConeGeometry(2.7, 9, 6));
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
      const dot = new Mesh(electricGeometry, electricMaterial);
      dot.material.depthTest = false;
      dot.renderOrder = 6;
      signalPath.add(dot);
      electricDots.push(dot);
    }
  }

  function updateMaterials() {
    const styles = getComputedStyle(root);
    const accent = new Color(styles.getPropertyValue("--accent").trim());
    selectionMaterial.color.copy(accent);
    for (const part of parts)
      groups[part.id].visible =
        !isolated || ["crystals", "apd", "fam"].includes(part.id);
    if (contactShadow) contactShadow.visible = !isolated;
    for (const surface of surfaces) {
      surface.mesh.visible = !isolated || surface.crystal === isolatedCrystal;
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
        surface.material.color.lerp(accent, hasSelection ? 0.14 : 0.02);
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
      mode === "demo"
        ? 0.1
        : document.documentElement.dataset.theme === "dark"
          ? 0.22
          : 0.14;
    incomingDotMaterial.color.copy(accent);
    electricMaterial.color.copy(accent);
  }

  function applyExplosion(value: number) {
    exploded = Math.min(1, Math.max(0, value));
    cells.forEach(cell => {
      const pitch = ECAL.crystal.width + (spread && cell.lift === 100 ? 18 : 0);
      cell.object.position.set(
        (cell.column - 2) * pitch,
        cell.baseY + cell.lift * exploded,
        (cell.row - 2) * pitch
      );
    });
    groups.fee.position.set(0, -55 * exploded, 45 * exploded);
    groups.support.position.y = -95 * exploded;
    supportFrame.position.y = 240 * exploded;
    if (contactShadow) contactShadow.position.y = -83 - 95 * exploded;
    explodeInput.value = String(Math.round(exploded * 100));
    root.querySelector<HTMLOutputElement>("[data-explode-value]")!.value =
      `${Math.round(exploded * 100)}%`;
    root.dataset.exploded = String(exploded);
    root.dataset.spread = String(spread);
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
    Object.values(groups).forEach(group => {
      if (group.visible)
        group.traverseVisible(object => {
          if (object instanceof Mesh) bounds.expandByObject(object);
        });
    });
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
      1 - (mode === "demo" ? 160 : 88) / rect.height
    );
    const bottomPadding = 24;
    const bottomLimit = Math.max(0.1, 1 - (2 * bottomPadding) / rect.height);
    const minX = Math.min(...projected.map(point => point.x));
    const maxX = Math.max(...projected.map(point => point.x));
    const minY = Math.min(...projected.map(point => point.y));
    const maxY = Math.max(...projected.map(point => point.y));
    camera.zoom = Math.max(
      0.2,
      Math.min(
        isolated ? 4 : 1.5,
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

  function updateSummary() {
    const data = parts.find(item => item.id === selected)!;
    root.querySelector<HTMLElement>("[data-selection-title]")!.textContent =
      mode === "demo"
        ? steps[stepIndex].title
        : selectedCrystal
          ? `${selectedCrystal} · ${data.name}`
          : data.name;
    root.querySelector<HTMLElement>("[data-selection-summary]")!.textContent =
      mode === "demo"
        ? steps[stepIndex].summary
        : selectedCrystal
          ? `第 ${crystals.find(item => item.id === selectedCrystal)!.row + 1} 行，第 ${crystals.find(item => item.id === selectedCrystal)!.column + 1} 列 · 单根 60 × 60 × 150 mm`
          : data.summary;
  }

  function selectPart(part: PartId, crystal?: string, explicit = true) {
    const wasIsolated = isolated;
    selected = part;
    hasSelection = explicit;
    if (crystal) isolatedCrystal = crystal;
    if (isolated && ["fee", "support"].includes(part)) {
      isolated = false;
      preset.value = "overall";
      root.dataset.isolated = "false";
    }
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
    updateSummary();
    updateMaterials();
    if (isolated || wasIsolated) fitCamera();
    requestRender();
  }

  function animateCamera(to: Vector3) {
    cameraTransition = undefined;
    if (reduceMotion.matches) {
      camera.position.copy(to);
      controls?.update();
      fitCamera();
    } else
      cameraTransition = {
        from: camera.position.clone(),
        to,
        start: performance.now(),
      };
    requestRender();
  }

  function focusPart() {
    if (mode !== "structure") return;
    if (selected === "crystals" && selectedCrystal) {
      isolated = true;
      preset.value = "crystal";
      updateMaterials();
      applyExplosion(0.3);
      animateCamera(new Vector3(420, 290, 500));
    } else {
      isolated = false;
      preset.value =
        selected === "apd" || selected === "fam" ? "readout" : "overall";
      updateMaterials();
      applyExplosion(selected === "crystals" ? 0.45 : 0.85);
      animateCamera(new Vector3(540, 270, 640));
    }
    root.dataset.isolated = String(isolated);
  }

  function setView(value: string) {
    if (mode !== "structure") setMode("structure");
    isolated = value === "crystal";
    preset.value = value;
    root.dataset.isolated = String(isolated);
    if (value === "crystal") {
      selectPart("crystals", selectedCrystal ?? "C13");
      applyExplosion(0.3);
      animateCamera(new Vector3(420, 290, 500));
    } else if (value === "readout") {
      selectPart("apd");
      applyExplosion(0.85);
      animateCamera(new Vector3(540, 270, 640));
    } else {
      selectPart("crystals", undefined, false);
      applyExplosion(0);
      animateCamera(new Vector3(540, 440, 610));
    }
    updateSummary();
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
    updateSummary();
    updatePlayback();
    requestRender();
  }

  function setMode(next: "structure" | "demo") {
    cameraTransition = undefined;
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
      isolated = false;
      spread = false;
      preset.value = "overall";
      root.dataset.isolated = "false";
      root.querySelector<HTMLInputElement>("[data-spread]")!.checked = false;
      updateMaterials();
      applyExplosion(0);
      demoTime = 0;
      setStep(0);
    } else {
      updateMaterials();
      updatePlayback();
    }
    demonstration.visible = mode === "demo";
    updateSummary();
    fitCamera();
    requestRender();
  }

  function reset() {
    cameraTransition = undefined;
    isolated = false;
    spread = false;
    hasSelection = false;
    preset.value = "overall";
    root.dataset.isolated = "false";
    root.querySelector<HTMLInputElement>("[data-spread]")!.checked = false;
    updateMaterials();
    playing = false;
    demoTime = 0;
    lastTime = 0;
    controls?.reset();
    applyExplosion(0);
    selectPart("crystals", undefined, false);
    setStep(0);
    requestRender();
  }

  function moveCamera(action: string) {
    if (!controls) return;
    cameraTransition = undefined;
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
      dot.quaternion.setFromUnitVectors(
        new Vector3(0, 1, 0),
        electricalRoute[segment + 1]
          .clone()
          .sub(electricalRoute[segment])
          .normalize()
      );
      dot.visible = stepIndex === 3 || fraction < 0.28;
    });
  }

  function partBounds(part: PartId, crystal?: string) {
    const bounds = new Box3();
    if (!groups[part].visible) return bounds;
    surfaces.forEach(surface => {
      if (
        surface.part === part &&
        surface.mesh.visible &&
        (!crystal || surface.crystal === crystal)
      )
        bounds.expandByObject(surface.mesh);
    });
    return bounds;
  }

  function positionLabels() {
    const bounds = canvas.getBoundingClientRect();
    const activePart = mode === "demo" ? steps[stepIndex].part : selected;
    const svg = root.querySelector<SVGSVGElement>("[data-label-leaders]")!;
    svg.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
    const candidates: {
      label: HTMLElement;
      leader: SVGGElement;
      x: number;
      y: number;
      desired: number;
    }[] = [];
    labels.forEach(label => {
      const part = label.dataset.modelLabel as PartId;
      const leader = root.querySelector<SVGGElement>(
        `[data-leader="${part}"]`
      )!;
      const box = partBounds(
        part,
        part === "crystals" ? selectedCrystal : undefined
      );
      const hidden =
        box.isEmpty() ||
        (part !== activePart &&
          (isolated || exploded < 0.35 || bounds.width < 600));
      label.hidden = hidden;
      leader.dataset.hidden = String(hidden);
      if (hidden) return;
      // Anchor the mechanical label on a post, rather than the empty middle of its bounds.
      const post =
        part === "support"
          ? supportFrame.children.find(
              object =>
                object instanceof Mesh &&
                object.position.x > 0 &&
                object.position.z > 0 &&
                object.scale.y > 200
            )
          : undefined;
      const vector = (
        post
          ? new Box3().setFromObject(post).getCenter(new Vector3())
          : box.getCenter(new Vector3())
      ).project(camera);
      if (vector.z > 1 || Math.abs(vector.x) > 1 || Math.abs(vector.y) > 1) {
        label.hidden = true;
        leader.dataset.hidden = "true";
        return;
      }
      label.textContent =
        part === "crystals"
          ? (selectedCrystal ?? "CsI(Tl)")
          : parts.find(item => item.id === part)!.short.split(" ")[0];
      label.dataset.selected = String(part === activePart);
      const x = ((vector.x + 1) * bounds.width) / 2;
      const y = ((1 - vector.y) * bounds.height) / 2;
      candidates.push({ label, leader, x, y, desired: y - 12 });
    });
    candidates.sort((a, b) => a.desired - b.desired);
    const bottom = bounds.height - 32;
    let next = 70;
    const positions = candidates.map(item => {
      const y = Math.max(next, Math.min(bottom, item.desired));
      next = y + 28;
      return y;
    });
    for (let index = positions.length - 1; index >= 0; index--)
      positions[index] = Math.min(
        positions[index],
        bottom - (positions.length - 1 - index) * 28
      );
    candidates.forEach((item, index) => {
      const x = bounds.width - item.label.offsetWidth - 12;
      const y = Math.max(62, positions[index]);
      item.label.style.transform = `translate(${x}px, ${y}px)`;
      const line = item.leader.querySelector("line")!;
      const dot = item.leader.querySelector("circle")!;
      line.setAttribute("x1", String(item.x));
      line.setAttribute("y1", String(item.y));
      line.setAttribute("x2", String(x - 4));
      line.setAttribute("y2", String(y + item.label.offsetHeight / 2));
      dot.setAttribute("cx", String(item.x));
      dot.setAttribute("cy", String(item.y));
    });
  }
  function render() {
    if (!renderer || disposed) return;
    updateDemoObjects();
    scene.updateMatrixWorld(true);
    const selectedBounds = partBounds(selected, selectedCrystal);
    selectionOutline.visible =
      mode === "structure" && hasSelection && !selectedBounds.isEmpty();
    if (selectionOutline.visible) {
      selectionOutline.position.copy(selectedBounds.getCenter(new Vector3()));
      selectionOutline.scale.copy(
        selectedBounds.getSize(new Vector3()).addScalar(1.8)
      );
    }
    renderer.render(scene, camera);
    positionLabels();
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
    if (cameraTransition) {
      const progress = Math.min(
        1,
        Math.max(0, (time - cameraTransition.start) / 360)
      );
      camera.position.lerpVectors(
        cameraTransition.from,
        cameraTransition.to,
        1 - Math.pow(1 - progress, 4)
      );
      controls?.update();
      fitCamera();
      dirty = true;
      if (progress === 1) cameraTransition = undefined;
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
    if ((playing || cameraTransition) && !frame)
      frame = requestAnimationFrame(tick);
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
    if (cameraTransition) {
      camera.position.copy(cameraTransition.to);
      cameraTransition = undefined;
      controls?.update();
      fitCamera();
    }
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
    controls.addEventListener("start", () => {
      cameraTransition = undefined;
    });
    buildModel();
    buildDemonstration();
    applyExplosion(0);
    updateMaterials();

    root
      .querySelectorAll<
        HTMLButtonElement | HTMLInputElement | HTMLSelectElement
      >("button,input,select")
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
        if (button.hasAttribute("data-focus-part")) focusPart();
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
      () => {
        cameraTransition = undefined;
        applyExplosion(Number(explodeInput.value) / 100);
      },
      { signal }
    );
    preset.addEventListener("change", () => setView(preset.value), { signal });
    root.querySelector<HTMLInputElement>("[data-spread]")!.addEventListener(
      "change",
      event => {
        spread = (event.target as HTMLInputElement).checked;
        applyExplosion(exploded);
      },
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
        const hit = raycaster.intersectObjects(
          selectable.filter(
            mesh => mesh.visible && groups[mesh.userData.part as PartId].visible
          ),
          false
        )[0];
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
    compactViewport.addEventListener("change", syncDetailPanel);
    syncDetailPanel();
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
    selectPart("crystals", undefined, false);
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
