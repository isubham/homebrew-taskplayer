use super::*;

#[derive(Debug, Serialize, Deserialize)]
pub(super) struct RemotePlannedSession {
    pub(super) id: String,
    pub(super) user_id: String,
    pub(super) task_id: String,
    pub(super) start: i64,
    pub(super) end: i64,
    pub(super) updated_at: i64,
    pub(super) deleted_at: Option<i64>,
}

impl RemotePlannedSession {
    pub(super) fn from_local(session: &PlannedSession, user_id: &str) -> Self {
        Self {
            id: session.id.clone(),
            user_id: user_id.to_string(),
            task_id: session.task_id.clone(),
            start: session.start,
            end: session.end,
            updated_at: session.updated_at,
            deleted_at: session.deleted_at,
        }
    }

    pub(super) fn into_local(self) -> PlannedSession {
        PlannedSession {
            id: self.id,
            task_id: self.task_id,
            start: self.start,
            end: self.end,
            updated_at: self.updated_at,
            deleted_at: self.deleted_at,
        }
    }
}
