#[cfg(test)]
mod compatibility_tests {
    use super::*;

    #[test]
    fn accepts_old_run_state_without_new_pomodoro_fields() {
        let state: RemoteRunState = serde_json::from_value(serde_json::json!({
            "user_id": "user-1",
            "device_id": "device-1",
            "device_name": null,
            "active_task_id": "task-1",
            "running_start": 1000,
            "phase": "work",
            "break_start": null,
            "last_task_id": "task-1",
            "updated_at": 2000
        }))
        .unwrap();

        assert_eq!(state.cycles_completed, 0);
        assert!(!state.long_break);
    }

    #[test]
    fn accepts_old_config_without_long_break_fields() {
        let config: RemoteConfig = serde_json::from_value(serde_json::json!({
            "user_id": "user-1",
            "mode": "pomodoro",
            "target_min": 45,
            "work_min": 25,
            "break_min": 5,
            "break_sound": "Glass",
            "work_sound": "Ping",
            "updated_at": 2000
        }))
        .unwrap();

        assert_eq!(config.cycles_before_long_break, 4);
        assert_eq!(config.long_break_min, 20);
    }

    #[test]
    fn accepts_old_task_without_planner_fields_and_ignores_future_fields() {
        let task: RemoteTask = serde_json::from_value(serde_json::json!({
            "id": "task-1",
            "user_id": "user-1",
            "list_id": "list-1",
            "name": "Old task",
            "depth": null,
            "ord": 1,
            "est": 30,
            "done": null,
            "descr": null,
            "updated_at": 2000,
            "deleted_at": null,
            "album": null,
            "impact_tier": null,
            "impact_sign": 1,
            "deadline_at": null,
            "cadence": null,
            "future_server_field": "ignored"
        }))
        .unwrap();

        assert!(task.daily_windows.is_empty());
        assert_eq!(task.min_session_min, None);
        assert_eq!(task.max_session_min, None);
    }

    #[test]
    fn rejects_backend_missing_a_required_capability() {
        let schema = BackendSchema {
            schema_version: MIN_BACKEND_SCHEMA_VERSION,
            min_supported_client: "0.5.0".to_string(),
            capabilities: vec!["planner_windows_v1".to_string()],
        };

        let error = validate_backend_schema(&schema).unwrap_err();
        assert!(error.contains("life_area_priorities_v1"));
        assert_eq!(schema.min_supported_client, "0.5.0");
    }

    #[test]
    fn rejects_a_client_older_than_the_backend_support_window() {
        let schema = BackendSchema {
            schema_version: MIN_BACKEND_SCHEMA_VERSION,
            min_supported_client: "99.0.0".to_string(),
            capabilities: REQUIRED_BACKEND_CAPABILITIES
                .iter()
                .map(|capability| capability.to_string())
                .collect(),
        };

        let error = validate_backend_schema(&schema).unwrap_err();
        assert!(error.contains("Update TaskPlayer"));
    }
}
