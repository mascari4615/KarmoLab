//! 우산 (karmoddrine) 아래 KarmoLab 저장소 폴더 판정.
//!
//! - 폴더 이름 이전 중: 새 이름 `KarmoLab`, 옛 이름 `Mascari4615.github.io`
//! - 후보 순서대로 `<umbrella>/<이름>/apps/karmolab` 이 있는 첫 이름
//! - 둘 다 없으면 새 이름

use std::path::{Path, PathBuf};

/// 후보 폴더 이름. 앞이 우선.
pub const KARMOLAB_REPO_DIR_NAMES: [&str; 2] = ["KarmoLab", "Mascari4615.github.io"];

/// 우산 아래 KarmoLab 저장소 폴더 이름.
pub fn karmolab_repo_dir_name(umbrella: &Path) -> &'static str {
    KARMOLAB_REPO_DIR_NAMES
        .iter()
        .copied()
        .find(|name| umbrella.join(name).join("apps").join("karmolab").is_dir())
        .unwrap_or(KARMOLAB_REPO_DIR_NAMES[0])
}

/// 우산 아래 KarmoLab 저장소 폴더 경로.
pub fn karmolab_repo_dir(umbrella: &Path) -> PathBuf {
    umbrella.join(karmolab_repo_dir_name(umbrella))
}
