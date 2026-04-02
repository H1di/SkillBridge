#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
import re
import secrets
import subprocess
import sys
import sqlite3
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("SKILLBRIDGE_DATA_DIR", str(ROOT / "data"))).expanduser()
if not DATA_DIR.is_absolute():
    DATA_DIR = (ROOT / DATA_DIR).resolve()
DB_PATH = DATA_DIR / "skillbridge.db"
COOKIE_NAME = "skillbridge_session"
SESSION_DAYS = 14
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
PASSWORD_ROUNDS = 310_000

WORK_AREAS = [
    {
        "key": "website-development",
        "label": "Website Development",
        "description": "Landing pages, business sites, maintenance, and web builds.",
        "icon": "web",
    },
    {
        "key": "ux-ui-design",
        "label": "UX/UI Design",
        "description": "Interface design, product flows, wireframes, and Figma-based work.",
        "icon": "draw",
    },
    {
        "key": "digital-marketing",
        "label": "Digital Marketing",
        "description": "SEO audits, social setup, campaign support, and growth work.",
        "icon": "campaign",
    },
    {
        "key": "creative-media",
        "label": "Creative Media",
        "description": "Video edits, motion assets, and supporting content production.",
        "icon": "movie",
    },
    {
        "key": "automation-support",
        "label": "Automation Support",
        "description": "Workflow automations, systems support, and process simplification.",
        "icon": "auto_awesome_motion",
    },
    {
        "key": "business-support",
        "label": "Business Support",
        "description": "Operational digital tasks, research, CRM, and data support.",
        "icon": "support_agent",
    },
]
WORK_AREA_KEYS = {item["key"] for item in WORK_AREAS}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return utc_now().isoformat()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ROUNDS)
    return f"{salt.hex()}${digest.hex()}"


def verify_password(stored_value: str, password: str) -> bool:
    try:
        salt_hex, digest_hex = stored_value.split("$", 1)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(digest_hex)
    except ValueError:
        return False
    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ROUNDS)
    return secrets.compare_digest(actual, expected)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def clean_text(value: Any, max_length: int = 4000) -> str:
    if value is None:
        return ""
    return str(value).strip()[:max_length]


def clean_projects(raw_projects: Any) -> list[str]:
    if isinstance(raw_projects, str):
        items = raw_projects.replace("\r", "").split("\n")
    elif isinstance(raw_projects, list):
        items = raw_projects
    else:
        items = []

    cleaned: list[str] = []
    for item in items:
        text = clean_text(item, 120)
        if text and text not in cleaned:
            cleaned.append(text)
    return cleaned[:8]


def build_waiting_project(
    title: str,
    project_type: str,
    description: str,
    *,
    created_at: str | None = None,
    request_id: str | None = None,
) -> dict[str, str]:
    return {
        "id": request_id or secrets.token_hex(8),
        "title": clean_text(title, 120),
        "type": clean_text(project_type, 80),
        "description": clean_text(description, 1000),
        "createdAt": clean_text(created_at or iso_now(), 64),
    }


def clean_waiting_projects(raw_projects: Any) -> list[dict[str, str]]:
    if isinstance(raw_projects, str):
        try:
            parsed = json.loads(raw_projects)
        except json.JSONDecodeError:
            parsed = []
    elif isinstance(raw_projects, list):
        parsed = raw_projects
    else:
        parsed = []

    if not isinstance(parsed, list):
        return []

    cleaned: list[dict[str, str]] = []
    seen_ids: set[str] = set()
    for item in parsed:
        if not isinstance(item, dict):
            continue
        project = build_waiting_project(
            item.get("title"),
            item.get("type"),
            item.get("description"),
            created_at=item.get("createdAt"),
            request_id=item.get("id"),
        )
        if len(project["title"]) < 2 or len(project["description"]) < 10:
            continue
        if project["type"] and project["type"] not in WORK_AREA_KEYS:
            project["type"] = ""
        if project["id"] in seen_ids:
            continue
        seen_ids.add(project["id"])
        cleaned.append(project)
    return cleaned[:12]


