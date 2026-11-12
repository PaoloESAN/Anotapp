use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("Failed to create app data dir: {}", e))?;
    }
    Ok(dir)
}

fn cleanup_old_mascots(dir: &Path) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if name_str.starts_with("mascot_") && name_str != "mascot_current.txt" {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
}

#[tauri::command]
async fn save_mascot_file(app: AppHandle, source_path: String) -> Result<String, String> {
    let dir = app_data_dir(&app)?;
    let src = Path::new(&source_path);
    if !src.exists() {
        return Err("El archivo seleccionado no existe".to_string());
    }

    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .filter(|e| matches!(e.as_str(), "png" | "jpg" | "jpeg" | "gif" | "webp"))
        .unwrap_or_else(|| "png".to_string());

    cleanup_old_mascots(&dir);

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let dest = dir.join(format!("mascot_{}.{}", ts, ext));

    fs::copy(src, &dest).map_err(|e| format!("No se pudo copiar la imagen: {}", e))?;

    let dest_str = dest.to_string_lossy().to_string();
    fs::write(dir.join("mascot_current.txt"), &dest_str)
        .map_err(|e| format!("No se pudo guardar la referencia: {}", e))?;

    let _ = app.emit("mascot-image-updated", Some(dest_str.clone()));
    Ok(dest_str)
}

#[tauri::command]
async fn get_mascot_file(app: AppHandle) -> Result<Option<String>, String> {
    let dir = app_data_dir(&app)?;
    let marker = dir.join("mascot_current.txt");
    if !marker.exists() {
        return Ok(None);
    }
    let path_str = fs::read_to_string(&marker)
        .map_err(|e| format!("Failed to read mascot marker: {}", e))?;
    let trimmed = path_str.trim();
    if trimmed.is_empty() || !Path::new(trimmed).exists() {
        Ok(None)
    } else {
        Ok(Some(trimmed.to_string()))
    }
}

#[tauri::command]
async fn clear_mascot_image(app: AppHandle) -> Result<(), String> {
    let dir = app_data_dir(&app)?;
    cleanup_old_mascots(&dir);
    let marker = dir.join("mascot_current.txt");
    if marker.exists() {
        let _ = fs::remove_file(marker);
    }
    let _ = app.emit("mascot-image-updated", Option::<String>::None);
    Ok(())
}

#[tauri::command]
async fn open_mascot_window(
    app: AppHandle,
    size: Option<f64>,
    x: Option<f64>,
    y: Option<f64>,
) -> Result<(), String> {
    let win_size = size.unwrap_or(160.0).clamp(64.0, 400.0);

    if let Some(existing) = app.get_webview_window("mascot") {
        let _ = existing.set_size(LogicalSize::new(win_size, win_size));
        let _ = existing.set_always_on_top(true);
        let _ = existing.show();
        return Ok(());
    }

    let mut builder = WebviewWindowBuilder::new(&app, "mascot", WebviewUrl::App("mascot/".into()))
        .title("Anotapp Mascot")
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .inner_size(win_size, win_size);

    if let (Some(px), Some(py)) = (x, y) {
        builder = builder.position(px, py);
    }

    builder
        .build()
        .map_err(|e| format!("Failed to create mascot window: {}", e))?;

    Ok(())
}

#[tauri::command]
async fn close_mascot_window(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("mascot") {
        win.close()
            .map_err(|e| format!("Failed to close mascot window: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
async fn set_mascot_size(app: AppHandle, size: f64) -> Result<(), String> {
    let win_size = size.clamp(64.0, 400.0);
    if let Some(win) = app.get_webview_window("mascot") {
        win.set_size(LogicalSize::new(win_size, win_size))
            .map_err(|e| format!("Failed to resize mascot window: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
async fn set_mascot_opacity(app: AppHandle, opacity: f64) -> Result<(), String> {
    let clamped = opacity.clamp(0.2, 1.0);
    let _ = app.emit("mascot-opacity-updated", clamped);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard::init())
        .invoke_handler(tauri::generate_handler![
            save_mascot_file,
            get_mascot_file,
            clear_mascot_image,
            open_mascot_window,
            close_mascot_window,
            set_mascot_size,
            set_mascot_opacity
        ])
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed = event {
                    if let Some(mascot) = window.app_handle().get_webview_window("mascot") {
                        let _ = mascot.close();
                    }
                }
            }
        })
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
