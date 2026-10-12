const THEME_KEY = "theme";
const LIGHT = "light";
const DARK = "dark";
type Theme = typeof LIGHT | typeof DARK;

function isTheme(value: unknown): value is Theme {
  return value === LIGHT || value === DARK;
}

function getPreferredTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY);
  if (isTheme(stored)) return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? DARK
    : LIGHT;
}

// Reuse the value already set by the inline FOUC-prevention script if available.
const themeWindow = window as Window & { __theme?: { value: Theme } };
const initialTheme = themeWindow.__theme?.value;
let themeValue: Theme = isTheme(initialTheme)
  ? initialTheme
  : getPreferredTheme();

function persist(): void {
  localStorage.setItem(THEME_KEY, themeValue);
  reflect();
}

function reflect(): void {
  const root = document.documentElement;
  root.setAttribute("data-theme", themeValue);
  root.classList.toggle("dark", themeValue === DARK);
  themeWindow.__theme = { value: themeValue };
  const themeButton = document.querySelector<HTMLButtonElement>("#theme-btn");
  const label =
    themeValue === DARK
      ? themeButton?.dataset.labelLight
      : themeButton?.dataset.labelDark;
  if (label) {
    themeButton?.setAttribute("aria-label", label);
    themeButton?.setAttribute("title", label);
  }

  // Fill <meta name="theme-color"> with the computed background colour so
  // Android's browser chrome matches the page background.
  const bg = window.getComputedStyle(document.body).backgroundColor;
  document
    .querySelector("meta[name='theme-color']")
    ?.setAttribute("content", bg);
}

function setup(): void {
  reflect();
  const themeButton = document.querySelector<HTMLButtonElement>("#theme-btn");
  if (themeButton) {
    themeButton.onclick = () => {
      themeValue = themeValue === LIGHT ? DARK : LIGHT;
      persist();
    };
  }
}

setup();

// Re-run after View Transitions navigation.
document.addEventListener("astro:after-swap", setup);

// Set the incoming theme before Astro replaces the root attributes, so
// the new page never falls back to the light palette during navigation.
document.addEventListener("astro:before-swap", event => {
  const newDocument = (event as { newDocument: Document }).newDocument;
  newDocument.documentElement.setAttribute("data-theme", themeValue);
  newDocument.documentElement.classList.toggle("dark", themeValue === DARK);
  const color = document
    .querySelector("meta[name='theme-color']")
    ?.getAttribute("content");
  if (color) {
    newDocument
      .querySelector("meta[name='theme-color']")
      ?.setAttribute("content", color);
  }
});

// Follow system changes only until the visitor chooses a theme explicitly.
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", ({ matches }) => {
    if (isTheme(localStorage.getItem(THEME_KEY))) return;
    themeValue = matches ? DARK : LIGHT;
    reflect();
  });
