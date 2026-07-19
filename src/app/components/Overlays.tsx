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
import { useMusic } from "../../music.jsx";
import { Heart } from "lucide-react";
import { MUSIC_COPY, MUSIC_MINI_CONTROL_ICON_SIZE } from "../constants.jsx";

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
  const { actions } = useApp();
  const { musicState: m, toggleFavorite } = useMusic();
  const hasTrack = m && (m.title || m.permalink);

  return (
    <AnimatedModal
      onClose={() => actions.setOpenTrackDetail(false)}
      className="modal track-modal show"
      id="trkmodal"
    >
        <div className="top">
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
          {hasTrack ? (
            <button
              className="pill track-favorite"
              onClick={toggleFavorite}
              aria-pressed={m.isFavorite}
            >
              <Heart
                size={MUSIC_MINI_CONTROL_ICON_SIZE}
                fill={m.isFavorite ? "currentColor" : "none"}
              />
              {m.isFavorite ? MUSIC_COPY.unfavoriteTitle : MUSIC_COPY.favoriteTitle}
            </button>
          ) : null}
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
