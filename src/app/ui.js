import { esc } from "./utils.js";

export function createUi() {
  function uiForm({ title, bodyHtml = "", confirmText = "OK", danger = false, focusSel = null, collect }) {
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
        resolve(result);
      }

      function ok() {
        const value = collect();
        if (value !== undefined) finish(value);
      }

      const cancel = () => finish(null);

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

  return { uiForm, uiPrompt, uiConfirm, uiNote };
}
