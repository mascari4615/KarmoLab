//! 정본 스킬 이름 집합과 벤더 홈의 일치 개수.
//!
//! 표준 라이브러리만 쓴다. 시험은 `rustc --edition 2021 --test src/skill_sync.rs` 로 단독 실행 가능.
//! 판정 규칙의 짝은 memo `scripts/lib/skills-inventory.mjs` 와 `scripts/ai-env/audit.mjs`.

use std::path::{Path, PathBuf};

pub struct SkillSync {
    pub total: usize,
    pub claude_ok: usize,
    pub agents_ok: usize,
}

fn files_under(dir: &Path, base: &Path, out: &mut Vec<PathBuf>) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                files_under(&path, base, out);
            } else if let Ok(rel) = path.strip_prefix(base) {
                out.push(rel.to_path_buf());
            }
        }
    }
}

/// 정본 폴더의 모든 파일이 대상에 같은 바이트로 있으면 true
fn in_sync(canon: &Path, target: &Path) -> bool {
    if !target.join("SKILL.md").is_file() {
        return false;
    }
    let mut files = Vec::new();
    files_under(canon, canon, &mut files);
    files.iter().all(|rel| {
        match (std::fs::read(canon.join(rel)), std::fs::read(target.join(rel))) {
            (Ok(a), Ok(b)) => a == b,
            _ => false,
        }
    })
}

/// SKILL.md 가 든 정본 폴더마다 두 홈의 일치를 센다. 정본이 없거나 비면 None
pub fn count(canon_root: &Path, claude_root: &Path, agents_root: &Path) -> Option<SkillSync> {
    let entries = std::fs::read_dir(canon_root).ok()?;
    let (mut total, mut claude_ok, mut agents_ok) = (0, 0, 0);
    for entry in entries.flatten() {
        let dir = entry.path();
        if !dir.join("SKILL.md").is_file() {
            continue;
        }
        let name = entry.file_name();
        total += 1;
        if in_sync(&dir, &claude_root.join(&name)) {
            claude_ok += 1;
        }
        if in_sync(&dir, &agents_root.join(&name)) {
            agents_ok += 1;
        }
    }
    if total == 0 {
        None
    } else {
        Some(SkillSync { total, claude_ok, agents_ok })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp(label: &str) -> PathBuf {
        let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let dir = std::env::temp_dir().join(format!("skill-sync-{}-{}-{}", label, std::process::id(), nanos));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn put(root: &Path, name: &str, body: &str) {
        let dir = root.join(name);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("SKILL.md"), body).unwrap();
    }

    #[test]
    fn counts_matching_skills_per_home() {
        let (canon, claude, agents) = (temp("c"), temp("l"), temp("a"));
        put(&canon, "alpha", "A");
        put(&canon, "beta", "B");
        put(&claude, "alpha", "A");
        put(&claude, "beta", "B");
        put(&agents, "alpha", "A");
        let got = count(&canon, &claude, &agents).unwrap();
        assert_eq!((got.total, got.claude_ok, got.agents_ok), (2, 2, 1));
    }

    #[test]
    fn changed_bytes_do_not_count() {
        let (canon, claude, agents) = (temp("c"), temp("l"), temp("a"));
        put(&canon, "alpha", "A");
        put(&claude, "alpha", "changed");
        let got = count(&canon, &claude, &agents).unwrap();
        assert_eq!((got.total, got.claude_ok, got.agents_ok), (1, 0, 0));
    }

    #[test]
    fn extra_file_in_canon_must_exist_in_home() {
        let (canon, claude, agents) = (temp("c"), temp("l"), temp("a"));
        put(&canon, "alpha", "A");
        fs::create_dir_all(canon.join("alpha").join("reference")).unwrap();
        fs::write(canon.join("alpha").join("reference").join("x.md"), "x").unwrap();
        put(&claude, "alpha", "A");
        let got = count(&canon, &claude, &agents).unwrap();
        assert_eq!(got.claude_ok, 0);
    }

    #[test]
    fn stray_home_skills_and_empty_canon() {
        let (canon, claude, agents) = (temp("c"), temp("l"), temp("a"));
        put(&claude, "stray", "S");
        assert!(count(&canon, &claude, &agents).is_none());
        put(&canon, "alpha", "A");
        let got = count(&canon, &claude, &agents).unwrap();
        assert_eq!((got.total, got.claude_ok, got.agents_ok), (1, 0, 0));
    }
}
