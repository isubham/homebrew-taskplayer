import { useCallback } from "react";
import _ from "lodash";
import { TASK_ALBUM_DROP_PREFIX, TASK_SINGLES_DROP_ID } from "../constants";

const albumNameFromDropId = (droppableId) => {
  if (droppableId === TASK_SINGLES_DROP_ID) return "";
  return droppableId.startsWith(TASK_ALBUM_DROP_PREFIX)
    ? droppableId.slice(TASK_ALBUM_DROP_PREFIX.length)
    : droppableId;
};

export function useAppDragAndDrop(state, helpers, actions, sections) {
  return useCallback(async (result) => {
    const { source, destination, draggableId, type } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    if (type === "priority") {
      const headers = sections.map(s => s.key).filter(k => k !== "__unsorted__");
      const from = source.index;
      const to = destination.index;
      const [moved] = headers.splice(from, 1);
      headers.splice(to, 0, moved);
      await actions.reorderLifeAreas(headers);
    } 
    else if (type === "list") {
      const listId = draggableId.replace("list:", "");
      let allLists = [];
      sections.forEach(sec => {
         let secItems = [...sec.items];
         if (sec.dropArea === source.droppableId) {
             secItems.splice(source.index, 1);
         }
         if (sec.dropArea === destination.droppableId) {
             const item = state.S.lists.find(l => l.id === listId);
             if (item) secItems.splice(destination.index, 0, item);
         }
         allLists = allLists.concat(secItems);
      });
      
      if (source.droppableId !== destination.droppableId) {
         const targetArea = destination.droppableId === "__unsorted__" ? "" : destination.droppableId;
         await actions.setListArea(listId, targetArea);
      }
      const ids = allLists.map(l => l.id).filter(Boolean);
      await actions.reorderLists(ids);
    }
    else if (type === "task") {
      const taskId = draggableId.replace("task:", "");
      const task = helpers.findTask(taskId);
      if (!task) return;

      const sourceAlbum = albumNameFromDropId(source.droppableId);
      const targetAlbum = albumNameFromDropId(destination.droppableId);
      
      const todo = helpers.tasksForList(task.listId).filter(t => !t.completedAt && t.cadence !== "daily");
      const byAlbum = _.groupBy(todo, t => t.album || "");
      const storedAlbumNames = (state.S.albums || [])
        .filter(album => album.listId === task.listId)
        .sort((left, right) => left.order - right.order)
        .map(album => album.name);
      const albumsOrder = _.uniq([
        ...storedAlbumNames,
        ..._.map(todo, t => t.album || "").filter(Boolean),
      ]);
      
      let allFlatTasks = [];
      albumsOrder.forEach(albumName => {
        let items = [...(byAlbum[albumName] || [])];
        if (albumName === sourceAlbum) items.splice(source.index, 1);
        if (albumName === targetAlbum) {
          const item = todo.find(t => t.id === taskId);
          if (item) items.splice(destination.index, 0, item);
        }
        allFlatTasks = allFlatTasks.concat(items);
      });
      
      let singles = [...(byAlbum[""] || [])];
      if (sourceAlbum === "") singles.splice(source.index, 1);
      if (targetAlbum === "") {
         const item = todo.find(t => t.id === taskId);
         if (item) singles.splice(destination.index, 0, item);
      }
      allFlatTasks = allFlatTasks.concat(singles);
      
      const ids = allFlatTasks.map(t => t.id).filter(Boolean);
      await actions.reorderTasks(task.listId, ids);
      
      if (sourceAlbum !== targetAlbum) {
         await actions.moveTaskToAlbum(taskId, targetAlbum);
      }
    }
  }, [state.S?.lists, state.S?.albums, helpers, actions, sections]);
}
