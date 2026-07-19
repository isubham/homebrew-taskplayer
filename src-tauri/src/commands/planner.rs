use super::super::*;

#[specta::specta]
#[tauri::command]
pub(crate) fn suggest_automatic_plan(
    state: State<AppState>,
    time_zone: String,
) -> Result<taskplayer_core::planner::AutomaticPlanPreview, String> {
    let time_zone = taskplayer_core::planner::parse_time_zone(&time_zone)
        .ok_or_else(|| AUTOMATIC_PLAN_TIME_ZONE_MSG.to_string())?;
    let db = state.db.lock().unwrap();
    let lists = db.lists().map_err(|error| error.to_string())?;
    let tasks = db.tasks().map_err(|error| error.to_string())?;
    let sessions = db.sessions().map_err(|error| error.to_string())?;
    let planned_sessions = db.planned_sessions().map_err(|error| error.to_string())?;
    let priorities = db
        .life_area_priorities()
        .map_err(|error| error.to_string())?;
    Ok(taskplayer_core::planner::suggest_automatic_plan(
        taskplayer_core::planner::AutomaticPlannerInput {
            lists: &lists,
            tasks: &tasks,
            sessions: &sessions,
            planned_sessions: &planned_sessions,
            life_area_priorities: &priorities,
            now: now_ms(),
            time_zone,
        },
    ))
}

#[specta::specta]
#[tauri::command]
pub(crate) fn accept_automatic_plan(
    app: AppHandle,
    state: State<AppState>,
    time_zone: String,
    preview: taskplayer_core::planner::AutomaticPlanPreview,
) -> Result<Snapshot, String> {
    let time_zone = taskplayer_core::planner::parse_time_zone(&time_zone)
        .ok_or_else(|| AUTOMATIC_PLAN_TIME_ZONE_MSG.to_string())?;
    let db = state.db.lock().unwrap();
    let lists = db.lists().map_err(|error| error.to_string())?;
    let tasks = db.tasks().map_err(|error| error.to_string())?;
    let sessions = db.sessions().map_err(|error| error.to_string())?;
    let planned_sessions = db.planned_sessions().map_err(|error| error.to_string())?;
    let priorities = db
        .life_area_priorities()
        .map_err(|error| error.to_string())?;
    let current = taskplayer_core::planner::suggest_automatic_plan(
        taskplayer_core::planner::AutomaticPlannerInput {
            lists: &lists,
            tasks: &tasks,
            sessions: &sessions,
            planned_sessions: &planned_sessions,
            life_area_priorities: &priorities,
            now: now_ms(),
            time_zone,
        },
    );
    if preview != current {
        return Err(AUTOMATIC_PLAN_ACCEPT_MSG.to_string());
    }
    let accepted = db
        .add_planned_session_suggestions(&preview.suggestions)
        .map_err(|error| error.to_string())?;
    drop(db);
    if accepted.is_none() {
        return Err(AUTOMATIC_PLAN_ACCEPT_MSG.to_string());
    }
    push(&app);
    Ok(build_snapshot(state.inner()))
}

#[specta::specta]
#[tauri::command]
pub(crate) fn create_planned_session(
    app: AppHandle,
    state: State<AppState>,
    task_id: String,
    start: f64,
    end: f64,
) -> Result<Snapshot, String> {
    let created = state
        .db
        .lock()
        .unwrap()
        .add_planned_session(&task_id, start as i64, end as i64)
        .map_err(|error| error.to_string())?;
    if created.is_none() {
        return Err(PLANNED_SESSION_INVALID_MSG.to_string());
    }
    push(&app);
    Ok(build_snapshot(state.inner()))
}

#[specta::specta]
#[tauri::command]
pub(crate) fn update_planned_session(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    task_id: Option<String>,
    start: f64,
    end: f64,
) -> Result<Snapshot, String> {
    let updated = state
        .db
        .lock()
        .unwrap()
        .update_planned_session(&id, task_id.as_deref(), start as i64, end as i64)
        .map_err(|error| error.to_string())?;
    if !updated {
        return Err(PLANNED_SESSION_INVALID_MSG.to_string());
    }
    push(&app);
    Ok(build_snapshot(state.inner()))
}

#[specta::specta]
#[tauri::command]
pub(crate) fn delete_planned_session(
    app: AppHandle,
    state: State<AppState>,
    id: String,
) -> Result<Snapshot, String> {
    state
        .db
        .lock()
        .unwrap()
        .delete_planned_session(&id)
        .map_err(|error| error.to_string())?;
    push(&app);
    Ok(build_snapshot(state.inner()))
}

#[specta::specta]
#[tauri::command]
pub(crate) fn start_planned_session(
    app: AppHandle,
    state: State<AppState>,
    id: String,
) -> Result<Snapshot, String> {
    let task_id = {
        let db = state.db.lock().unwrap();
        let planned = db
            .planned_sessions()
            .map_err(|error| error.to_string())?
            .into_iter()
            .find(|planned| planned.id == id)
            .ok_or_else(|| PLANNED_SESSION_NOT_FOUND_MSG.to_string())?;
        let eligible = db
            .tasks()
            .map_err(|error| error.to_string())?
            .into_iter()
            .any(|task| {
                task.id == planned.task_id && task.completed_at.is_none() && task.cadence.is_none()
            });
        if !eligible {
            return Err(PLANNED_SESSION_INVALID_MSG.to_string());
        }
        db.delete_planned_session(&id)
            .map_err(|error| error.to_string())?;
        planned.task_id
    };
    do_play(state.inner(), &task_id, TIMER_PAUSE_TRIGGER_PLANNED_SESSION);
    push(&app);
    Ok(build_snapshot(state.inner()))
}
