# SPDX-License-Identifier: AGPL-3.0-or-later
"""The Brave Search API engine with its key read from a FILE at engine start (2026-11-18, the SearXNG restore).

SearXNG's own ``braveapi`` engine takes ``api_key`` from settings.yml. This wrapper keeps the key out of every
settings file: it reads it from ``/run/secrets/brave_api_key`` (a read-only bind mount of
``~/.mojomap/brave-api-key``, see scripts/searxng/run-searxng.sh) and hands it to the stock engine. The stock
engine does the request and the parsing; nothing else is changed. The key is never logged or echoed.

Mounted into the container as ``/usr/local/searxng/searx/engines/braveapi_keyfile.py``; settings.yml names
``engine: braveapi_keyfile`` with NO api_key.
"""

import datetime
import fcntl
import json
import os

from searx.engines import braveapi as _stock
from searx.exceptions import SearxEngineAPIException

KEY_PATH = "/run/secrets/brave_api_key"

# THE DAILY CEILING (2026-11-18): every request this engine sends is one paid Brave query ($5 per 1,000). The count per
# UTC day is kept in the cache volume (shared by every worker, under a file lock); at the ceiling the engine refuses
# before anything is sent, with an error SearXNG reports in unresponsive_engines. settings.yml may set daily_ceiling.
USAGE_PATH = "/var/cache/searxng/braveapi-usage.json"
daily_ceiling: int = 200

about = dict(_stock.about)
categories = list(_stock.categories)
paging = _stock.paging
safesearch = _stock.safesearch
time_range_support = _stock.time_range_support
results_per_page: int = _stock.results_per_page


def init(_engine_settings):
    """Read the key file; refuse to start without it (the error names the path, never the key)."""
    try:
        with open(KEY_PATH, encoding="utf-8") as fh:
            key = fh.read().strip()
    except OSError as exc:
        raise SearxEngineAPIException(f"braveapi_keyfile: no readable key file at {KEY_PATH} ({exc.__class__.__name__})") from None
    if not key:
        raise SearxEngineAPIException(f"braveapi_keyfile: the key file at {KEY_PATH} is empty")
    _stock.api_key = key
    _stock.results_per_page = results_per_page


def _take_one() -> None:
    today = datetime.datetime.now(datetime.timezone.utc).date().isoformat()
    with open(USAGE_PATH, "a+", encoding="utf-8") as fh:
        fcntl.flock(fh, fcntl.LOCK_EX)
        fh.seek(0)
        try:
            usage = json.loads(fh.read() or "{}")
        except ValueError:
            usage = {}
        used = int(usage.get(today, 0))
        if used >= daily_ceiling:
            raise SearxEngineAPIException(f"daily query ceiling reached: {used} of {daily_ceiling} Brave queries used on {today} (UTC)")
        usage = {today: used + 1}
        fh.seek(0)
        fh.truncate()
        fh.write(json.dumps(usage))
        fh.flush()
        os.fsync(fh.fileno())


def request(query, params):
    _take_one()
    return _stock.request(query, params)


def response(resp):
    return _stock.response(resp)
