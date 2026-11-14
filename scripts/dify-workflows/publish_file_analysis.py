# Publish a committed MojoMap File Analysis DSL into the LOCAL Dify instance — in-process, the exact code
# path the console's Publish button runs (import_app → draft, publish_workflow → new immutable version,
# apps.workflow_id → that version). Signed mechanism 2026-09-14 (1a). Run from the repo:
#   docker cp supabase/dify-workflows/mojomap-file-analysis.v2.yml docker-api-1:/tmp/dsl.yml
#   docker cp scripts/dify-workflows/publish_file_analysis.py docker-api-1:/tmp/publish.py
#   docker exec -e DSL=/tmp/dsl.yml -e MARK=file_analysis_v2 docker-api-1 sh -c 'cd /app/api && .venv/bin/flask shell < /tmp/publish.py'
# Rollback is the pointer flip: scripts/dify-workflows/rollback_file_analysis.py (or the console's version history).
# In-flight runs keep the graph they started with; only runs started afterwards use the new version.
#
# REQUIRED PROVIDER SETTING — NOT CARRIED BY THE DSL (SP-312, F43): the Ollama model credential for
# qwen2.5:14b-instruct (Dify → Settings → Model Provider → Ollama → that model) must have
# max_tokens >= 6300. Dify enforces that credential value as the MAXIMUM of a node's num_predict, and the
# file-analysis Adjudication node sends num_predict 6300 (SP-294's output backstop). With the default
# 4096 every analysis fails at Adjudication in 0.0 s with
#   ValueError: Model Parameter num_predict should be less than or equal to 4096.0.
# A fresh Dify built from the committed DSL alone has 4096. This script checks it BEFORE publishing and
# refuses, rather than letting the first analysis find out. After changing the credential, clear Dify's
# cache key provider_model_credentials:tenant_id:<tenant>:id:<provider_models.id> (the provider_models
# id, not the credential id) or the plugin keeps the old value.
import os
from sqlalchemy.orm import Session
from extensions.ext_database import db
from models.model import App
from models.account import Account
from services.app_dsl_service import AppDslService
from services.workflow_service import WorkflowService

APP_ID = os.environ.get("APP_ID", "2b694256-d03d-4e2f-a0ae-8a0e666f3c38")   # MojoMap File Analysis
DSL = os.environ["DSL"]
MARK = os.environ.get("MARK", "")
COMMENT = os.environ.get("COMMENT", "")

app = db.session.get(App, APP_ID)
assert app is not None, "app not found"
account = db.session.query(Account).filter(Account.status == "active").order_by(Account.created_at).first()
assert account is not None, "no active account"
account.set_tenant_id(app.tenant_id)

# SP-312: refuse to publish a num_predict the model credential would reject.
import json as _json, yaml as _yaml
from sqlalchemy import text as _text
_dsl = _yaml.safe_load(open(DSL).read())
for _node in _dsl["workflow"]["graph"]["nodes"]:
    _d = _node.get("data", {})
    if _d.get("type") != "llm":
        continue
    _np = (_d.get("model", {}).get("completion_params") or {}).get("num_predict")
    if _np is None:
        continue
    _row = db.session.execute(_text(
        "select c.encrypted_config from provider_models m join provider_model_credentials c on c.id = m.credential_id "
        "where m.tenant_id = :t and m.model_name = :n and m.provider_name = :p"),
        {"t": str(app.tenant_id), "n": _d["model"]["name"], "p": _d["model"]["provider"]}).first()
    _max = int(_json.loads(_row[0]).get("max_tokens", 4096)) if _row else 4096
    assert int(_np) <= _max, (f"REFUSED: node '{_d.get('title')}' sends num_predict {_np} but the "
        f"{_d['model']['name']} credential allows max_tokens {_max}. Raise the credential first (see header).")
    print(f"num_predict check: {_d.get('title')} {_np} <= credential max_tokens {_max}")

before = app.workflow_id
imp = AppDslService(db.session).import_app(account=account, import_mode="yaml-content", yaml_content=open(DSL).read(), app_id=APP_ID)
print("import:", imp.status, imp.error or "", "dsl_version", imp.imported_dsl_version)
assert str(imp.status).endswith("COMPLETED") or str(imp.status) == "completed", f"import not completed: {imp.status} {imp.error}"

with Session(db.engine, expire_on_commit=False) as session:
    app_in = session.get(App, APP_ID)
    wf = WorkflowService().publish_workflow(session=session, app_model=app_in, account=account, marked_name=MARK, marked_comment=COMMENT)
    app_in.workflow_id = wf.id
    session.commit()
    print("published:", wf.id, "version", wf.version, "marked", MARK)
    print("apps.workflow_id:", before, "->", app_in.workflow_id)


