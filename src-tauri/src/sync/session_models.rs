use super::*;

#[derive(Debug, Serialize, Deserialize)]
pub(super) struct RemoteSession {
    pub(super) id: String,
    pub(super) user_id: String,
    pub(super) task_id: String,
    pub(super) start: i64,
    pub(super) end: Option<i64>,
    #[serde(default)]
    pub(super) logical_session_id: Option<String>,
    #[serde(default)]
    pub(super) session_finished_at: Option<i64>,
    pub(super) updated_at: i64,
    pub(super) deleted_at: Option<i64>,
}

impl RemoteSession {
    pub(super) fn from_local(session: &Session, user_id: &str) -> Self {
        Self {
            id: session.id.clone(),
            user_id: user_id.to_string(),
            task_id: session.task_id.clone(),
            start: session.start,
            end: session.end,
            logical_session_id: session.logical_session_id.clone(),
            session_finished_at: session.session_finished_at,
            updated_at: session.updated_at,
            deleted_at: session.deleted_at,
        }
    }

    pub(super) fn into_local(self) -> Session {
        Session {
            id: self.id,
            task_id: self.task_id,
            start: self.start,
            end: self.end,
            logical_session_id: self.logical_session_id,
            session_finished_at: self.session_finished_at,
            updated_at: self.updated_at,
            deleted_at: self.deleted_at,
        }
    }
}
