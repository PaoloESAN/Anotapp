use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

fn mascot_image_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("Failed to create app data dir: {}", e))?;
    }
    Ok(dir.join("mascot_image.txt"))
}

#[tauri::command]
fn save_mascot_image(app: AppHandle, data_url: String) -> Result<(), String> {
    let path = mascot_image_path(&app)?;
    fs::write(&path, data_url).map_err(|e| format!("Failed to write mascot image: {}", e))?;
    let _ = app.emit("mascot-image-updated", ());
    Ok(())
}

#[tauri::command]
fn get_mascot_image(app: AppHandle) -> Result<Option<String>, String> {
    let path = mascot_image_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    let content =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read mascot image: {}", e))?;
    if content.trim().is_empty() {
        Ok(None)
    } else {
        Ok(Some(content))
    }
}

#[tauri::command]
fn clear_mascot_image(app: AppHandle) -> Result<(), String> {
    let path = mascot_image_path(&app)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("Failed to remove mascot image: {}", e))?;
    }
    let _ = app.emit("mascot-image-updated", ());
    Ok(())
}

#[tauri::command]
fn open_mascot_window(
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
fn close_mascot_window(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("mascot") {
        win.close()
            .map_err(|e| format!("Failed to close mascot window: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn set_mascot_size(app: AppHandle, size: f64) -> Result<(), String> {
    let win_size = size.clamp(64.0, 400.0);
    if let Some(win) = app.get_webview_window("mascot") {
        win.set_size(LogicalSize::new(win_size, win_size))
            .map_err(|e| format!("Failed to resize mascot window: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn set_mascot_opacity(app: AppHandle, opacity: f64) -> Result<(), String> {
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
            save_mascot_image,
            get_mascot_image,
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