def ensure_database() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_type TEXT NOT NULL CHECK (account_type IN ('student', 'business')),
                full_name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                avatar_url TEXT NOT NULL DEFAULT '',
                area_of_work TEXT NOT NULL DEFAULT '',
                current_project TEXT NOT NULL DEFAULT '',
                company_name TEXT NOT NULL DEFAULT '',
                project_request TEXT NOT NULL DEFAULT '',
                waiting_projects TEXT NOT NULL DEFAULT '[]',
                current_projects TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS contacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                purpose TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            """
        )
        user_columns = {row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
        if "waiting_projects" not in user_columns:
            conn.execute("ALTER TABLE users ADD COLUMN waiting_projects TEXT NOT NULL DEFAULT '[]'")


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def sanitize_user(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None

    current_projects_raw = row["current_projects"] or "[]"
    try:
        current_projects = json.loads(current_projects_raw)
    except json.JSONDecodeError:
        current_projects = []
    waiting_projects = clean_waiting_projects(row["waiting_projects"] if "waiting_projects" in row.keys() else "[]")
    if not waiting_projects and clean_text(row["project_request"], 1000):
        waiting_projects = [
            build_waiting_project(
                "Project Request",
                "",
                row["project_request"],
                created_at=row["updated_at"],
                request_id=f"legacy-{row['id']}",
            )
        ]

    return {
        "id": row["id"],
        "accountType": row["account_type"],
        "fullName": row["full_name"],
        "email": row["email"],
        "avatarUrl": row["avatar_url"],
        "areaOfWork": row["area_of_work"],
        "currentProject": row["current_project"],
        "companyName": row["company_name"],
        "projectRequest": row["project_request"],
        "waitingProjects": waiting_projects,
        "currentProjects": current_projects if isinstance(current_projects, list) else [],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


class SkillBridgeHandler(SimpleHTTPRequestHandler):
    server_version = "SkillBridgeHTTP/1.0"

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api_get(parsed.path)
            return
        if parsed.path == "/":
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/"):
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return
        self.handle_api_post(parsed.path)

    def do_PATCH(self) -> None:
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/"):
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return
        self.handle_api_patch(parsed.path)

    def log_message(self, format: str, *args: Any) -> None:
        return super().log_message(format, *args)

    def parse_json_body(self) -> dict[str, Any] | None:
        length_header = self.headers.get("Content-Length")
        try:
            length = int(length_header or "0")
        except ValueError:
            self.send_json({"error": "Invalid content length."}, status=HTTPStatus.BAD_REQUEST)
            return None

        raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            data = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self.send_json({"error": "Request body must be valid JSON."}, status=HTTPStatus.BAD_REQUEST)
            return None

        if not isinstance(data, dict):
            self.send_json({"error": "JSON body must be an object."}, status=HTTPStatus.BAD_REQUEST)
            return None
        return data

    def send_json(
        self,
        payload: dict[str, Any],
        *,
        status: HTTPStatus = HTTPStatus.OK,
        cookie: str | None = None,
    ) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(body)

    def get_cookie_value(self, name: str) -> str | None:
        raw_cookie = self.headers.get("Cookie")
        if not raw_cookie:
            return None
        cookie = SimpleCookie()
        cookie.load(raw_cookie)
        morsel = cookie.get(name)
        return morsel.value if morsel else None

    def build_session_cookie(self, token: str, expires_at: datetime) -> str:
        cookie = SimpleCookie()
        cookie[COOKIE_NAME] = token
        cookie[COOKIE_NAME]["path"] = "/"
        cookie[COOKIE_NAME]["httponly"] = True
        cookie[COOKIE_NAME]["samesite"] = "Lax"
        cookie[COOKIE_NAME]["expires"] = expires_at.strftime("%a, %d %b %Y %H:%M:%S GMT")
        return cookie.output(header="").strip()

    def clear_session_cookie(self) -> str:
        cookie = SimpleCookie()
        cookie[COOKIE_NAME] = ""
        cookie[COOKIE_NAME]["path"] = "/"
        cookie[COOKIE_NAME]["httponly"] = True
        cookie[COOKIE_NAME]["samesite"] = "Lax"
        cookie[COOKIE_NAME]["expires"] = "Thu, 01 Jan 1970 00:00:00 GMT"
        return cookie.output(header="").strip()

    def current_user(self) -> dict[str, Any] | None:
        token = self.get_cookie_value(COOKIE_NAME)
        if not token:
            return None

        token_digest = hash_token(token)
        now_iso = iso_now()
        with get_connection() as conn:
            conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (now_iso,))
            row = conn.execute(
                """
                SELECT u.*
                FROM sessions s
                JOIN users u ON u.id = s.user_id
                WHERE s.token_hash = ? AND s.expires_at > ?
                LIMIT 1
                """,
                (token_digest, now_iso),
            ).fetchone()
        return sanitize_user(row)

    def create_session(self, user_id: int) -> str:
        token = secrets.token_urlsafe(32)
        expires_at = utc_now() + timedelta(days=SESSION_DAYS)
        with get_connection() as conn:
            conn.execute(
                "INSERT INTO sessions (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)",
                (user_id, hash_token(token), expires_at.isoformat(), iso_now()),
            )
        return self.build_session_cookie(token, expires_at)

    def destroy_session(self) -> str:
        token = self.get_cookie_value(COOKIE_NAME)
        if token:
            with get_connection() as conn:
                conn.execute("DELETE FROM sessions WHERE token_hash = ?", (hash_token(token),))
        return self.clear_session_cookie()

    def handle_api_get(self, path: str) -> None:
        if path == "/api/meta":
            self.send_json({"workAreas": WORK_AREAS})
            return
        if path == "/api/me":
            self.send_json({"user": self.current_user(), "workAreas": WORK_AREAS})
            return
        self.send_json({"error": "Not found."}, status=HTTPStatus.NOT_FOUND)

    def handle_api_post(self, path: str) -> None:
        data = self.parse_json_body()
        if data is None:
            return

        if path == "/api/contact":
            self.handle_contact(data)
            return
        if path == "/api/register":
            self.handle_register(data)
            return
        if path == "/api/login":
            self.handle_login(data)
            return
        if path == "/api/logout":
            cookie = self.destroy_session()
            self.send_json({"ok": True}, cookie=cookie)
            return
        if path == "/api/business/request":
            self.handle_business_request(data)
            return

        self.send_json({"error": "Not found."}, status=HTTPStatus.NOT_FOUND)

    def handle_api_patch(self, path: str) -> None:
        data = self.parse_json_body()
        if data is None:
            return

        if path == "/api/profile":
            self.handle_profile_update(data)
            return

        self.send_json({"error": "Not found."}, status=HTTPStatus.NOT_FOUND)

    def handle_contact(self, data: dict[str, Any]) -> None:
        name = clean_text(data.get("name"), 120)
        email = clean_text(data.get("email"), 160).lower()
        purpose = clean_text(data.get("purpose"), 40)
        message = clean_text(data.get("message"), 2000)
        valid_purposes = {"student", "business", "partnership", "support"}

        if len(name) < 2:
            self.send_json({"error": "Please enter your full name."}, status=HTTPStatus.BAD_REQUEST)
            return
        if not EMAIL_RE.match(email):
            self.send_json({"error": "Please enter a valid email address."}, status=HTTPStatus.BAD_REQUEST)
            return
        if purpose not in valid_purposes:
            self.send_json({"error": "Please select a valid inquiry purpose."}, status=HTTPStatus.BAD_REQUEST)
            return
        if len(message) < 10:
            self.send_json({"error": "Your message should be at least 10 characters."}, status=HTTPStatus.BAD_REQUEST)
            return

        user = self.current_user()
        with get_connection() as conn:
            conn.execute(
                "INSERT INTO contacts (user_id, name, email, purpose, message, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (user["id"] if user else None, name, email, purpose, message, iso_now()),
            )
        self.send_json({"ok": True, "message": "Your message has been recorded."})

    def handle_register(self, data: dict[str, Any]) -> None:
        account_type = clean_text(data.get("accountType"), 20)
        full_name = clean_text(data.get("fullName"), 120)
        email = clean_text(data.get("email"), 160).lower()
        password = str(data.get("password") or "")
        avatar_url = clean_text(data.get("avatarUrl"), 500)
        area_of_work = clean_text(data.get("areaOfWork"), 80)
        current_project = clean_text(data.get("currentProject"), 160)
        company_name = clean_text(data.get("companyName"), 160)
        project_request = clean_text(data.get("projectRequest"), 1000)
        current_projects = clean_projects(data.get("currentProjects"))

        if account_type not in {"student", "business"}:
            self.send_json({"error": "Choose either a student profile or a business account."}, status=HTTPStatus.BAD_REQUEST)
            return
        if len(full_name) < 2:
            self.send_json({"error": "Please enter your name."}, status=HTTPStatus.BAD_REQUEST)
            return
        if not EMAIL_RE.match(email):
            self.send_json({"error": "Please enter a valid email address."}, status=HTTPStatus.BAD_REQUEST)
            return
        if len(password) < 8:
            self.send_json({"error": "Password must be at least 8 characters."}, status=HTTPStatus.BAD_REQUEST)
            return
        if avatar_url and not re.match(r"^https?://", avatar_url):
            self.send_json({"error": "Avatar URL should start with http:// or https://."}, status=HTTPStatus.BAD_REQUEST)
            return

        if account_type == "student":
            if area_of_work not in WORK_AREA_KEYS:
                self.send_json({"error": "Please choose an area of work from the available SkillBridge options."}, status=HTTPStatus.BAD_REQUEST)
                return
            company_name = ""
            project_request = ""
            waiting_projects: list[dict[str, str]] = []
            current_projects = []
        else:
            if len(company_name) < 2:
                self.send_json({"error": "Please enter your company name."}, status=HTTPStatus.BAD_REQUEST)
                return
            area_of_work = ""
            current_project = ""
            waiting_projects = (
                [build_waiting_project("Project Request", "", project_request, created_at=iso_now())]
                if project_request
                else []
            )
            project_request = ""

        created_at = iso_now()
        try:
            with get_connection() as conn:
                cursor = conn.execute(
                    """
                    INSERT INTO users (
                        account_type, full_name, email, password_hash, avatar_url,
                        area_of_work, current_project, company_name, project_request, waiting_projects,
                        current_projects, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        account_type,
                        full_name,
                        email,
                        hash_password(password),
                        avatar_url,
                        area_of_work,
                        current_project,
                        company_name,
                        project_request,
                        json.dumps(waiting_projects),
                        json.dumps(current_projects),
                        created_at,
                        created_at,
                    ),
                )
                user_id = int(cursor.lastrowid)
                row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        except sqlite3.IntegrityError:
            self.send_json({"error": "An account with that email already exists."}, status=HTTPStatus.CONFLICT)
            return

        cookie = self.create_session(user_id)
        self.send_json({"ok": True, "user": sanitize_user(row)}, cookie=cookie)

    def handle_login(self, data: dict[str, Any]) -> None:
        email = clean_text(data.get("email"), 160).lower()
        password = str(data.get("password") or "")

        if not EMAIL_RE.match(email):
            self.send_json({"error": "Please enter a valid email address."}, status=HTTPStatus.BAD_REQUEST)
            return
        if not password:
            self.send_json({"error": "Please enter your password."}, status=HTTPStatus.BAD_REQUEST)
            return

        with get_connection() as conn:
            row = conn.execute("SELECT * FROM users WHERE email = ? LIMIT 1", (email,)).fetchone()

        if row is None or not verify_password(row["password_hash"], password):
            self.send_json({"error": "Email or password is incorrect."}, status=HTTPStatus.UNAUTHORIZED)
            return

        cookie = self.create_session(int(row["id"]))
        self.send_json({"ok": True, "user": sanitize_user(row)}, cookie=cookie)

    def handle_business_request(self, data: dict[str, Any]) -> None:
        user = self.current_user()
        if user is None:
            self.send_json({"error": "Please log in to create a project request."}, status=HTTPStatus.UNAUTHORIZED)
            return
        if user["accountType"] != "business":
            self.send_json({"error": "Only business accounts can create project requests."}, status=HTTPStatus.FORBIDDEN)
            return

        title = clean_text(data.get("title"), 120)
        project_type = clean_text(data.get("type"), 80)
        description = clean_text(data.get("description"), 1000)

        if len(title) < 2:
            self.send_json({"error": "Please enter a project title."}, status=HTTPStatus.BAD_REQUEST)
            return
        if project_type not in WORK_AREA_KEYS:
            self.send_json({"error": "Please choose a valid project type."}, status=HTTPStatus.BAD_REQUEST)
            return
        if len(description) < 10:
            self.send_json({"error": "Please add a project description with at least 10 characters."}, status=HTTPStatus.BAD_REQUEST)
            return

        waiting_projects = clean_waiting_projects(user.get("waitingProjects"))
        waiting_projects.append(build_waiting_project(title, project_type, description))
        updated_at = iso_now()

        with get_connection() as conn:
            conn.execute(
                """
                UPDATE users
                SET waiting_projects = ?, updated_at = ?
                WHERE id = ?
                """,
                (json.dumps(waiting_projects), updated_at, user["id"]),
            )
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()

        self.send_json({"ok": True, "user": sanitize_user(row)})

    def handle_profile_update(self, data: dict[str, Any]) -> None:
        user = self.current_user()
        if user is None:
            self.send_json({"error": "Please log in to update your profile."}, status=HTTPStatus.UNAUTHORIZED)
            return

        full_name = clean_text(data.get("fullName") or user["fullName"], 120)
        avatar_url = clean_text(data.get("avatarUrl") or user["avatarUrl"], 500)
        if avatar_url and not re.match(r"^https?://", avatar_url):
            self.send_json({"error": "Avatar URL should start with http:// or https://."}, status=HTTPStatus.BAD_REQUEST)
            return
        if len(full_name) < 2:
            self.send_json({"error": "Please enter your name."}, status=HTTPStatus.BAD_REQUEST)
            return

        updated_at = iso_now()
        with get_connection() as conn:
            if user["accountType"] == "student":
                area_of_work = clean_text(data.get("areaOfWork") or user["areaOfWork"], 80)
                current_project_source = data["currentProject"] if "currentProject" in data else user["currentProject"]
                current_project = clean_text(current_project_source, 160)
                if area_of_work not in WORK_AREA_KEYS:
                    self.send_json({"error": "Please choose a valid area of work."}, status=HTTPStatus.BAD_REQUEST)
                    return
                conn.execute(
                    """
                    UPDATE users
                    SET full_name = ?, avatar_url = ?, area_of_work = ?, current_project = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (full_name, avatar_url, area_of_work, current_project, updated_at, user["id"]),
                )
            else:
                company_name = clean_text(data.get("companyName") or user["companyName"], 160)
                project_request_source = data["projectRequest"] if "projectRequest" in data else user["projectRequest"]
                current_projects_source = data["currentProjects"] if "currentProjects" in data else user["currentProjects"]
                project_request = clean_text(project_request_source, 1000)
                current_projects = clean_projects(current_projects_source)
                if len(company_name) < 2:
                    self.send_json({"error": "Please enter your company name."}, status=HTTPStatus.BAD_REQUEST)
                    return
                conn.execute(
                    """
                    UPDATE users
                    SET full_name = ?, avatar_url = ?, company_name = ?, project_request = ?, current_projects = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        full_name,
                        avatar_url,
                        company_name,
                        project_request,
                        json.dumps(current_projects),
                        updated_at,
                        user["id"],
                    ),
                )

            row = conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()

        self.send_json({"ok": True, "user": sanitize_user(row)})
