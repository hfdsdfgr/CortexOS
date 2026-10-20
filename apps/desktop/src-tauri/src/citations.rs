use serde_json::{Value, json};

/// Check locations only. This does not verify whether a claim is supported.
pub fn check(content: &str, manifest: &Value) -> Option<Value> {
    if manifest["citationProtocol"] != "knowledge_lines_v1" {
        return None;
    }
    let references = manifest["knowledgeRefs"].as_array()?;
    let mut occurrences = Vec::new();
    let mut used = Vec::<Value>::new();
    let mut cursor = 0;
    let mut utf16 = 0;
    while let Some(relative) = content[cursor..].find("[资料") {
        let start = cursor + relative;
        utf16 += content[cursor..start].encode_utf16().count();
        let rest = &content[start..];
        // Bound malformed markers; never scan the remaining answer per marker.
        let mut length = 0;
        for (offset, ch) in rest.char_indices().take(128) {
            if ch == '\n' || ch == '\r' {
                break;
            }
            length = offset + ch.len_utf8();
            if ch == ']' {
                break;
            }
        }
        let label = &rest[..length];
        let parsed = label.strip_prefix('[').and_then(|s| s.strip_suffix(']'));
        let (id, range) = parsed
            .unwrap_or("")
            .split_once(':')
            .map_or((parsed.unwrap_or(""), None), |(id, range)| {
                (id, Some(range))
            });
        let reference = references.iter().find(|item| item["citationId"] == id);
        let mut error = None;
        let mut lines = None;
        if let Some(reference) = reference {
            let count = reference["content"].as_str()?.split('\n').count();
            lines = match range {
                None => Some((1, count)),
                Some(value) => value.split_once('-').and_then(|(a, b)| {
                    let a = a.parse::<usize>().ok()?;
                    let b = b.parse::<usize>().ok()?;
                    (value == format!("{a}-{b}") && a > 0 && a <= b && b <= count).then_some((a, b))
                }),
            };
            if lines.is_none() {
                error = Some("引用的行号格式不正确或超出资料内容。");
            } else if !used.iter().any(|item| item["citationId"] == id) {
                used.push(reference.clone());
            }
        } else {
            error = Some(if parsed.is_none() {
                "引用标记不完整。"
            } else {
                "本次发给模型的资料中没有这个编号。"
            });
        }
        let end = utf16 + label.encode_utf16().count();
        occurrences.push(json!({"start":utf16,"end":end,"label":label,
            "referenceId":if error.is_none() {Some(id)} else {None},
            "startLine":lines.map(|p|p.0),"endLine":lines.map(|p|p.1),"error":error}));
        cursor = start + length;
        utf16 = end;
    }
    Some(
        json!({"version":1,"references":used,"occurrences":occurrences,
        "availableCount":references.len(),"scope":"reference_locations_only"}),
    )
}
