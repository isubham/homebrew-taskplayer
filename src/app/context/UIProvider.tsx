import React, { createContext, useContext, useState, useRef, useCallback } from "react";

const UIContext = createContext(null);

export function useUI() {
  return useContext(UIContext);
}

export function UIProvider({ children }) {
  const [completedOpen, setCompletedOpen] = useState(false);
  const [openTaskId, setOpenTaskId] = useState(null);
  const [openListId, setOpenListId] = useState(null);
  const [openListArea, setOpenListArea] = useState(null);
  const [lyricsId, setLyricsId] = useState(null);
  const [openTrackDetail, setOpenTrackDetail] = useState(false);
  const [activeMenuTaskId, setActiveMenuTaskId] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 });
  const [selectedAgainstArea, setSelectedAgainstArea] = useState(null);
  const [selectedGridCell, setSelectedGridCell] = useState(null);
  const [dialogInput, setDialogInput] = useState("");
  const [dialogSession, setDialogSession] = useState({ date: "", start: "", end: "" });
  const [checkingForUpdate, setCheckingForUpdate] = useState(false);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);

  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const [dialog, setDialog] = useState(null);
  const dialogRef = useRef(null);

  const showToast = useCallback(({ title, message, tone = "neutral", duration = 5000 }) => {
    setToast({ title, message, tone });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), duration);
  }, []);

  const uiForm = useCallback(({ title, confirmText = "OK", danger = false, type = "note", message = "", messageHtml = "", subtitle = "", sessionTaskSelection = false, resolve }) => {
    dialogRef.current?.resolve?.(null);
    const nextDialog = {
      title,
      confirmText,
      danger,
      type,
      message,
      messageHtml,
      subtitle,
      sessionTaskSelection,
      resolve,
    };
    dialogRef.current = nextDialog;
    setDialog(nextDialog);
  }, []);

  const resolveDialog = useCallback((value = null) => {
    const currentDialog = dialogRef.current;
    if (!currentDialog) return;
    dialogRef.current = null;
    setDialog(null);
    currentDialog.resolve?.(value);
  }, []);

  const uiPrompt = useCallback((title, value = "") => {
    setDialogInput(value);
    return new Promise((resolve) => {
      uiForm({
        type: "prompt",
        title,
        confirmText: "OK",
        resolve,
      });
    });
  }, [uiForm]);

  const uiConfirm = useCallback((title, message, confirmText = "Delete", danger = true) => {
    return new Promise((resolve) => {
      uiForm({
        type: "confirm",
        title,
        confirmText,
        danger,
        message,
        resolve,
      });
    });
  }, [uiForm]);

  const uiNote = useCallback((title, message, confirmText = "Done") => {
    return new Promise((resolve) => {
      uiForm({
        type: "note",
        title,
        messageHtml: message,
        confirmText,
        resolve,
      });
    });
  }, [uiForm]);

  const openRowMenu = useCallback((anchorEl, id) => {
    const rect = anchorEl.getBoundingClientRect();
    const width = 190;
    const left = Math.max(8, rect.right - width);
    const top = rect.bottom + 6;
    setActiveMenuTaskId(id);
    setMenuPosition({ left, top });
  }, []);

  const closeRowMenu = useCallback(() => {
    setActiveMenuTaskId(null);
  }, []);

  // Handle outside popmenu clicks & resize
  React.useEffect(() => {
    const handleOutsideClick = (e) => {
      if (activeMenuTaskId) {
        const popmenu = document.getElementById("popmenu");
        if (popmenu && !popmenu.contains(e.target) && !e.target.closest(".menu-btn")) {
          closeRowMenu();
        }
      }
    };
    document.addEventListener("click", handleOutsideClick);
    window.addEventListener("resize", closeRowMenu);
    return () => {
      document.removeEventListener("click", handleOutsideClick);
      window.removeEventListener("resize", closeRowMenu);
    };
  }, [activeMenuTaskId, closeRowMenu]);

  return (
    <UIContext.Provider value={{
      state: {
        completedOpen, openTaskId, openListId, openListArea, lyricsId, openTrackDetail,
        activeMenuTaskId, menuPosition, selectedAgainstArea, selectedGridCell,
        dialogInput, dialogSession, checkingForUpdate, installingUpdate, updateInfo,
        toast, dialog
      },
      actions: {
        setCompletedOpen, setOpenTaskId, setOpenListId, setOpenListArea, setLyricsId,
        setOpenTrackDetail, setSelectedAgainstArea, setSelectedGridCell, setDialogInput,
        setDialogSession, setCheckingForUpdate, setInstallingUpdate, setUpdateInfo,
        showToast, uiForm, resolveDialog, uiPrompt, uiConfirm, uiNote, openRowMenu, closeRowMenu
      }
    }}>
      {children}
    </UIContext.Provider>
  );
}
