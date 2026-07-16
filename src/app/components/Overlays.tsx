import React from "react";
import "./overlays.css";
import { esc } from "../utils.jsx";
import { useApp } from "../context/AppContext.jsx";
import { NewTaskModal } from "./create-task-modal";
import { TaskDetailModal } from "./edit-task-modal";
import { AddListModal } from "./add-list-modal.jsx";
import { EditListModal } from "./edit-list-modal.jsx";
import { motion, AnimatePresence } from "motion/react";
import { AnimatedModal, AnimatedSlidePanel } from "./motion-transitions.jsx";

// Lyrics Panel Component
export function LyricsPanel() {
  const { state, helpers, actions } = useApp();
  const task = helpers.findTask(state.lyricsId);
  if (!task) return null;

  const listItem = helpers.list(task.listId);
  const description = (task.description || "").trim();
  const renderedParagraphs = description ? (
    description.split(/\n{2,}/).map((paragraph, idx) => (
      <p key={idx} dangerouslySetInnerHTML={{ __html: esc(paragraph).replace(/\n/g, "<br>") }} />
    ))
  ) : (
    <p className="dim">What will finishing this feel like? Add a note, the goal, or a link.</p>
  );

  return (
    <AnimatedSlidePanel
      id="lyrmodal"
      className="lyrpanel show"
      overlayClassName="overlay show"
      onClose={() => actions.setLyricsId(null)}
    >
        <div className="lyr-hd">
          <span className="lyr-lab">
            ♪ Lyrics ·{" "}
            {listItem ? (
              <span
                className="list-link"
                onClick={() => { actions.selectList(listItem.id); actions.setLyricsId(null); }}
                title={`Go to ${listItem.name}`}
                style={{ cursor: "pointer" }}
              >
                {task.name}
              </span>
            ) : (
              task.name
            )}
          </span>
          <button className="lyr-ed" onClick={() => actions.editLyrics(task.id)}>{description ? "Edit" : "＋ Add"}</button>
          <button className="lyr-x" onClick={() => actions.setLyricsId(null)}>×</button>
        </div>
        <div className="lyr-body">{renderedParagraphs}</div>
    </AnimatedSlidePanel>
  );
}

// Track Detail Modal Component
export function TrackDetailModal() {
  const { state, actions } = useApp();
  const m = state.lastMusic;
  const urls = (m && m.artworkUrls) || [];
  const hasTrack = m && (m.title || urls.length || m.permalink);

  const art = urls.length ? (
    <img className="art" src={urls[0]} alt="" />
  ) : (
    <div className="art" style={{ background: "linear-gradient(135deg,var(--green),#0a5)" }}>♪</div>
  );

  return (
    <AnimatedModal
      onClose={() => actions.setOpenTrackDetail(false)}
      className="modal track-modal show"
      id="trkmodal"
    >
        <div className="top">
          {art}
          <div>
            <h2>{(m && m.title) || "Focus music"}</h2>
            <div className="m">
              {m && m.artist ? m.artist : "—"}
              {m && m.genreLabel ? ` · ${m.genreLabel}` : ""}
            </div>
          </div>
          <button className="close" onClick={() => actions.setOpenTrackDetail(false)}>×</button>
        </div>
        <div className="body">
          {hasTrack && m.permalink ? (
            <button className="pill" onClick={() => actions.openTrackLink(m.permalink)}>↗ View on Audius</button>
          ) : (
            <div className="hint">
              {hasTrack ? "This track has no page on Audius." : "Nothing playing yet — start a task to hear some focus music."}
            </div>
          )}
        </div>
    </AnimatedModal>
  );
}

// Main Overlays Orchestrator
export function Overlays({ trackDetailOpen }) {
  const { state } = useApp();
  return (
    <AnimatePresence>
      {state.openTaskId === "new" && (
        <NewTaskModal key="new-task" />
      )}
      {state.openTaskId && state.openTaskId !== "new" && (
        <TaskDetailModal key="edit-task" />
      )}
      {state.openListId === "new" && (
        <AddListModal key="add-list" />
      )}
      {state.openListId && state.openListId !== "new" && (
        <EditListModal key="edit-list" />
      )}
      {state.lyricsId && (
        <LyricsPanel key="lyrics" />
      )}
      {trackDetailOpen && (
        <TrackDetailModal key="track-detail" />
      )}
    </AnimatePresence>
  );
}
