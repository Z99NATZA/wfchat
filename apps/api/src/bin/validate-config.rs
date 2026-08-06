use std::{env, path::PathBuf};

use wfchat_api::config::Config;

fn main() {
    if let Err(error) = validate_example() {
        eprintln!("config error: {error}");
        std::process::exit(1);
    }
}

fn validate_example() -> Result<(), String> {
    let path = env::args_os()
        .nth(1)
        .map(PathBuf::from)
        .ok_or_else(|| "usage: validate-config <env-file>".to_owned())?
        .canonicalize()
        .map_err(|_| "environment example file is unavailable".to_owned())?;

    for (key, _) in env::vars_os() {
        env::remove_var(key);
    }

    dotenvy::from_path(&path).map_err(|_| "environment example file is malformed".to_owned())?;
    Config::from_env()?;
    println!("Valid configuration: {}", path.display());
    Ok(())
}
