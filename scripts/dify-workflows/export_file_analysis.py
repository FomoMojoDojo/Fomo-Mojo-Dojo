# Export the LIVE published DSL (secrets excluded) — used by scripts/guards/dify-workflow-guard.sh.
#   docker exec -e OUT=/tmp/live.yml docker-api-1 sh -c 'cd /app/api && .venv/bin/flask shell < /tmp/export.py'
import os
from extensions.ext_database import db
from models.model import App
from services.app_dsl_service import AppDslService
APP_ID = os.environ.get("APP_ID", "2b694256-d03d-4e2f-a0ae-8a0e666f3c38")
app = db.session.get(App, APP_ID)
y = AppDslService.export_dsl(app, include_secret=False, workflow_id=app.workflow_id)
open(os.environ["OUT"], "w").write(y)
print("exported", app.workflow_id, len(y))
