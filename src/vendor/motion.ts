// ESM bridge for the pinned standalone Motion hybrid bundle. The upstream
// bundle installs its browser API on globalThis.Motion; this file lets the
// app consume it with the same local-module import style as lit-html.
import "./motion-hybrid.js";

export const animate = globalThis.Motion.animate;
export const animateSequence = globalThis.Motion.animateSequence;
