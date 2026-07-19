import React, { useEffect, useRef, useState } from "react";
import { useApp } from "../context/AppContext.jsx";
import { WeeklyAvailabilityEditor } from "./weekly-availability-editor.jsx";
import { LIFE_AREAS } from "../utils.jsx";
import { AnimatedModal } from "./motion-transitions.jsx";
import { ListEmojiPicker } from "./list-emoji-picker.jsx";
import { inspectListAvailability } from "../schedule-validation";

import { DEFAULT_LIST_COLOR, DEFAULT_LIST_EMOJI, TOAST_LIST_SAVED } from "../constants.jsx";

const { invoke } = window.__TAURI__.core;

export function EditListModal() {
  const { state, helpers, actions, setOpenListId } = useApp();
  const listItem = helpers.list(state.openListId);

  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(DEFAULT_LIST_EMOJI);
  const [color, setColor] = useState(DEFAULT_LIST_COLOR);
  const [lifeArea, setLifeArea] = useState("");
  const [lifeDirection, setLifeDirection] = useState("increase");
  const [windows, setWindows] = useState([]);
  const initializedListId = useRef(null);
  const [scheduleBlocked, setScheduleBlocked] = useState(false);

  useEffect(() => {
    if (!listItem || initializedListId.current === listItem.id) return;
    initializedListId.current = listItem.id;
    setName(listItem.name || "");
    setEmoji(listItem.emoji || DEFAULT_LIST_EMOJI);
    setColor(listItem.color || DEFAULT_LIST_COLOR);
    setLifeArea(listItem.lifeArea || "");
    setLifeDirection(listItem.lifeDirection || "increase");
    setWindows(listItem.availabilityWindows || []);
    setScheduleBlocked(false);
  }, [listItem]);

  const handleAreaChange = (areaKey) => {
    setLifeArea(areaKey);
    const found = LIFE_AREAS.find((a) => a.key === areaKey);
    setColor(found ? found.color : DEFAULT_LIST_COLOR);
  };

  const handleSave = async () => {
    if (!name.trim() || !listItem || scheduleBlocked) return;
    try {
      await invoke("rename_list", { id: listItem.id, name: name.trim() });
      await invoke("set_list_style", { id: listItem.id, emoji, color });
      await invoke("set_list_life_tag", { id: listItem.id, area: lifeArea || null, direction: lifeDirection });
      const snap = await invoke("set_list_availability", { id: listItem.id, windows });
      actions.apply(snap);
      actions.showToast({ message: TOAST_LIST_SAVED });
      setOpenListId(null);
    } catch (err) {
      actions.uiNote("Error", String(err));
    }
  };

  const handleDelete = async () => {
    if (!listItem) return;
    await actions.deleteList(listItem.id);
    setOpenListId(null);
  };

  if (!listItem) return null;

  return (
    <AnimatedModal onClose={() => setOpenListId(null)} className="modal dlg dlg-emoji show">
        <div className="dtitle">Edit list</div>
        <div className="dbody">
          <div className="ffield">
            <label>Preview</label>
            <ListEmojiPicker color={color} emoji={emoji} onChange={setEmoji} />
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
                  listItem.id,
                )}
                onBlockingChange={setScheduleBlocked}
              />
            </div>
          </div>
        </div>

        <div className="dfoot">
          <button type="button" className="btn danger dfoot-delete" onClick={handleDelete}>Delete list</button>
          <button className="btn" onClick={() => setOpenListId(null)}>Cancel</button>
          <button className="btn primary" disabled={scheduleBlocked} onClick={handleSave}>Save</button>
        </div>
    </AnimatedModal>
  );
}
