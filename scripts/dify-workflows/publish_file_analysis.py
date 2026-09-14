# Publish a committed MojoMap File Analysis DSL into the LOCAL Dify instance — in-process, the exact code
# path the console's Publish button runs (import_app → draft, publish_workflow → new immutable version,
# apps.workflow_id → that version). Signed mechanism 2026-09-14 (1a). Run from the repo:
#   docker cp supabase/dify-workflows/mojomap-file-analysis.v2.yml docker-api-1:/tmp/dsl.yml
#   docker cp scripts/dify-workflows/publish_file_analysis.py docker-api-1:/tmp/publish.py
#   docker exec -e DSL=/tmp/dsl.yml -e MARK=file_analysis_v2 docker-api-1 sh -c 'cd /app/api && .venv/bin/flask shell < /tmp/publish.py'
# Rollback is the pointer flip: scripts/dify-workflows/rollback_file_analysis.py (or the console's version history).
# In-flight runs keep the graph they started with; only runs started afterwards use the new version.
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


