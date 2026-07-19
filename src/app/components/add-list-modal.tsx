import React, { useState, useEffect } from "react";
import { AnimatedModal } from "./motion-transitions.jsx";
import { useApp } from "../context/AppContext.jsx";
import { WeeklyAvailabilityEditor } from "./weekly-availability-editor.jsx";
import { LIFE_AREAS } from "../utils.jsx";
import { inspectListAvailability } from "../schedule-validation";

import { EMOJI_CATEGORIES, DEFAULT_LIST_COLOR, DEFAULT_LIST_EMOJI, TOAST_LIST_CREATED } from "../constants.jsx";

const { invoke } = window.__TAURI__.core;

export function AddListModal() {
  const { state, actions, setOpenListId } = useApp();

  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(DEFAULT_LIST_EMOJI);
  const [color, setColor] = useState(DEFAULT_LIST_COLOR);
  const [lifeArea, setLifeArea] = useState(state.openListArea || "");
  const [lifeDirection, setLifeDirection] = useState("increase");
  const [windows, setWindows] = useState([]);
  const [activeCat, setActiveCat] = useState("work");
  const [scheduleBlocked, setScheduleBlocked] = useState(false);

  useEffect(() => {
    setName("");
    setEmoji(DEFAULT_LIST_EMOJI);
    setLifeArea(state.openListArea || "");
    const found = LIFE_AREAS.find((a) => a.key === (state.openListArea || ""));
    setColor(found ? found.color : DEFAULT_LIST_COLOR);
    setLifeDirection("increase");
    setWindows([]);
    setScheduleBlocked(false);
  }, [state.openListId, state.openListArea]);

  useEffect(() => {
    if (emoji) {
      const cat = EMOJI_CATEGORIES.find((c) => c.emojis.includes(emoji));
      if (cat) {
        setActiveCat(cat.key);
      }
    }
  }, [emoji]);

  const activeIndex = EMOJI_CATEGORIES.findIndex((c) => c.key === activeCat);
  const activeCategory = EMOJI_CATEGORIES[activeIndex !== -1 ? activeIndex : 0];

  const goToCategory = (step) => {
    const count = EMOJI_CATEGORIES.length;
    const nextIndex = (activeIndex + step + count) % count;
    setActiveCat(EMOJI_CATEGORIES[nextIndex].key);
  };

  const handleAreaChange = (areaKey) => {
    setLifeArea(areaKey);
    const found = LIFE_AREAS.find((a) => a.key === areaKey);
    setColor(found ? found.color : DEFAULT_LIST_COLOR);
  };

  const handleSave = async () => {
    if (!name.trim() || scheduleBlocked) return;
    try {
      const snap = await invoke("add_list", { name: name.trim() });
      
      // add_list returns a full Snapshot, so we find the newly created list's ID
      // by looking for the one that wasn't in our previous state.
      const newList = snap.lists.find(l => !state.S.lists.some(old => old.id === l.id));
      const newListId = newList ? newList.id : snap.lists[snap.lists.length - 1].id;

      await invoke("set_list_style", { id: newListId, emoji, color });
      await invoke("set_list_life_tag", { id: newListId, area: lifeArea || null, direction: lifeDirection });
      const finalSnap = await invoke("set_list_availability", { id: newListId, windows });
      
      actions.apply(finalSnap);
      actions.navigate({ view: "tasks", listId: newListId });
      actions.showToast({ message: TOAST_LIST_CREATED });
      setOpenListId(null);
    } catch (err) {
      actions.uiNote("Error", String(err));
    }
  };

  return (
    <AnimatedModal onClose={() => setOpenListId(null)} className="modal dlg dlg-emoji show">
        <div className="dtitle">New list</div>
        <div className="dbody">
          <div className="ffield">
            <label>Preview</label>
            <span
              id="stylePreview"
              style={{
                background: `${color}22`,
                color: color,
                width: "32px",
                height: "32px",
                borderRadius: "5px",
                display: "grid",
                placeItems: "center",
                fontSize: "15px",
                flex: "none",
              }}
            >
              {emoji}
            </span>
          </div>

          <div className="ffield">
            <label>Name</label>
            <input
              type="text"
              id="listNameIn"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder=""
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
              style={{ flex: 1 }}
              autoFocus
            />
          </div>

          <div className="ffield" style={{ alignItems: "flex-start" }}>
            <label>Emoji</label>
            <div className="emoji-picker">
              <div className="emoji-cat-pager">
                <button type="button" className="emoji-cat-nav" onClick={() => goToCategory(-1)} title="Previous category">◀</button>
                <span className="emoji-cat-label">{activeCategory.label}</span>
                <button type="button" className="emoji-cat-nav" onClick={() => goToCategory(1)} title="Next category">▶</button>
              </div>
              <div className="emoji-grid">
                {activeCategory.emojis.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className={`emoji-opt${e === emoji ? " sel" : ""}`}
                    onClick={() => setEmoji(e)}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="ffield">
            <label>Life area</label>
            <select id="listAreaIn" value={lifeArea} onChange={(e) => handleAreaChange(e.target.value)}>
              <option value="">Not tagged</option>
              {LIFE_AREAS.map((a) => (
                <option key={a.key} value={a.key}>{a.label}</option>
              ))}
            </select>
          </div>

          <div className="ffield">
            <label>Effect</label>
            <select id="listDirIn" value={lifeDirection} onChange={(e) => setLifeDirection(e.target.value)}>
              <option value="increase">Increases this area</option>
              <option value="decrease">Decreases this area</option>
            </select>
          </div>

          <hr style={{ border: "none", borderBottom: "1px solid var(--line)", margin: "16px 0" }} />

          <div className="schedule-field">
            <div className="schedule-field-head">
              <div>
                <strong>Available here</strong>
                <span>One-time tasks in this list can be planned during these windows.</span>
              </div>
            </div>
            <div className="detail-weekly-editor" style={{ marginTop: "12px" }}>
              <WeeklyAvailabilityEditor
                id="listAvailabilityEditor"
                initialWindows={windows}
                onSave={(nextWindows) => setWindows(nextWindows)}
                inspectWindows={(candidate) => inspectListAvailability(
                  candidate,
                  state.S.lists.map((list) => ({ id: list.id, name: list.name, windows: list.availabilityWindows })),
                )}
                onBlockingChange={setScheduleBlocked}
              />
            </div>
          </div>
        </div>

        <div className="dfoot">
          <button className="btn" onClick={() => setOpenListId(null)}>Cancel</button>
          <button className="btn primary" disabled={scheduleBlocked} onClick={handleSave}>Create</button>
        </div>
    </AnimatedModal>
  );
}
