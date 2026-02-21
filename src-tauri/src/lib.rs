use serde::Serialize;
use std::io::{BufRead, BufReader, Read};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use tauri::Manager;
use tauri::Emitter;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn app_root_dir() -> Result<std::path::PathBuf, String> {
    #[cfg(debug_assertions)]
    {
        let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        if let Some(parent) = manifest_dir.parent() {
            return Ok(parent.to_path_buf());
        }
        return Ok(manifest_dir);
    }

    #[cfg(not(debug_assertions))]
    {
        let exe = std::env::current_exe()
            .map_err(|e| format!("Failed to resolve current executable path: {e}"))?;
        if let Some(parent) = exe.parent() {
            return Ok(parent.to_path_buf());
        }
        Err("Failed to resolve executable directory".to_string())
    }
}

fn app_tools_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let temp_dir = app
        .path()
        .temp_dir()
        .map_err(|e| format!("Failed to resolve temp dir: {e}"))?;
    let tools_dir = temp_dir.join("nscb-desktop-tools");
    std::fs::create_dir_all(&tools_dir)
        .map_err(|e| format!("Failed to create tools dir: {e}"))?;
    Ok(tools_dir)
}

fn nscb_exe_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let tools_dir = app_tools_dir(app)?;
    let exe_path = tools_dir.join("nscb_rust.exe");
    if !exe_path.exists() {
        return Err(format!("nscb_rust.exe not found at {}", exe_path.display()));
    }
    Ok(exe_path)
}

fn running_pid() -> &'static Mutex<Option<u32>> {
    static PID: OnceLock<Mutex<Option<u32>>> = OnceLock::new();
    PID.get_or_init(|| Mutex::new(None))
}

#[derive(Serialize, Clone)]
struct StdoutEvent {
    op: String,
    line: String,
}

#[derive(Serialize, Clone)]
struct StderrEvent {
    op: String,
    chunk: String,
}

#[derive(Serialize, Clone)]
struct DoneEvent {
    op: String,
    code: i32,
}

#[tauri::command]
fn import_keys(app: tauri::AppHandle, src_path: String) -> Result<(), String> {
    let tools_dir = app_tools_dir(&app)?;

    let dst_prod = tools_dir.join("prod.keys");
    std::fs::copy(&src_path, &dst_prod).map_err(|e| format!("Failed to copy prod.keys: {e}"))?;
    Ok(())
}

#[tauri::command]
fn get_tools_dir(app: tauri::AppHandle) -> Result<String, String> {
    let tools_dir = app_tools_dir(&app)?;
    Ok(tools_dir.to_string_lossy().into_owned())
}

#[tauri::command]
fn has_keys(app: tauri::AppHandle) -> Result<bool, String> {
    let tools_dir = app_tools_dir(&app)?;
    Ok(tools_dir.join("prod.keys").exists() || tools_dir.join("keys.txt").exists())
}

#[tauri::command]
fn has_backend(app: tauri::AppHandle) -> Result<bool, String> {
    let tools_dir = app_tools_dir(&app)?;
    Ok(tools_dir.join("nscb_rust.exe").exists())
}

#[tauri::command]
fn import_nscb_binary(app: tauri::AppHandle, src_path: String) -> Result<(), String> {
    let src = std::path::PathBuf::from(&src_path);
    if !src.exists() {
        return Err("Selected file does not exist".to_string());
    }
    let filename = src
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if filename != "nscb_rust.exe" && filename != "nscb_rust-x86_64-pc-windows-msvc.exe" {
        return Err("Please select nscb_rust.exe (or nscb_rust-x86_64-pc-windows-msvc.exe)".to_string());
    }

    let tools_dir = app_tools_dir(&app)?;
    let dst = tools_dir.join("nscb_rust.exe");
    std::fs::copy(src, &dst).map_err(|e| format!("Failed to copy nscb_rust.exe: {e}"))?;
    Ok(())
}

