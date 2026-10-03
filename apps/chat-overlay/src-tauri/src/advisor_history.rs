use serde_json::Value;
use std::path::PathBuf;

#[tauri::command]
pub fn load_advisor_history() -> Result<Vec<Value>, String> {
    let root = PathBuf::from(std::env::var("USERPROFILE").map_err(|error| error.to_string())?)
        .join(".karmoddrine/civ-advisor");
    let mut result = Vec::new();
    for (file, source) in [("questions.jsonl", "question"), ("automatic-answers.jsonl", "answer"),
                           ("advice-history.jsonl", "advice")] {
        let path = root.join(file);
        if !path.exists() { continue; }
        let raw = std::fs::read_to_string(path).map_err(|error| error.to_string())?;
        for line in raw.lines().rev().take(500) {
            if let Ok(record) = serde_json::from_str::<Value>(line) {
                result.push(serde_json::json!({ "source": source, "record": record }));
            }
        }
    }
    Ok(result)
}
