import { esc } from "./utils.js";
import { html, render as litRender } from "../vendor/lit-html.js";

export function createUi() {
  // #doverlay/#dmodal is a single shared dialog surface — uiConfirm, uiPrompt,
  // uiNote, and every custom uiForm all render into it. That's fine as long
  // as only one is ever open, but a dialog can itself contain a button that
  // opens another (e.g. a "Delete" button inside an "Edit" dialog): without
  // this, the second uiForm() call would overwrite the first's DOM out from
  // under it while the first's keydown listener and pending Promise stay
  // alive — the first dialog's Enter/Escape handler then fires later against
  // elements that no longer exist. Tracking + auto-cancelling the previous
  // dialog before opening a new one makes that nesting safe everywhere.
  let cancelPending = null;
  let toastTimer = null;

  function showToast({ title, message, tone = "neutral", duration = 5000 }) {
    const host = document.getElementById("toastHost");
    if (!host) return;
    litRender(html`
      <div class="app-toast-card ${tone}">
        ${title ? html`<strong>${title}</strong>` : null}
        <span>${message}</span>
      </div>
    `, host);
    host.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => host.classList.remove("show"), duration);
  }

  function uiForm({ title, bodyHtml = "", confirmText = "OK", danger = false, focusSel = null, collect }) {
    if (cancelPending) cancelPending();
    return new Promise((resolve) => {
      const overlay = document.getElementById("doverlay");
      const modal = document.getElementById("dmodal");
      modal.innerHTML = `
        <div class="dtitle">${esc(title)}</div>
        ${bodyHtml}
        <div class="dfoot">
          <button class="btn" id="dcancel">Cancel</button>
          <button class="btn ${danger ? "danger" : "primary"}" id="dok">${esc(confirmText)}</button>
        </div>`;
      overlay.classList.add("show");
      const field = focusSel && modal.querySelector(focusSel);
      if (field) {
        field.focus();
        if (field.select) field.select();
      }

      function finish(result) {
        overlay.classList.remove("show");
        overlay.onclick = null;
        document.removeEventListener("keydown", onKey);
        if (cancelPending === cancel) cancelPending = null;
        resolve(result);
      }

      function ok() {
        const value = collect();
        if (value !== undefined) finish(value);
      }

      const cancel = () => finish(null);
      cancelPending = cancel;

      function onKey(event) {
        if (event.key === "Enter" && event.target.tagName !== "TEXTAREA") {
          event.preventDefault();
          ok();
        } else if (event.key === "Escape") {
          event.preventDefault();
          cancel();
        }
      }

      document.getElementById("dok").onclick = ok;
      document.getElementById("dcancel").onclick = cancel;
      overlay.onclick = (event) => {
        if (event.target === overlay) cancel();
      };
      document.addEventListener("keydown", onKey);
    });
  }

  const uiPrompt = (title, value = "") => uiForm({
    title,
    confirmText: "OK",
    focusSel: "#dinput",
    bodyHtml: `<input class="dinput" id="dinput" value="${esc(value)}" autocomplete="off" autocorrect="off" spellcheck="false" />`,
    collect: () => document.getElementById("dinput").value.trim() || null,
  });

  const uiConfirm = (title, message, confirmText = "Delete") => uiForm({
    title,
    confirmText,
    danger: true,
    bodyHtml: message ? `<div class="dbody">${esc(message)}</div>` : "",
    collect: () => true,
  });

  const uiNote = (title, message, confirmText = "Done") => uiForm({
    title,
    confirmText,
    bodyHtml: `<div class="dbody">${message}</div>`,
    collect: () => true,
  });

  return { uiForm, uiPrompt, uiConfirm, uiNote, showToast };
}
