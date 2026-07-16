import "./sidebar.css";
import { PlayingEqualizer } from "./playing-equalizer.jsx";
import { useApp } from "../context/AppContext.jsx";
import { Droppable, Draggable } from "@hello-pangea/dnd";
import { GripIcon } from "lucide-react";
import { FinderFolderChevron, FinderFolderContent } from "./finder-folder-motion";
import { LifeAreaIcon } from "./life-area-icon";
import { SIDEBAR_UNSORTED_KEY } from "../constants";

export function SidebarListRow({ listItem, detail, active, playing, attention, onClick }) {
  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.(e);
    }
  };

  return (
    <div
      className={`list-item sidebar-track${active ? " active" : ""}${playing ? " playing-list" : ""}`}
      title={detail}
      onClick={onClick}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <span className="drag-grip list-grip" title="Drag to reorder"><GripIcon /></span>
      <span className="li-icon">{listItem.emoji}</span>
      <span className="li-label">{listItem.name}</span>
      {playing ? <PlayingEqualizer className="sidebar-equalizer" /> : null}
      {attention ? (
        <span className="sidebar-attention-dot" title="Contains a task with a deadline cue" aria-label="Contains a task with a deadline cue" />
      ) : null}
    </div>
  );
}

export function Sidebar({ sections, collapsed, rowForList }) {
  const { actions, setSidebarCollapsed } = useApp();

  const toggleSection = (key) => {
    setSidebarCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem("tp.sidebarCollapsed", JSON.stringify(next));
      return next;
    });
  };

  return (
    <Droppable droppableId="priority" type="priority">
      {(provided) => (
        <div ref={provided.innerRef} {...provided.droppableProps}>
          {sections.map((section, sectionIndex) => {
            const isCollapsed = Boolean(collapsed[section.key]);
            const count = section.items.length;
            const isUnsorted = section.key === SIDEBAR_UNSORTED_KEY;

            return (
              <Draggable key={section.key} draggableId={`priority:${section.key}`} index={sectionIndex} isDragDisabled={isUnsorted}>
                {(providedSection, snapshotSection) => (
                  <div
                    ref={providedSection.innerRef}
                    {...providedSection.draggableProps}
                    className={`list-section${isCollapsed ? " collapsed" : ""}`}
                    style={{ ...providedSection.draggableProps.style }}
                  >
                    <div
                      {...providedSection.dragHandleProps}
                      className={`ls-header${snapshotSection.isDragging ? " dragging" : ""}`}
                      onClick={() => toggleSection(section.key)}
                      aria-expanded={!isCollapsed}
                      title={`${section.label} — ${count} list${count === 1 ? "" : "s"}`}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleSection(section.key);
                        }
                      }}
                    >
                      {section.priorityRank ? (
                        <span
                          className="drag-grip ls-priority-grip"
                          title="Drag to change planning priority"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {<GripIcon />}
                        </span>
                      ) : null}
                      <span className="ls-area-icon" style={{ color: section.color }}>
                        <LifeAreaIcon areaKey={section.key} />
                      </span>
                      <span className="ls-label">{section.label}</span>
                      <FinderFolderChevron open={!isCollapsed} />
                    </div>

                    <FinderFolderContent open={!isCollapsed}>
                      <Droppable droppableId={section.dropArea} type="list">
                        {(providedList, snapshotList) => (
                          <div
                            className={`ls-body${snapshotList.isDraggingOver ? " drop-zone-over" : ""}`}
                            ref={providedList.innerRef}
                            {...providedList.droppableProps}
                            style={{ minHeight: "10px" }}
                          >
                            {count ? (
                              section.items.map((item, itemIndex) => (
                                <Draggable key={item.id} draggableId={`list:${item.id}`} index={itemIndex}>
                                  {(providedItem, snapshotItem) => (
                                    <div
                                      ref={providedItem.innerRef}
                                      {...providedItem.draggableProps}
                                      {...providedItem.dragHandleProps}
                                      className={`${snapshotItem.isDragging ? "dragging" : ""}`}
                                      style={{ ...providedItem.draggableProps.style }}
                                    >
                                      {rowForList(item)}
                                    </div>
                                  )}
                                </Draggable>
                              ))
                            ) : (
                              <button
                                type="button"
                                className="ls-invite"
                                onClick={() => actions.addList(section.dropArea)}
                                title={`Create the first list in ${section.label}`}
                              >
                                + Start a list
                              </button>
                            )}
                            {providedList.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </FinderFolderContent>
                  </div>
                )}
              </Draggable>
            );
          })}
          {provided.placeholder}
        </div>
      )}
    </Droppable>
  );
}

export const sidebarListRow = (props) => <SidebarListRow {...props} />;
export const sidebar = (props) => <Sidebar {...props} />;
