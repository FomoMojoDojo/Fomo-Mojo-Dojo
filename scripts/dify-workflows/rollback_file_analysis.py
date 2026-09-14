# Rollback = the pointer flip (signed 1a). Points the app back at an existing published version; deletes nothing.
#   docker cp scripts/dify-workflows/rollback_file_analysis.py docker-api-1:/tmp/rollback.py
#   docker exec -e TO=<workflow_id> docker-api-1 sh -c 'cd /app/api && .venv/bin/flask shell < /tmp/rollback.py'
import os
from extensions.ext_database import db
from models.model import App
from models.workflow import Workflow
APP_ID = os.environ.get("APP_ID", "2b694256-d03d-4e2f-a0ae-8a0e666f3c38")
TO = os.environ["TO"]
app = db.session.get(App, APP_ID); wf = db.session.get(Workflow, TO)
assert app is not None and wf is not None and wf.app_id == APP_ID and wf.version != "draft", "target must be a published version of this app"
print("apps.workflow_id:", app.workflow_id, "->", TO); app.workflow_id = TO; db.session.commit(); print("done")
