import { Disc3 } from "lucide-react";
import { TASK_ALBUM_COPY, TASK_ALBUM_ICON_SIZE } from "../constants";
import { useApp } from "../context/app-context-value";

export function ListActionRow() {
  const { actions } = useApp();

  return (
    <div className="list-action-row">
      <button className="pill list-add-task" onClick={actions.addTask}>
        {TASK_ALBUM_COPY.addTaskAction}
      </button>
      <button
        className="pill list-add-album"
        onClick={actions.addAlbum}
        title={TASK_ALBUM_COPY.addActionTitle}
      >
        <Disc3 size={TASK_ALBUM_ICON_SIZE} aria-hidden="true" />
        {TASK_ALBUM_COPY.addAction}
      </button>
    </div>
  );
}
