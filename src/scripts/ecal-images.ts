/** Local reference images remain ordinary links when scripting is unavailable. */
export function mountEcalImages(dialog: HTMLDialogElement): () => void {
  const abort = new AbortController();
  const { signal } = abort;
  const viewport = dialog.querySelector<HTMLElement>("[data-image-viewport]")!;
  const image = dialog.querySelector<HTMLImageElement>("[data-image-full]")!;
  const scale = dialog.querySelector<HTMLOutputElement>("[data-image-scale]")!;
  const pointers = new Map<number, { x: number; y: number }>();
  let zoom = 1;
  let fit = 1;
  let originalOverflow = "";
  let trigger: HTMLAnchorElement | null = null;
  let pinch: { distance: number; zoom: number } | undefined;

  function setZoom(
    value: number,
    anchorX = viewport.clientWidth / 2,
    anchorY = viewport.clientHeight / 2
  ) {
    const previous = zoom;
    zoom = Math.max(1, Math.min(5, value));
    const x =
      (viewport.scrollLeft + anchorX - image.offsetLeft) /
      (image.clientWidth || 1);
    const y =
      (viewport.scrollTop + anchorY - image.offsetTop) /
      (image.clientHeight || 1);
    image.style.width = `${image.naturalWidth * fit * zoom}px`;
    scale.value = `${Math.round(zoom * 100)}%`;
    viewport.dataset.zoomed = String(zoom > 1);
    dialog.querySelector<HTMLButtonElement>(
      '[data-image-zoom="out"]'
    )!.disabled = zoom <= 1;
    dialog.querySelector<HTMLButtonElement>(
      '[data-image-zoom="in"]'
    )!.disabled = zoom >= 5;
    if (zoom !== previous) {
      viewport.scrollLeft = image.offsetLeft + x * image.clientWidth - anchorX;
      viewport.scrollTop = image.offsetTop + y * image.clientHeight - anchorY;
    }
  }

  function fitImage() {
    if (!dialog.open || !image.naturalWidth) return;
    fit = Math.min(
      1,
      (viewport.clientWidth - 32) / image.naturalWidth,
      (viewport.clientHeight - 32) / image.naturalHeight
    );
    setZoom(1);
    viewport.scrollLeft = viewport.scrollTop = 0;
  }

  document.addEventListener(
    "click",
    event => {
      const link = (event.target as Element).closest<HTMLAnchorElement>(
        "a[data-reference-image]"
      );
      if (
        !link ||
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      )
        return;
      event.preventDefault();
      trigger = link;
      const thumbnail = link.querySelector<HTMLImageElement>("img")!;
      dialog.querySelector<HTMLElement>("[data-image-title]")!.textContent =
        link.dataset.imageTitle ?? thumbnail.alt;
      image.alt = thumbnail.alt;
      image.src = link.href;
      originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      dialog.showModal();
      fitImage();
    },
    { signal, capture: true }
  );

  image.addEventListener("load", fitImage, { signal });
  dialog.addEventListener(
    "click",
    event => {
      const button = (event.target as Element).closest<HTMLButtonElement>(
        "button"
      );
      if (button?.hasAttribute("data-image-close")) dialog.close();
      if (button?.dataset.imageZoom)
        setZoom(zoom * (button.dataset.imageZoom === "in" ? 1.5 : 1 / 1.5));
      if (button?.hasAttribute("data-image-fit")) fitImage();
      if (event.target === dialog) {
        const rect = dialog.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          dialog.close();
      }
    },
    { signal }
  );
  dialog.addEventListener(
    "close",
    () => {
      document.body.style.overflow = originalOverflow;
      pointers.clear();
      pinch = undefined;
      trigger?.focus({ preventScroll: true });
    },
    { signal }
  );
  viewport.addEventListener("dblclick", () => setZoom(zoom > 1 ? 1 : 2.5), {
    signal,
  });
  viewport.addEventListener(
    "wheel",
    event => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      setZoom(
        zoom * Math.exp(-event.deltaY * 0.008),
        event.clientX - rect.left,
        event.clientY - rect.top
      );
    },
    { signal, passive: false }
  );
  viewport.addEventListener(
    "pointerdown",
    event => {
      if (event.button !== 0) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      viewport.setPointerCapture(event.pointerId);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom };
      }
    },
    { signal }
  );
  viewport.addEventListener(
    "pointermove",
    event => {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const rect = viewport.getBoundingClientRect();
        setZoom(
          (pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) /
            Math.max(1, pinch.distance),
          (a.x + b.x) / 2 - rect.left,
          (a.y + b.y) / 2 - rect.top
        );
      } else {
        viewport.scrollLeft -= event.clientX - previous.x;
        viewport.scrollTop -= event.clientY - previous.y;
      }
    },
    { signal }
  );
  const release = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    pinch = undefined;
  };
  viewport.addEventListener("pointerup", release, { signal });
  viewport.addEventListener("pointercancel", release, { signal });
  const observer = new ResizeObserver(fitImage);
  observer.observe(viewport);
  return () => {
    if (dialog.open) {
      dialog.close();
      document.body.style.overflow = originalOverflow;
    }
    observer.disconnect();
    abort.abort();
    pointers.clear();
  };
}
