import os
import sys

import uvicorn

from app.settings import settings

if __name__ == "__main__":
    if getattr(sys, "frozen", False):
        # PLAN 10.2: reload mode re-imports "app.main:app" by string in a
        # watcher subprocess, which a frozen exe can't do (and shouldn't —
        # nothing on disk changes at runtime). Import the app object
        # directly instead, which also gives PyInstaller's static analysis
        # a real import to follow so it bundles every router module.
        from app.main import app

        uvicorn.run(app, host=settings.host, port=settings.port)
    else:
        # PLAN 10.2: uvicorn's reload spawns a second (server) process under
        # this one and manages it with its own watcher — electron/main.cjs
        # only tracks the PID it spawned, so killing that alone orphans the
        # server child. Electron sets CSCMS_RELOAD=false to get the same
        # single-process shape dev.bat's reload=True flow doesn't need.
        reload = os.environ.get("CSCMS_RELOAD", "true").lower() != "false"
        uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=reload)
