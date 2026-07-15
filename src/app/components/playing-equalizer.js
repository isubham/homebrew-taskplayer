import { html } from "../../vendor/lit-html.js";

export const playingEqualizer = ({ className = "", label = "Recording now" } = {}) => html`
  <span class="playing-equalizer ${className}" title=${label} aria-label=${label}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="3" y="9" width="3" height="12" rx="1.5"></rect>
      <rect x="10.5" y="3" width="3" height="18" rx="1.5"></rect>
      <rect x="18" y="7" width="3" height="14" rx="1.5"></rect>
    </svg>
  </span>`;
