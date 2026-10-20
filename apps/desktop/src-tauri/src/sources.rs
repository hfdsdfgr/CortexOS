use crate::{
    db::Database,
    models::{AppResult, new_id, now},
};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    io::Read,
    path::{Path, PathBuf},
    time::Instant,
};

fn error(_: rusqlite::Error) -> String {
    "文件资料保存或读取失败，请保留当前内容并重试。".into()
}
fn missing() -> String {
    "文件不存在，或不在当前工作区里。".into()
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    pub id: String,
    pub name: String,
    pub latest_version: i64,
    pub enabled: bool,
    pub revision: i64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub document: Source,
    pub version: i64,
    pub content: String,
    pub content_hash: String,
    pub created_at: String,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceRef {
    pub source_id: String,
    pub version: i64,
    pub start_line: usize,
    pub end_line: usize,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourcePreview {
    pub ticket: String,
    pub name: String,
    pub content: String,
    pub content_hash: String,
    pub previous_version: Option<i64>,
    pub previous_revision: Option<i64>,
}
#[derive(Clone)]
pub struct PendingSource {
    pub workspace: String,
    pub path: String,
    pub raw_hash: String,
    pub preview: SourcePreview,
    pub created: Instant,
}

pub fn read_selected(path: &Path, workspace: &str, db: &Database) -> AppResult<PendingSource> {
    if !path.is_absolute() {
        return Err("请用文件选择窗口选择本机文件。".into());
    }
    #[cfg(windows)]
    {
        use std::path::{Component, Prefix};
        if !matches!(path.components().next(), Some(Component::Prefix(p)) if matches!(p.kind(),Prefix::Disk(_) | Prefix::VerbatimDisk(_)))
        {
            return Err("仅支持本机磁盘文件，不支持网络路径。".into());
        }
    }
    for parent in path.ancestors() {
        let meta = std::fs::symlink_metadata(parent)
            .map_err(|_| "无法读取所选文件，请检查权限。".to_string())?;
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if meta.file_attributes() & 0x400 != 0 {
                return Err(
                    "文件或所在文件夹有链接跳转（符号链接或重解析点），请从实际位置选择原文件。"
                        .into(),
                );
            }
        }
        if meta.file_type().is_symlink() {
            return Err("这个路径是符号链接，请从实际位置选择原文件。".into());
        }
    }
    let name = path
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or("文件名无效。")?
        .to_string();
    let lower = name.to_lowercase();
    let extension = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    if !["txt", "md"].contains(&extension.as_str())
        || lower.starts_with('.')
        || ["token", "credential", "secret", "password", "id_rsa"]
            .iter()
            .any(|term| lower.contains(term))
    {
        return Err(
            "只支持 .txt/.md 文本文件；名称涉及密码、访问密钥等敏感信息的文件不能导入。".into(),
        );
    }
    let canonical =
        std::fs::canonicalize(path).map_err(|_| "无法找到所选文件的实际位置。".to_string())?;
    let mut options = std::fs::OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.share_mode(1).custom_flags(0x00200000);
    }
    let file = options
        .open(path)
        .map_err(|_| "文件被占用或不可读，请关闭写入程序后重试。".to_string())?;
    let metadata = file
        .metadata()
        .map_err(|_| "无法读取文件属性。".to_string())?;
    if !metadata.is_file() || metadata.len() > 2 * 1024 * 1024 {
        return Err("请选择不超过 2 MiB 的普通文本文件。".into());
    }
    // Validate the opened handle, so a changed parent path cannot redirect the read.
    #[cfg(windows)]
    {
        use std::{
            ffi::{OsString, c_void},
            os::windows::{ffi::OsStringExt, io::AsRawHandle},
        };
        #[link(name = "kernel32")]
        unsafe extern "system" {
            fn GetFinalPathNameByHandleW(
                handle: *mut c_void,
                buffer: *mut u16,
                length: u32,
                flags: u32,
            ) -> u32;
        }
        let mut buffer = vec![0u16; 32768];
        let length = unsafe {
            GetFinalPathNameByHandleW(
                file.as_raw_handle(),
                buffer.as_mut_ptr(),
                buffer.len() as u32,
                0,
            )
        } as usize;
        if length == 0
            || length >= buffer.len()
            || PathBuf::from(OsString::from_wide(&buffer[..length])) != canonical
        {
            return Err("文件路径在读取前发生变化，请重新选择。".into());
        }
    }
    let mut bytes = Vec::new();
    file.take(2 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "文件读取失败。".to_string())?;
    if bytes.len() > 2 * 1024 * 1024 {
        return Err("文件超过 2 MiB，请缩小后重试。".into());
    }
    let raw_hash = hash(&bytes);
    let text = String::from_utf8(bytes)
        .map_err(|_| "文件不是 UTF-8，请转换编码后重新选择。".to_string())?;
    let content = text.trim_start_matches('\u{feff}').replace("\r\n", "\n");
    if content.trim().is_empty() || content.contains('\0') {
        return Err("文件为空或含有二进制内容，请选择普通文本。".into());
    }
    let path = canonical.to_str().ok_or("文件路径编码无效。")?.to_string();
    let previous = db.source_previous(workspace, &path)?;
    Ok(PendingSource {
        workspace: workspace.into(),
        path,
        raw_hash,
        created: Instant::now(),
        preview: SourcePreview {
            ticket: new_id(),
            name,
            content_hash: hash(content.as_bytes()),
            content,
            previous_version: previous.map(|p| p.0),
            previous_revision: previous.map(|p| p.1),
        },
    })
}

