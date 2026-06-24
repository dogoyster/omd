use tauri::{WebviewUrl, WebviewWindowBuilder};

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
        .invoke_handler(tauri::generate_handler![move_to_trash, open_window])
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
