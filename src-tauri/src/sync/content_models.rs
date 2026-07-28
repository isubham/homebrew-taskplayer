use super::*;

#[derive(Debug, Serialize, Deserialize)]
pub(super) struct RemoteList {
    pub(super) id: String,
    pub(super) user_id: String,
    pub(super) name: String,
    pub(super) emoji: String,
    pub(super) color: String,
    pub(super) ord: i64,
    pub(super) updated_at: i64,
    pub(super) deleted_at: Option<i64>,
    // Life-balance fields are nullable for older remote rows.
    pub(super) life_area: Option<String>,
    pub(super) life_direction: Option<String>,
    #[serde(default)]
    pub(super) availability_windows: Vec<WeeklyTimeWindow>,
}

impl RemoteList {
    pub(super) fn from_local(l: &TaskList, user_id: &str) -> Self {
        RemoteList {
            id: l.id.clone(),
            user_id: user_id.to_string(),
            name: l.name.clone(),
            emoji: l.emoji.clone(),
            color: l.color.clone(),
            ord: l.order,
            updated_at: l.updated_at,
            deleted_at: l.deleted_at,
            life_area: l.life_area.clone(),
            life_direction: l.life_direction.clone(),
            availability_windows: l.availability_windows.clone(),
        }
    }
    pub(super) fn into_local(self) -> TaskList {
        TaskList {
            id: self.id,
            name: self.name,
            emoji: self.emoji,
            color: self.color,
            order: self.ord,
            updated_at: self.updated_at,
            life_area: canonical_life_area(self.life_area.as_deref()),
            life_direction: self.life_direction,
            availability_windows: self.availability_windows,
            deleted_at: self.deleted_at,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub(super) struct RemoteAlbum {
    pub(super) id: String,
    pub(super) user_id: String,
    pub(super) list_id: String,
    pub(super) name: String,
    pub(super) ord: i64,
    pub(super) updated_at: i64,
    pub(super) deleted_at: Option<i64>,
}

impl RemoteAlbum {
    pub(super) fn from_local(album: &Album, user_id: &str) -> Self {
        Self {
            id: album.id.clone(),
            user_id: user_id.to_string(),
            list_id: album.list_id.clone(),
            name: album.name.clone(),
            ord: album.order,
            updated_at: album.updated_at,
            deleted_at: album.deleted_at,
        }
    }

    pub(super) fn into_local(self) -> Album {
        Album {
            id: self.id,
            list_id: self.list_id,
            name: self.name,
            order: self.ord,
            updated_at: self.updated_at,
            deleted_at: self.deleted_at,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub(super) struct RemoteLifeAreaPriority {
    pub(super) user_id: String,
    pub(super) area_key: String,
    pub(super) priority_rank: i64,
    pub(super) updated_at: i64,
}

impl RemoteLifeAreaPriority {
    pub(super) fn from_local(priority: &LifeAreaPriority, user_id: &str) -> Self {
        Self {
            user_id: user_id.to_string(),
            area_key: priority.area_key.clone(),
            priority_rank: priority.priority_rank,
            updated_at: priority.updated_at,
        }
    }

    pub(super) fn into_local(self) -> LifeAreaPriority {
        LifeAreaPriority {
            area_key: self.area_key,
            priority_rank: self.priority_rank,
            updated_at: self.updated_at,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub(super) struct RemoteTask {
    pub(super) id: String,
    pub(super) user_id: String,
    pub(super) list_id: String,
    pub(super) name: String,
    pub(super) depth: Option<String>,
    pub(super) ord: i64,
    pub(super) est: Option<i64>,
    pub(super) done: Option<i64>,
    pub(super) descr: Option<String>,
    pub(super) updated_at: i64,
    pub(super) deleted_at: Option<i64>,
    pub(super) album: Option<String>,
    // Impact tier/sign (see models.rs's Task doc comments) — same "requires
    // an `alter table` on an older Supabase project" caveat as TaskList's
    // life_area/life_direction above.
    pub(super) impact_tier: Option<String>,
    #[serde(default = "default_impact_sign_remote")]
    pub(super) impact_sign: i64,
    // Deadline (see models.rs's Task doc comments and
    // docs/homepage-now-spec.md) — same "requires an `alter table` on an
    // older Supabase project" caveat as impact_tier above.
    pub(super) deadline_at: Option<i64>,
    // Cadence ("daily" | None, see models.rs's Task doc comments) — same
    // "requires an `alter table` on an older Supabase project" caveat as
    // impact_tier/deadline_at above.
    pub(super) cadence: Option<String>,
    #[serde(default)]
    pub(super) daily_windows: Vec<WeeklyTimeWindow>,
    pub(super) min_session_min: Option<i64>,
    pub(super) max_session_min: Option<i64>,
}

pub(super) fn default_impact_sign_remote() -> i64 {
    1
}

impl RemoteTask {
    pub(super) fn from_local(t: &Task, user_id: &str) -> Self {
        RemoteTask {
            id: t.id.clone(),
            user_id: user_id.to_string(),
            list_id: t.list_id.clone(),
            name: t.name.clone(),
            depth: t.depth.clone(),
            ord: t.order,
            est: t.estimate_min,
            done: t.completed_at,
            descr: t.description.clone(),
            updated_at: t.updated_at,
            deleted_at: t.deleted_at,
            album: t.album.clone(),
            impact_tier: t.impact_tier.clone(),
            impact_sign: t.impact_sign,
            deadline_at: t.deadline_at,
            cadence: t.cadence.clone(),
            daily_windows: t.daily_windows.clone(),
            min_session_min: t.min_session_min,
            max_session_min: t.max_session_min,
        }
    }
    pub(super) fn into_local(self) -> Task {
        Task {
            id: self.id,
            list_id: self.list_id,
            name: self.name,
            depth: self.depth,
            order: self.ord,
            estimate_min: self.est,
            completed_at: self.done,
            description: self.descr,
            updated_at: self.updated_at,
            deleted_at: self.deleted_at,
            album: self.album,
            impact_tier: self.impact_tier,
            impact_sign: self.impact_sign,
            deadline_at: self.deadline_at,
            cadence: self.cadence,
            daily_windows: self.daily_windows,
            min_session_min: self.min_session_min,
            max_session_min: self.max_session_min,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub(super) struct RemoteGoal {
    pub(super) id: String,
    pub(super) user_id: String,
    pub(super) life_area: String,
    pub(super) title: String,
    pub(super) description: Option<String>,
    pub(super) status: String,
    pub(super) is_current_focus: bool,
    pub(super) next_task_id: Option<String>,
    pub(super) updated_at: i64,
    pub(super) deleted_at: Option<i64>,
}

impl RemoteGoal {
    pub(super) fn from_local(goal: &Goal, user_id: &str) -> Self {
        Self {
            id: goal.id.clone(),
            user_id: user_id.to_string(),
            life_area: goal.life_area.clone(),
            title: goal.title.clone(),
            description: goal.description.clone(),
            status: goal.status.clone(),
            is_current_focus: goal.is_current_focus,
            next_task_id: goal.next_task_id.clone(),
            updated_at: goal.updated_at,
            deleted_at: goal.deleted_at,
        }
    }

    pub(super) fn into_local(self) -> Goal {
        Goal {
            id: self.id,
            life_area: self.life_area,
            title: self.title,
            description: self.description,
            status: self.status,
            is_current_focus: self.is_current_focus,
            next_task_id: self.next_task_id,
            updated_at: self.updated_at,
            deleted_at: self.deleted_at,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub(super) struct RemoteGoalTaskLink {
    pub(super) user_id: String,
    pub(super) goal_id: String,
    pub(super) task_id: String,
    pub(super) updated_at: i64,
    pub(super) deleted_at: Option<i64>,
}

impl RemoteGoalTaskLink {
    pub(super) fn from_local(link: &GoalTaskLink, user_id: &str) -> Self {
        Self {
            user_id: user_id.to_string(),
            goal_id: link.goal_id.clone(),
            task_id: link.task_id.clone(),
            updated_at: link.updated_at,
            deleted_at: link.deleted_at,
        }
    }

    pub(super) fn into_local(self) -> GoalTaskLink {
        GoalTaskLink {
            goal_id: self.goal_id,
            task_id: self.task_id,
            updated_at: self.updated_at,
            deleted_at: self.deleted_at,
        }
    }
}