fn source(row: &rusqlite::Row<'_>) -> rusqlite::Result<Source> {
    Ok(Source {
        id: row.get(0)?,
        name: row.get(1)?,
        latest_version: row.get(2)?,
        enabled: row.get(3)?,
        revision: row.get(4)?,
    })
}
pub fn available(connection: &Connection, node: &str, version: i64) -> AppResult<bool> {
    let exists:bool=connection.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='knowledge_source_links')",[],|r|r.get(0)).map_err(error)?;
    if !exists {
        return Ok(true);
    }
    connection.query_row("SELECT NOT EXISTS(SELECT 1 FROM knowledge_source_links l JOIN source_documents s ON s.id=l.source_id WHERE l.node_id=?1 AND l.knowledge_version=?2 AND s.enabled=0)",params![node,version],|r|r.get(0)).map_err(error)
}
pub fn evidence(connection: &Connection, node: &str, version: i64) -> AppResult<Vec<Value>> {
    let mut stmt=connection.prepare("SELECT l.source_id,l.source_version,s.name,s.enabled,l.start_line,l.end_line,l.excerpt,v.content_hash FROM knowledge_source_links l JOIN source_documents s ON s.id=l.source_id JOIN source_versions v ON v.source_id=l.source_id AND v.version=l.source_version WHERE l.node_id=?1 AND l.knowledge_version=?2").map_err(error)?;
    stmt.query_map(params![node,version],|r|Ok(json!({"sourceId":r.get::<_,String>(0)?,"version":r.get::<_,i64>(1)?,"name":r.get::<_,String>(2)?,"enabled":r.get::<_,bool>(3)?,"startLine":r.get::<_,i64>(4)?,"endLine":r.get::<_,i64>(5)?,"excerpt":r.get::<_,String>(6)?,"contentHash":r.get::<_,String>(7)?}))).map_err(error)?.collect::<rusqlite::Result<Vec<_>>>().map_err(error)
}
pub fn excerpt(
    connection: &Connection,
    workspace: &str,
    reference: &SourceRef,
) -> AppResult<String> {
    let content:Option<String>=connection.query_row("SELECT v.content FROM source_versions v JOIN source_documents s ON s.id=v.source_id WHERE s.workspace_id=?1 AND s.id=?2 AND v.version=?3 AND s.enabled=1",params![workspace,reference.source_id,reference.version],|r|r.get(0)).optional().map_err(error)?;
    let content = content.ok_or("文件不存在、已停用，或不在当前工作区里。")?;
    let lines: Vec<_> = content.split('\n').collect();
    if reference.start_line == 0
        || reference.end_line < reference.start_line
        || reference.end_line > lines.len()
    {
        return Err("请选择有效的起止行。".into());
    }
    let text = lines[reference.start_line - 1..reference.end_line].join("\n");
    if text.trim().is_empty() || text.chars().count() > 20000 {
        return Err("选中的文字需为1–20000字，请减少选择的行数。".into());
    }
    Ok(text)
}
fn refresh_nodes(c: &Connection, id: &str) -> AppResult<()> {
    let ids = c
        .prepare("SELECT DISTINCT node_id FROM knowledge_source_links WHERE source_id=?1")
        .map_err(error)?
        .query_map(params![id], |r| r.get::<_, String>(0))
        .map_err(error)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(error)?;
    for id in ids {
        crate::retrieval::index_node(c, &id)?;
    }
    Ok(())
}
impl Database {
    pub fn source_previous(&self, workspace: &str, path: &str) -> AppResult<Option<(i64, i64)>> {
        let c = self.connection()?;
        let valid: bool = c
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM workspaces WHERE id=?1)",
                params![workspace],
                |r| r.get(0),
            )
            .map_err(error)?;
        if !valid {
            return Err(missing());
        }
        c.query_row("SELECT latest_version,revision FROM source_documents WHERE workspace_id=?1 AND canonical_path=?2",params![workspace,path],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(error)
    }
    pub fn import_source(&self, pending: PendingSource) -> AppResult<Source> {
        let mut c = self.connection()?;
        let tx = c.transaction().map_err(error)?;
        let previous:Option<(Source,String)>=tx.query_row("SELECT s.id,s.name,s.latest_version,s.enabled,s.revision,v.raw_hash FROM source_documents s JOIN source_versions v ON v.source_id=s.id AND v.version=s.latest_version WHERE s.workspace_id=?1 AND s.canonical_path=?2",params![pending.workspace,pending.path],|r|Ok((source(r)?,r.get(5)?))).optional().map_err(error)?;
        if previous
            .as_ref()
            .map(|(s, _)| (s.latest_version, s.revision))
            != pending
                .preview
                .previous_version
                .zip(pending.preview.previous_revision)
        {
            return Err("文件资料已被更新，请重新选择文件并预览。".into());
        }
        let timestamp = now();
        let (id, version, kind) = if let Some((old, raw)) = previous {
            if raw == pending.raw_hash && old.enabled {
                tx.commit().map_err(error)?;
                return Ok(old);
            }
            let version = old.latest_version + i64::from(raw != pending.raw_hash);
            tx.execute("UPDATE source_documents SET latest_version=?2,enabled=1,revision=revision+1,updated_at=?3 WHERE id=?1",params![old.id,version,timestamp]).map_err(error)?;
            (
                old.id,
                version,
                if raw == pending.raw_hash {
                    "reauthorized"
                } else {
                    "reimported"
                },
            )
        } else {
            let id = new_id();
            tx.execute(
                "INSERT INTO source_documents VALUES(?1,?2,?3,?4,1,1,1,?5,?5)",
                params![
                    id,
                    pending.workspace,
                    pending.path,
                    pending.preview.name,
                    timestamp
                ],
            )
            .map_err(error)?;
            (id, 1, "imported")
        };
        if kind != "reauthorized" {
            tx.execute(
                "INSERT INTO source_versions VALUES(?1,?2,?3,?4,?5,?6)",
                params![
                    id,
                    version,
                    pending.preview.content,
                    pending.preview.content_hash,
                    pending.raw_hash,
                    timestamp
                ],
            )
            .map_err(error)?;
        }
        tx.execute(
            "INSERT INTO source_events VALUES(?1,?2,?3,?4)",
            params![new_id(), id, kind, timestamp],
        )
        .map_err(error)?;
        refresh_nodes(&tx, &id)?;
        tx.commit().map_err(error)?;
        drop(c);
        Ok(self
            .source_snapshot(&pending.workspace, &id, version)?
            .document)
    }
    pub fn sources(&self, workspace: &str) -> AppResult<Vec<Source>> {
        let c = self.connection()?;
        let mut stmt=c.prepare("SELECT id,name,latest_version,enabled,revision FROM source_documents WHERE workspace_id=?1 ORDER BY updated_at DESC,id").map_err(error)?;
        stmt.query_map(params![workspace], source)
            .map_err(error)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(error)
    }
    pub fn source_snapshot(&self, workspace: &str, id: &str, version: i64) -> AppResult<Snapshot> {
        let c = self.connection()?;
        let document=c.query_row("SELECT id,name,latest_version,enabled,revision FROM source_documents WHERE workspace_id=?1 AND id=?2",params![workspace,id],source).optional().map_err(error)?.ok_or_else(missing)?;
        c.query_row("SELECT content,content_hash,created_at FROM source_versions WHERE source_id=?1 AND version=?2",params![id,version],|r|Ok(Snapshot{document:document.clone(),version,content:r.get(0)?,content_hash:r.get(1)?,created_at:r.get(2)?})).optional().map_err(error)?.ok_or_else(missing)
    }
    pub fn revoke_source(&self, workspace: &str, id: &str, expected: i64) -> AppResult<()> {
        let mut c = self.connection()?;
        let tx = c.transaction().map_err(error)?;
        let changed=tx.execute("UPDATE source_documents SET enabled=0,revision=revision+1,updated_at=?4 WHERE workspace_id=?1 AND id=?2 AND revision=?3 AND enabled=1",params![workspace,id,expected,now()]).map_err(error)?;
        if changed != 1 {
            return Err("文件状态已变化，或不在当前工作区里，请刷新。".into());
        }
        tx.execute(
            "INSERT INTO source_events VALUES(?1,?2,'revoked',?3)",
            params![new_id(), id, now()],
        )
        .map_err(error)?;
        refresh_nodes(&tx, id)?;
        tx.commit().map_err(error)
    }
}