def parse_port() -> int:
    parser = argparse.ArgumentParser(description="Run the SkillBridge local server.")
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("PORT", "8000")),
        help="Port to bind the local server to. Defaults to PORT env or 8000.",
    )
    args = parser.parse_args()
    return int(args.port)


def describe_port_owner(port: int) -> str | None:
    try:
        result = subprocess.run(
            ["ss", "-ltnp", f"( sport = :{port} )"],
            capture_output=True,
            text=True,
            check=False,
        )
    except FileNotFoundError:
        return None

    lines = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    if len(lines) <= 1:
        return None
    return lines[-1]


def existing_skillbridge_server_url(port: int) -> str | None:
    candidates = [f"http://127.0.0.1:{port}/api/me", f"http://localhost:{port}/api/me"]
    for url in candidates:
        try:
            with urllib.request.urlopen(url, timeout=1.2) as response:
                if response.status != 200:
                    continue
                payload = json.loads(response.read().decode("utf-8"))
                if isinstance(payload, dict) and "workAreas" in payload:
                    return url.rsplit("/api/me", 1)[0]
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
            continue
    return None


def run() -> None:
    ensure_database()
    mimetypes.add_type("application/javascript", ".js")
    port = parse_port()
    ThreadingHTTPServer.allow_reuse_address = True
    try:
        server = ThreadingHTTPServer(("0.0.0.0", port), SkillBridgeHandler)
    except OSError as exc:
        if exc.errno == 98:
            existing_url = existing_skillbridge_server_url(port)
            if existing_url:
                print(f"SkillBridge server is already running on {existing_url}")
                print("Open that URL directly instead of starting a second copy.")
                return

            print(f"Port {port} is already in use, so SkillBridge could not start there.", file=sys.stderr)
            owner = describe_port_owner(port)
            if owner:
                print(f"Port owner: {owner}", file=sys.stderr)
            print("Stop that process, or run SkillBridge on another port with:", file=sys.stderr)
            print("  PORT=8001 python3 server.py", file=sys.stderr)
            raise SystemExit(1) from exc
        raise

    print(f"SkillBridge server running on http://localhost:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down SkillBridge server.")
    finally:
        server.server_close()


if __name__ == "__main__":
    run()