#[tauri::command]
fn run_nscb(app: tauri::AppHandle, operation: String, args: Vec<String>) -> Result<(), String> {
    {
        let mut lock = running_pid()
            .lock()
            .map_err(|_| "Failed to lock runner state".to_string())?;
        if lock.is_some() {
            return Err("A process is already running".to_string());
        }

        let exe_path = nscb_exe_path(&app)?;
        let work_dir = app_root_dir()?;

        let mut cmd = Command::new(exe_path);
        cmd.args(args)
            .current_dir(work_dir)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);
        let mut child = cmd.spawn()
            .map_err(|e| format!("Failed to start nscb_rust.exe: {e}"))?;

        *lock = Some(child.id());

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Failed to capture stdout".to_string())?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "Failed to capture stderr".to_string())?;

        let app_for_out = app.clone();
        let op_for_out = operation.clone();
        std::thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            let mut line = String::new();
            loop {
                line.clear();
                match reader.read_line(&mut line) {
                    Ok(0) => break,
                    Ok(_) => {
                        let trimmed = line.trim();
                        if !trimmed.is_empty() {
                            let _ = app_for_out.emit(
                                "nscb-stdout",
                                StdoutEvent {
                                    op: op_for_out.clone(),
                                    line: trimmed.to_string(),
                                },
                            );
                        }
                    }
                    Err(_) => break,
                }
            }
        });

        let app_for_err = app.clone();
        let op_for_err = operation.clone();
        std::thread::spawn(move || {
            let mut reader = BufReader::new(stderr);
            let mut buf = [0_u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                        if !chunk.trim().is_empty() {
                            let _ = app_for_err.emit(
                                "nscb-stderr",
                                StderrEvent {
                                    op: op_for_err.clone(),
                                    chunk,
                                },
                            );
                        }
                    }
                    Err(_) => break,
                }
            }
        });

        let op_for_done = operation.clone();
        std::thread::spawn(move || {
            let code = match child.wait() {
                Ok(status) => status.code().unwrap_or(-1),
                Err(_) => -1,
            };
            if let Ok(mut pid_lock) = running_pid().lock() {
                *pid_lock = None;
            }
            let _ = app.emit(
                "nscb-done",
                DoneEvent {
                    op: op_for_done,
                    code,
                },
            );
        });
    }

    Ok(())
}

#[tauri::command]
fn get_backend_version(app: tauri::AppHandle) -> Result<String, String> {
    let tools_dir = app_tools_dir(&app)?;
    let version_file = tools_dir.join("version.txt");
    if version_file.exists() {
        std::fs::read_to_string(&version_file)
            .map(|s| s.trim().to_string())
            .map_err(|e| format!("Failed to read version: {e}"))
    } else {
        Ok(String::new())
    }
}

#[tauri::command]
fn save_backend_version(app: tauri::AppHandle, version: String) -> Result<(), String> {
    let tools_dir = app_tools_dir(&app)?;
    std::fs::write(tools_dir.join("version.txt"), version.as_bytes())
        .map_err(|e| format!("Failed to save version: {e}"))
}

#[tauri::command]
fn download_backend(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let tools_dir = app_tools_dir(&app)?;
    let dst = tools_dir.join("nscb_rust.exe");

    let response = reqwest::blocking::get(&url)
        .map_err(|e| format!("Download failed: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Download returned HTTP {}", response.status()));
    }
    let bytes = response
        .bytes()
        .map_err(|e| format!("Failed to read response body: {e}"))?;
    std::fs::write(&dst, &bytes)
        .map_err(|e| format!("Failed to save nscb_rust.exe: {e}"))?;
    Ok(())
}

#[tauri::command]
fn cancel_nscb() -> Result<(), String> {
    let pid_opt = {
        let mut lock = running_pid()
            .lock()
            .map_err(|_| "Failed to lock runner state".to_string())?;
        lock.take()
    };

    if let Some(pid) = pid_opt {
        #[cfg(target_os = "windows")]
        {
            let mut cmd = Command::new("taskkill");
            cmd.args(["/PID", &pid.to_string(), "/T", "/F"])
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            cmd.creation_flags(CREATE_NO_WINDOW);
            let status = cmd.status()
                .map_err(|e| format!("Failed to stop process: {e}"))?;
            if !status.success() {
                return Err("Failed to stop running process".to_string());
            }
        }
    }

    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            import_keys,
            import_nscb_binary,
            get_tools_dir,
            has_keys,
            has_backend,
            get_backend_version,
            save_backend_version,
            download_backend,
            run_nscb,
            cancel_nscb
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
