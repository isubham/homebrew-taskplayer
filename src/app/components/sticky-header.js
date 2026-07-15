import { html } from "../../vendor/lit-html.js";

export const stickyHeader = ({ icon, name }) => html`
  <div class="stickybar" id="stickybar">
    <span class="sb-icon">${icon}</span>
    <span class="sb-name">${name}</span>
  </div>`;
