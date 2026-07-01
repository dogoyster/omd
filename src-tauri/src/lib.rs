use std::path::Path;
use tauri::{WebviewUrl, WebviewWindowBuilder};

/// src 디렉토리를 dst로 rsync식 미러링(변경/신규만 복사, dst의 잉여 파일 삭제).
/// 로컬 vault → Drive 폴더 백업용. 편집은 로컬에서만 하므로 편집-중 동기화 충돌이 없다.
fn mirror(src: &Path, dst: &Path) -> std::io::Result<usize> {
    std::fs::create_dir_all(dst)?;
    let mut copied = 0usize;
    let mut src_names = std::collections::HashSet::new();
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let name = entry.file_name();
        if name == ".DS_Store" || name == ".git" {
            continue;
        }
        src_names.insert(name.clone());
        let s = entry.path();
        let d = dst.join(&name);
        if s.is_dir() {
            copied += mirror(&s, &d)?;
        } else {
            let need = match std::fs::metadata(&d) {
                Ok(dm) => {
                    let sm = std::fs::metadata(&s)?;
                    sm.modified().ok() > dm.modified().ok() || sm.len() != dm.len()
                }
                Err(_) => true,
            };
            if need {
                std::fs::copy(&s, &d)?;
                copied += 1;
            }
        }
    }
    // dst에만 있는(=로컬에서 지워진) 항목 제거 → 진짜 미러 유지
    for entry in std::fs::read_dir(dst)? {
        let entry = entry?;
        if !src_names.contains(&entry.file_name()) {
            let p = entry.path();
            if p.is_dir() {
                let _ = std::fs::remove_dir_all(&p);
            } else {
                let _ = std::fs::remove_file(&p);
            }
        }
    }
    Ok(copied)
}

#[tauri::command]
fn mirror_dir(src: String, dst: String) -> Result<usize, String> {
    mirror(Path::new(&src), Path::new(&dst)).map_err(|e| e.to_string())
}

/// 파일/폴더를 OS 휴지통으로 이동. 영구삭제(std::fs::remove)와 달리
/// 복구 가능하고, Google Drive 같은 클라우드 가상 볼륨에서도 정상 동작한다.
#[tauri::command]
fn move_to_trash(path: String) -> Result<(), String> {
    trash::delete(&path).map_err(|e| e.to_string())
}

/// 같은 프론트엔드를 로드하는 새 네이티브 창을 연다.
/// url의 쿼리스트링(예: `index.html?doc=...`)으로 무엇을 열지 전달한다.
/// label은 모든 창에서 고유해야 한다(capabilities의 `omd-*`와 매칭).
#[tauri::command]
fn open_window(app: tauri::AppHandle, label: String, url: String, title: String) -> Result<(), String> {
    WebviewWindowBuilder::new(&app, label, WebviewUrl::App(url.into()))
        .title(title)
        .inner_size(900.0, 700.0)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![move_to_trash, open_window, mirror_dir])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
