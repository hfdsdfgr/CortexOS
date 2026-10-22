"""Synthetic desktop delivery fixture; Python stdlib only, repository artifacts only."""
import hashlib
import json
from pathlib import Path
import sqlite3
import sys

root = Path(__file__).resolve().parents[3]
action, raw_path = sys.argv[1:]
path = Path(raw_path).resolve()
if not path.is_relative_to(root / 'artifacts'):
    raise ValueError('Delivery database must stay inside repository artifacts')

if action == 'seed-v6':
    if path.exists():
        raise FileExistsError(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as db:
        db.execute('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL,applied_at TEXT NOT NULL)')
        for version, sql in enumerate(sorted((root / 'apps/desktop/src-tauri/migrations').glob('*.sql'))[:6], 1):
            text = sql.read_bytes().decode('utf-8')
            db.executescript(text)
            db.execute('INSERT INTO schema_migrations VALUES(?,?,?)', (version, hashlib.sha256(text.encode()).hexdigest(), '2026-10-22T00:00:00Z'))
            db.commit()
        db.execute("INSERT INTO workspaces VALUES('delivery-v6','升级前的工作区','2026-10-22T00:00:00Z','2026-10-22T00:00:00Z')")
        db.execute("INSERT INTO knowledge_nodes(id,workspace_id,latest_version,revision,created_at,updated_at) VALUES('delivery-v6-node','delivery-v6',1,1,'2026-10-22T00:00:00Z','2026-10-22T00:00:00Z')")
        db.execute("INSERT INTO knowledge_versions VALUES('delivery-v6-node',1,'升级前的知识','knowledge','这段内容必须在升级后保留。','user','隔离迁移夹具','2026-10-22T00:00:00Z')")
elif action != 'snapshot':
    raise ValueError('Unknown action')

with sqlite3.connect(path.as_uri() + '?mode=ro', uri=True) as db:
    assert db.execute('PRAGMA integrity_check').fetchall() == [('ok',)]
    assert db.execute('PRAGMA foreign_key_check').fetchall() == []
    tables = {}
    for (name,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").fetchall():
        quoted = name.replace('"', '""')
        rows = sorted(json.dumps(row, ensure_ascii=False, default=str) for row in db.execute(f'SELECT * FROM "{quoted}"'))
        tables[name] = {'rows': len(rows), 'sha256': hashlib.sha256('\n'.join(rows).encode()).hexdigest()}
    print(json.dumps({'integrity': 'ok', 'foreignKeys': 'ok', 'schemaVersion': db.execute('SELECT MAX(version) FROM schema_migrations').fetchone()[0], 'tables': tables}, ensure_ascii=False))
