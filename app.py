"""
University LabLink - Flask backend (login + role-based access)

Run:
    pip install flask
    python app.py
Then open http://127.0.0.1:5000
"""
from pathlib import Path

from flask import Flask, jsonify, redirect, request, send_from_directory, session
from werkzeug.security import check_password_hash, generate_password_hash

BASE = Path(__file__).parent / "univ_lablink"

# Serve the existing frontend folder as-is (index.html, login/, header/, ...)
app = Flask(__name__, static_folder=str(BASE), static_url_path="")
app.secret_key = "change-this-to-a-long-random-string"  # signs the session cookie

# ---------------------------------------------------------------
# Accounts. Passwords are stored as hashes, never as plain text.
# Later you can replace this dict with a MySQL query on `accounts`.
# ---------------------------------------------------------------
ACCOUNTS = {
    "LAB-00001": {
        "name": "Administrator",
        "role": "admin",
        "password_hash": generate_password_hash("lab123"),
    },
    "2025-2-00001": {
        "name": "Katrina Mendoza",
        "role": "user",
        "password_hash": generate_password_hash("lab123"),
    },
}

# Where each role lands after a successful login (relative to site root)
ROLE_HOME = {
    "admin": "admin_welcome/admin_welcome.html",
    "user": "user_welcome/user_welcome.html",
}

# Folders that need a logged-in session with the matching role
PROTECTED = {
    "admin_welcome": "admin",
    "admin_dashboard": "admin",
    "user_welcome": "user",
    "user_dashboard": "user",
}


# ---------------------------------------------------------------
# Route guard: runs before every request
# ---------------------------------------------------------------
@app.before_request
def guard_pages():
    first_segment = request.path.strip("/").split("/")[0]
    required_role = PROTECTED.get(first_segment)
    if required_role and session.get("role") != required_role:
        return redirect("/index.html")


# ---------------------------------------------------------------
# Pages / API
# ---------------------------------------------------------------
@app.route("/")
def home():
    return send_from_directory(BASE, "index.html")


@app.post("/api/login")
def login():
    data = request.get_json(silent=True) or {}
    account_id = str(data.get("id", "")).strip().upper()
    password = str(data.get("password", ""))

    if not account_id or not password:
        return jsonify(ok=False, message="Please enter your User ID and password."), 400

    account = ACCOUNTS.get(account_id)
    if not account or not check_password_hash(account["password_hash"], password):
        return jsonify(ok=False, message="Invalid User ID or password."), 401

    session.clear()
    session["account_id"] = account_id
    session["role"] = account["role"]
    session["name"] = account["name"]

    return jsonify(
        ok=True,
        role=account["role"],
        name=account["name"],
        redirect=ROLE_HOME[account["role"]],
    )


@app.get("/api/me")
def me():
    if "role" not in session:
        return jsonify(ok=False), 401
    return jsonify(ok=True, id=session["account_id"], name=session["name"], role=session["role"])


@app.route("/logout")
def logout():
    session.clear()
    return redirect("/index.html")


if __name__ == "__main__":
    app.run(debug=True)
