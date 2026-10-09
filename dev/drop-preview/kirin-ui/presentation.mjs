import { dropStyles } from "./dropStyles.mjs";
import { kirinDropRipple, kirinPrefersReducedMotion } from "./dropRipple.mjs";
import { stoneLightAt } from "./stoneLight.mjs";
import { installStonePointerPlay } from "./stonePointer.mjs";

const UNITLESS = new Set(["flex", "flexGrow", "flexShrink", "fontWeight", "lineHeight", "zIndex", "opacity"]);
export function presentationDate(now, hour) {
  const date = new Date(now);
  if (hour !== null && hour !== "" && Number.isFinite(Number(hour)) && Number(hour) >= 0 && Number(hour) < 24) {
    date.setHours(0, 0, 0, 0);
    date.setTime(date.getTime() + Number(hour) * 3600000);
  }
  return date;
}

// Only file drags belong to Drop. Text/link drags must retain browser behaviour.
export function installFileDrop({ area, documentTarget, windowTarget, presentation, onFile, onInvalid }) {
  let depth = 0;
  const hasFiles = (event) => [...(event.dataTransfer?.types ?? [])].includes("Files");
  const reset = () => { depth = 0; area.classList.remove("is-dragging"); presentation.setDrag(false); };
  const enter = (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault(); depth++; area.classList.add("is-dragging");
    presentation.setDrag([...(event.dataTransfer.items ?? [])].some(item => item.kind === "file" && /^(?:audio\/(?:wav|x-wav|wave)|audio\/vnd\.wave)$/i.test(item.type)));
  };
  const leave = (event) => { if (hasFiles(event) && --depth <= 0) reset(); };
  const preventFileNavigation = (event) => { if (hasFiles(event)) event.preventDefault(); };
  const drop = (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault(); reset();
    const files = [...(event.dataTransfer.files ?? [])];
    if (files.length !== 1) { onInvalid(); return; }
    presentation.rippleAt(event); onFile(files[0]);
  };
  const outsideDrop = (event) => { preventFileNavigation(event); reset(); };
  const bindings = [[area, "dragenter", enter], [area, "dragleave", leave], [area, "dragover", preventFileNavigation], [area, "drop", drop], [documentTarget, "dragover", preventFileNavigation], [documentTarget, "drop", outsideDrop], [windowTarget, "blur", reset], [windowTarget, "pagehide", reset]];
  for (const [target, type, handler] of bindings) target.addEventListener(type, handler);
  return { reset, dispose() { reset(); for (const [target, type, handler] of bindings) target.removeEventListener(type, handler); } };
}
export function applyLiteralStyle(element, name) {
  if (!element || !Object.hasOwn(dropStyles, name)) throw new Error("Unknown presentation element");
  for (const [property, value] of Object.entries(dropStyles[name])) element.style[property] = typeof value === "number" && value !== 0 && !UNITLESS.has(property) ? `${value}px` : String(value);
}

// The OS calculation/model boundary ends before this adapter: presentation only.
export function initialisePresentation() {
  const body = document.body, basin = document.querySelector("[data-stone-basin]");
  const touch = document.getElementById("basin-touch"), brand = document.querySelector("[data-drop-brand]");
  const ripples = document.querySelector("[data-drop-ripples]");
  for (const [selector, style] of [
    ["[data-stone-basin]", "dropTopFrame"], ["#basin-touch", "dropTopZone"],
    ["[data-drop-ripples]", "dropTopRipples"], ["[data-drop-brand]", "dropTopBrand"],
    ["[data-drop-text]", "dropTopText"], ["[data-drop-hint]", "dropTopHint"],
    ["[data-drop-routes]", "dropTopRouteRow"], ["[data-drop-choose-files]", "dropTopChooseFiles"],
  ]) applyLiteralStyle(document.querySelector(selector), style);
  document.querySelectorAll("[data-drop-chip]").forEach((chip) => {
    applyLiteralStyle(chip, "dropTopRoutePill");
    applyLiteralStyle(chip, "dropTopRouteRead");
  });
  let lightTimer, pointerCleanup, active = false;
  const updateLight = () => {
    if (!active) return;
    const date = presentationDate(new Date(), new URLSearchParams(location.search).get("stoneHour"));
    const light = stoneLightAt(date);
    for (const [name, value] of Object.entries(light.vars)) body.style.setProperty(name, value);
    document.getElementById("light-label").textContent = `${light.term[0]} · ${light.night > .5 ? "月明かり" : "太陽の光"}`;
    lightTimer = setTimeout(updateLight, 60000 - Date.now() % 60000 + 50);
  };
  const rippleAt = (event) => { if (active) kirinDropRipple(ripples, event?.clientX, event?.clientY, { reduceMotion: kirinPrefersReducedMotion() }); };
  const sheenAt = (event) => {
    if (!active || event.pointerType === "touch" || kirinPrefersReducedMotion()) return;
    const r = brand.getBoundingClientRect();
    const angle = Math.atan2(event.clientX - (r.left + r.width / 2), -(event.clientY - (r.top + r.height / 2))) * 180 / Math.PI;
    brand.style.setProperty("--ga", `${angle.toFixed(1)}deg`);
    brand.setAttribute("data-sheen", "true");
  };
  const sheenOff = () => brand.removeAttribute("data-sheen");
  touch.addEventListener("click", rippleAt);
  touch.addEventListener("pointermove", sheenAt);
  touch.addEventListener("pointerleave", sheenOff);
  const reset = () => {
    clearTimeout(basin.__kirinTakingTimer); basin.removeAttribute("data-taking");
    ripples.replaceChildren(); sheenOff();
    basin.removeAttribute("data-drag-active");
    document.querySelectorAll("[data-drop-chip]").forEach((chip) => chip.removeAttribute("data-hit"));
  };
  const setDrag = (active) => {
    if (active) basin.setAttribute("data-drag-active", "true"); else basin.removeAttribute("data-drag-active");
    document.querySelectorAll("[data-drop-chip]").forEach((chip) => { if (active) chip.setAttribute("data-hit", "true"); else chip.removeAttribute("data-hit"); });
  };
  const resume = () => {
    if (active) return;
    active = true; updateLight(); pointerCleanup = installStonePointerPlay();
  };
  const suspend = () => {
    active = false; clearTimeout(lightTimer); lightTimer = undefined;
    pointerCleanup?.(); pointerCleanup = undefined; reset();
  };
  resume();
  return {
    reset, rippleAt, setDrag, resume, suspend,
    dispose() {
      suspend();
      touch.removeEventListener("click", rippleAt); touch.removeEventListener("pointermove", sheenAt); touch.removeEventListener("pointerleave", sheenOff);
    },
  };
}
