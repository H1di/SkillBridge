# Deploy SkillBridge on Render

SkillBridge is set up to run as a single Render web service so the frontend and the Python API stay on the same origin.

## What is included

- `render.yaml` creates a Python web service with a persistent disk.
- `server.py` now reads `SKILLBRIDGE_DATA_DIR`, so SQLite can live on the mounted disk.
- `requirements.txt` is included so Render's Python build step has a standard dependency file.

## Deploy steps

1. Push this repo to GitHub.
2. In Render, choose `New` -> `Blueprint`.
3. Connect the repository and let Render read `render.yaml`.
4. Review the generated service settings.
5. Deploy the Blueprint.

## Important notes

- The service starts with `python server.py`.
- Health checks use `/api/meta`.
- SQLite is stored under `/var/data/skillbridge.db` on the Render disk.
- Render service names must be unique. If `skillbridge-web` is already taken, rename the service during setup.
- If you already have local data in `data/skillbridge.db`, Render will not copy it automatically. You will need to recreate that data or migrate it separately.

## After deploy

- Open the Render service URL instead of GitHub Pages.
- Register and log in through the Render-hosted site so cookies and API requests stay same-origin.
