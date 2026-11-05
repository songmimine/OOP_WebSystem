"""Flask application for University LabLink."""

import csv
import io
import os
import secrets
import sqlite3
import uuid
from datetime import datetime, timedelta
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, redirect, request, send_from_directory, session
from werkzeug.security import check_password_hash
from werkzeug.utils import secure_filename

from univ_lablink.database import DATABASE, initialize

BASE = Path(__file__).parent / "univ_lablink"
UPLOADS = BASE / "uploads"
UPLOADS.mkdir(exist_ok=True)

app = Flask(__name__, static_folder=str(BASE), static_url_path="")
app.config.update(
    SECRET_KEY=os.environ.get("LABLINK_SECRET_KEY") or secrets.token_hex(32),
    DATABASE=str(DATABASE),
    MAX_CONTENT_LENGTH=5 * 1024 * 1024,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    PERMANENT_SESSION_LIFETIME=timedelta(days=30),
)
initialize(app.config["DATABASE"])


class Account:
    def __init__(self, account_id, name, role):
        self.id = account_id
        self.name = name
        self.role = role

    def display_dashboard(self):
        return "index.html"


class User(Account):
    def display_dashboard(self):
        return "user_welcome/user_welcome.html"


class LaboratoryStaff(Account):
    def display_dashboard(self):
        return "admin_welcome/admin_welcome.html"


class Equipment:
    def __init__(self, equipment_id, name, available_quantity):
        self.id = equipment_id
        self.name = name
        self.available_quantity = available_quantity


class BorrowingRequest:
    def __init__(self, request_id, account_id, status):
        self.id = request_id
        self.account_id = account_id
        self.status = status


class BorrowingTransaction:
    def __init__(self, transaction_id, account_id, status):
        self.id = transaction_id
        self.account_id = account_id
        self.status = status


class OtherCases:
    CASE_TYPES = {"Damaged", "Lost", "Overdue", "Improper Return"}


def db():
    if "database" not in g:
        connection = sqlite3.connect(app.config["DATABASE"], timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 10000")
        g.database = connection
    return g.database


@app.teardown_appcontext
def close_db(_error=None):
    connection = g.pop("database", None)
    if connection is not None:
        connection.close()


def api_error(message, status=400):
    return jsonify(ok=False, message=message), status


def require_role(*roles):
    def decorator(handler):
        @wraps(handler)
        def guarded(*args, **kwargs):
            if not session.get("account_id"):
                return api_error("Please sign in to continue.", 401)
            if roles and session.get("role") not in roles:
                return api_error("You do not have permission to perform this action.", 403)
            return handler(*args, **kwargs)
        return guarded
    return decorator


def json_body():
    value = request.get_json(silent=True)
    return value if isinstance(value, dict) else {}


def account_from_session():
    row = db().execute(
        "SELECT account_id, full_name, role_id FROM accounts WHERE account_id = ? AND account_status = 'Active'",
        (session.get("account_id"),),
    ).fetchone()
    if not row:
        session.clear()
        return None
    role = "laboratory_staff" if row["role_id"] == "laboratory_staff" else "user"
    cls = LaboratoryStaff if role == "laboratory_staff" else User
    return cls(row["account_id"], row["full_name"], role)


def iso_now():
    return datetime.now().astimezone().isoformat(timespec="seconds")


def valid_date(value, label):
    if not isinstance(value, str) or not value:
        raise ValueError(label + " is required.")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(label + " must be a valid date and time.") from exc
    return parsed.isoformat(timespec="seconds") if "T" in value else parsed.date().isoformat()


def new_id(prefix):
    return prefix + "-" + uuid.uuid4().hex[:10].upper()


def equipment_rows(include_inactive=False):
    where = "" if include_inactive else "WHERE e.equipment_status = 'Active'"
    rows = db().execute(
        f"""SELECT e.*, c.category_name,
                   COALESCE((SELECT SUM(ti.quantity_borrowed - ti.quantity_returned - ti.quantity_lost)
                             FROM transaction_items ti
                             JOIN borrowing_transactions bt ON bt.transaction_id = ti.transaction_id
                             WHERE ti.equipment_id = e.equipment_id
                               AND bt.transaction_status IN ('Active', 'Partially Returned', 'Overdue', 'Damaged')
                               AND ti.quantity_borrowed > ti.quantity_returned + ti.quantity_lost), 0) AS borrowed_quantity
            FROM equipment e JOIN equipment_categories c ON c.category_id = e.category_id
            {where} ORDER BY e.equipment_name""",
    ).fetchall()
    return [
        {
            "id": row["equipment_id"],
            "name": row["equipment_name"],
            "detail": row["description"],
            "description": row["description"],
            "category": row["category_name"],
            "location": row["location"],
            "unit": row["unit"],
            "stock": row["available_quantity"],
            "availableQuantity": row["available_quantity"],
            "totalQuantity": row["total_quantity"],
            "borrowedQuantity": row["borrowed_quantity"],
            "status": "Available" if row["available_quantity"] > 0 and row["borrow_status"] == "Available" else "Unavailable",
            "borrowStatus": row["borrow_status"],
            "active": row["equipment_status"] == "Active",
            "condition": row["condition_status"],
            "image": row["image_path"],
        }
        for row in rows
    ]


def request_rows(account_id=None):
    db().execute(
        """UPDATE borrowing_transactions SET transaction_status = 'Overdue'
           WHERE transaction_status = 'Active' AND return_deadline < ? AND return_requested_at IS NULL""",
        (iso_now(),),
    )
    sql = """SELECT br.*, a.full_name, a.department, a.university_email, a.account_id,
                    bt.transaction_id, bt.release_datetime, bt.return_deadline,
                    bt.transaction_status, bt.return_requested_at, bt.actual_return_datetime,
                    er.extension_id, er.reason AS extension_reason, er.requested_new_due_date,
                    er.extension_status
             FROM borrowing_requests br
             JOIN accounts a ON a.account_id = br.account_id
             LEFT JOIN borrowing_transactions bt ON bt.request_id = br.request_id
             LEFT JOIN extension_requests er ON er.extension_id = (
                 SELECT extension_id FROM extension_requests WHERE transaction_id = bt.transaction_id
                 ORDER BY submitted_at DESC LIMIT 1
             )"""
    params = ()
    if account_id:
        sql += " WHERE br.account_id = ?"
        params = (account_id,)
    sql += " ORDER BY br.submitted_at DESC"
    result = []
    for row in db().execute(sql, params).fetchall():
        items = db().execute(
            """SELECT ri.equipment_id, ri.requested_quantity, e.equipment_name, e.description,
                      ti.transaction_item_id, ti.quantity_borrowed, ti.quantity_returned, ti.quantity_lost
               FROM borrowing_request_items ri
               JOIN equipment e ON e.equipment_id = ri.equipment_id
               LEFT JOIN transaction_items ti ON ti.equipment_id = ri.equipment_id
                   AND ti.transaction_id = ?
               WHERE ri.request_id = ? ORDER BY e.equipment_name""",
            (row["transaction_id"], row["request_id"]),
        ).fetchall()
        status = row["request_status"].lower()
        if row["transaction_id"]:
            status = row["transaction_status"].lower().replace(" ", "_")
            if row["return_requested_at"] and status in ("active", "overdue", "partially_returned"):
                status = "return_requested"
        result.append(
            {
                "id": row["request_id"],
                "accountId": row["account_id"],
                "studentName": row["full_name"],
                "studentNumber": row["account_id"],
                "email": row["university_email"],
                "department": row["department"],
                "purpose": row["purpose"],
                "notes": row["notes"],
                "items": [
                    {
                        "id": item["equipment_id"],
                        "name": item["equipment_name"],
                        "detail": item["description"],
                        "qty": item["requested_quantity"],
                        "transactionItemId": item["transaction_item_id"],
                        "quantityBorrowed": item["quantity_borrowed"] or 0,
                        "quantityReturned": item["quantity_returned"] or 0,
                        "quantityLost": item["quantity_lost"] or 0,
                        "outstanding": max(0, (item["quantity_borrowed"] or 0) - (item["quantity_returned"] or 0) - (item["quantity_lost"] or 0)),
                    }
                    for item in items
                ],
                "qty": sum(item["requested_quantity"] for item in items),
                "status": status,
                "requestStatus": row["request_status"].lower(),
                "submitted": row["submitted_at"],
                "borrow": row["requested_borrowing_datetime"],
                "returnBy": row["return_deadline"] or row["requested_return_datetime"],
                "releaseDate": row["release_datetime"],
                "actualReturn": row["actual_return_datetime"],
                "transactionId": row["transaction_id"],
                "returnRequestedAt": row["return_requested_at"],
                "extensionId": row["extension_id"],
                "extensionReason": row["extension_reason"],
                "extensionDate": row["requested_new_due_date"],
                "extensionStatus": row["extension_status"].lower() if row["extension_status"] else None,
                "isNew": bool(row["is_new"]),
                "reviewNotes": row["review_notes"],
            }
        )
    db().commit()
    return result


def require_existing_equipment(equipment_id):
    row = db().execute(
        "SELECT e.*, c.category_name FROM equipment e JOIN equipment_categories c USING (category_id) WHERE equipment_id = ?",
        (equipment_id,),
    ).fetchone()
    if not row:
        raise ValueError("Equipment was not found.")
    return row


def validate_quantity(value, label="Quantity"):
    if isinstance(value, bool):
        raise ValueError(label + " must be a positive whole number.")
    try:
        quantity = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(label + " must be a positive whole number.") from exc
    if quantity < 1:
        raise ValueError(label + " must be a positive whole number.")
    return quantity


@app.before_request
def guard_pages():
    first_segment = request.path.strip("/").split("/")[0]
    required_role = {"admin_dashboard": "laboratory_staff", "admin_welcome": "laboratory_staff",
                     "user_dashboard": "user", "user_welcome": "user"}.get(first_segment)
    if required_role and session.get("role") != required_role:
        return redirect("/index.html")


@app.route("/")
def home():
    return send_from_directory(BASE, "index.html")


@app.post("/api/login")
def login():
    data = json_body()
    account_id = str(data.get("id", "")).strip().upper()
    password = str(data.get("password", ""))
    if not account_id or not password:
        return api_error("Please enter your User ID and password.")
    row = db().execute(
        """SELECT a.account_id, a.full_name, a.department, a.university_email, a.password_hash, a.role_id
           FROM accounts a WHERE a.account_id = ? AND a.account_status = 'Active'""",
        (account_id,),
    ).fetchone()
    if not row or not check_password_hash(row["password_hash"], password):
        return api_error("Invalid User ID or password.", 401)
    session.clear()
    session["account_id"] = row["account_id"]
    session["role"] = row["role_id"]
    session.permanent = bool(data.get("remember"))
    account = LaboratoryStaff(row["account_id"], row["full_name"], row["role_id"]) if row["role_id"] == "laboratory_staff" else User(row["account_id"], row["full_name"], row["role_id"])
    return jsonify(
        ok=True,
        id=row["account_id"],
        role="admin" if row["role_id"] == "laboratory_staff" else "user",
        name=row["full_name"],
        department=row["department"],
        email=row["university_email"],
        redirect=account.display_dashboard(),
    )


@app.get("/api/me")
@require_role("user", "laboratory_staff")
def me():
    account = account_from_session()
    if not account:
        return api_error("Your account is unavailable. Please sign in again.", 401)
    row = db().execute(
        "SELECT university_email, department FROM accounts WHERE account_id = ?",
        (account.id,),
    ).fetchone()
    return jsonify(ok=True, id=account.id, name=account.name, role=account.role,
                   email=row["university_email"], department=row["department"])


@app.put("/api/me")
@require_role("user", "laboratory_staff")
def update_me():
    data = json_body()
    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    department = str(data.get("department", "")).strip()
    if not name or len(name) > 120 or len(email) > 160 or len(department) > 120:
        return api_error("Enter a valid name, email address, and department.")
    if email and ("@" not in email or "." not in email.rsplit("@", 1)[-1]):
        return api_error("Enter a valid university email address.")
    try:
        db().execute(
            "UPDATE accounts SET full_name = ?, university_email = ?, department = ? WHERE account_id = ?",
            (name, email, department, session["account_id"]),
        )
        db().commit()
    except sqlite3.IntegrityError:
        db().rollback()
        return api_error("That email address is already associated with another account.")
    return me()


@app.get("/logout")
def logout():
    session.clear()
    return redirect("/index.html")


@app.get("/api/equipment")
@require_role("user", "laboratory_staff")
def list_equipment():
    return jsonify(items=equipment_rows(include_inactive=session.get("role") == "laboratory_staff"))


def save_uploaded_image():
    upload = request.files.get("image")
    if not upload or not upload.filename:
        return None
    name = secure_filename(upload.filename)
    extension = Path(name).suffix.lower()
    allowed = {".png": b"\x89PNG\r\n\x1a\n", ".jpg": b"\xff\xd8\xff", ".jpeg": b"\xff\xd8\xff",
               ".gif": b"GIF8", ".webp": b"RIFF"}
    signature = allowed.get(extension)
    if not signature:
        raise ValueError("Choose a PNG, JPEG, GIF, or WebP image.")
    content = upload.read(5 * 1024 * 1024 + 1)
    if len(content) > 5 * 1024 * 1024:
        raise ValueError("Image files must be 5 MB or smaller.")
    if not content.startswith(signature) or (extension == ".webp" and content[8:12] != b"WEBP"):
        raise ValueError("The uploaded file is not a valid image of the selected type.")
    filename = uuid.uuid4().hex + extension
    (UPLOADS / filename).write_bytes(content)
    return "/uploads/" + filename


@app.post("/api/equipment")
@require_role("laboratory_staff")
def create_equipment():
    data = request.form if request.form else json_body()
    try:
        name = str(data.get("name", "")).strip()
        category = str(data.get("category", "")).strip()
        quantity = int(data.get("totalQuantity", data.get("stock", 0)))
        borrow_status = str(data.get("borrowStatus", "Available")).strip()
        if borrow_status not in ("Available", "Unavailable"):
            raise ValueError("Borrow status must be Available or Unavailable.")
        if not name or not category or quantity < 0:
            raise ValueError("Enter an equipment name, category, and a non-negative quantity.")
        image = save_uploaded_image()
        connection = db()
        connection.execute("INSERT OR IGNORE INTO equipment_categories (category_name) VALUES (?)", (category,))
        category_id = connection.execute(
            "SELECT category_id FROM equipment_categories WHERE category_name = ?", (category,)
        ).fetchone()["category_id"]
        equipment_id = new_id("EQ")
        connection.execute(
            """INSERT INTO equipment
               (equipment_id, category_id, equipment_name, description, location, unit,
                total_quantity, available_quantity, borrow_status, image_path)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (equipment_id, category_id, name, str(data.get("detail", data.get("description", ""))).strip(),
             str(data.get("location", "")).strip(), str(data.get("unit", "units")).strip() or "units",
             quantity, quantity, borrow_status, image),
        )
        connection.commit()
        return jsonify(ok=True, item=next(item for item in equipment_rows(True) if item["id"] == equipment_id)), 201
    except (ValueError, sqlite3.IntegrityError) as exc:
        db().rollback()
        return api_error(str(exc))


@app.patch("/api/equipment/<equipment_id>")
@require_role("laboratory_staff")
def update_equipment(equipment_id):
    data = request.form if request.form else json_body()
    connection = db()
    try:
        existing = require_existing_equipment(equipment_id)
        name = str(data.get("name", existing["equipment_name"])).strip()
        category = str(data.get("category", existing["category_name"])).strip()
        detail = str(data.get("detail", data.get("description", existing["description"]))).strip()
        location = str(data.get("location", existing["location"])).strip()
        unit = str(data.get("unit", existing["unit"])).strip() or "units"
        total = int(data.get("totalQuantity", data.get("stock", existing["total_quantity"])))
        active = str(data.get("active", "true" if existing["equipment_status"] == "Active" else "false")).lower() not in ("false", "0", "inactive")
        borrow_status = str(data.get("borrowStatus", existing["borrow_status"])).strip()
        if borrow_status not in ("Available", "Unavailable"):
            raise ValueError("Borrow status must be Available or Unavailable.")
        borrowed = existing["total_quantity"] - existing["available_quantity"]
        if not name or not category or total < borrowed:
            raise ValueError("Total quantity cannot be lower than units currently borrowed or unavailable.")
        image = save_uploaded_image() or existing["image_path"]
        connection.execute("INSERT OR IGNORE INTO equipment_categories (category_name) VALUES (?)", (category,))
        category_id = connection.execute("SELECT category_id FROM equipment_categories WHERE category_name = ?", (category,)).fetchone()["category_id"]
        available = max(0, existing["available_quantity"] + total - existing["total_quantity"])
        connection.execute(
            """UPDATE equipment SET category_id = ?, equipment_name = ?, description = ?, location = ?,
               unit = ?, total_quantity = ?, available_quantity = ?, borrow_status = ?, equipment_status = ?, image_path = ?,
               last_updated = ? WHERE equipment_id = ?""",
            (category_id, name, detail, location, unit, total, available, borrow_status,
             "Active" if active else "Inactive", image, iso_now(), equipment_id),
        )
        connection.commit()
        return jsonify(ok=True, item=next(item for item in equipment_rows(True) if item["id"] == equipment_id))
    except (ValueError, sqlite3.IntegrityError) as exc:
        connection.rollback()
        return api_error(str(exc))


@app.delete("/api/equipment/<equipment_id>")
@require_role("laboratory_staff")
def deactivate_equipment(equipment_id):
    connection = db()
    if not connection.execute("SELECT 1 FROM equipment WHERE equipment_id = ?", (equipment_id,)).fetchone():
        return api_error("Equipment was not found.", 404)
    connection.execute("UPDATE equipment SET equipment_status = 'Inactive', last_updated = ? WHERE equipment_id = ?", (iso_now(), equipment_id))
    connection.commit()
    return jsonify(ok=True)


@app.get("/api/requests")
@require_role("user", "laboratory_staff")
def list_requests():
    account_id = None if session["role"] == "laboratory_staff" else session["account_id"]
    return jsonify(items=request_rows(account_id))


@app.post("/api/requests")
@require_role("user")
def create_request():
    data = json_body()
    try:
        purpose = str(data.get("purpose", "")).strip()
        borrowed = valid_date(data.get("borrow"), "Borrow date")
        due = valid_date(data.get("returnBy"), "Return date")
        if not purpose or due < borrowed:
            raise ValueError("Enter a purpose and a return date on or after the borrowing date.")
        items = data.get("items")
        if not isinstance(items, list) or not items:
            raise ValueError("Add at least one equipment item to your request.")
        connection = db()
        request_id = new_id("REQ")
        with connection:
            for item in items:
                equipment_id = str(item.get("id", ""))
                quantity = validate_quantity(item.get("qty"))
                equipment = require_existing_equipment(equipment_id)
                if (equipment["equipment_status"] != "Active" or equipment["borrow_status"] != "Available"
                        or equipment["available_quantity"] < quantity):
                    raise ValueError(f"Not enough available stock for {equipment['equipment_name']}.")
            connection.execute(
                """INSERT INTO borrowing_requests
                   (request_id, account_id, purpose, notes, requested_borrowing_datetime, requested_return_datetime)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (request_id, session["account_id"], purpose, str(data.get("notes", "")).strip(), borrowed, due),
            )
            for item in items:
                connection.execute(
                    "INSERT INTO borrowing_request_items (request_id, equipment_id, requested_quantity) VALUES (?, ?, ?)",
                    (request_id, str(item["id"]), validate_quantity(item.get("qty"))),
                )
        return jsonify(ok=True, request=next(row for row in request_rows(session["account_id"]) if row["id"] == request_id)), 201
    except (ValueError, sqlite3.IntegrityError) as exc:
        db().rollback()
        return api_error(str(exc))


@app.patch("/api/requests/<request_id>")
@require_role("laboratory_staff", "user")
def update_request(request_id):
    data = json_body()
    connection = db()
    row = connection.execute("SELECT * FROM borrowing_requests WHERE request_id = ?", (request_id,)).fetchone()
    if not row or (session["role"] == "user" and row["account_id"] != session["account_id"]):
        return api_error("Request was not found.", 404)
    action = str(data.get("status", "")).lower()
    try:
        if session["role"] == "laboratory_staff":
            if row["request_status"] != "Pending" or action not in ("approved", "rejected"):
                raise ValueError("Only pending requests can be approved or rejected.")
            if action == "approved":
                for item in connection.execute(
                    "SELECT e.equipment_name, e.available_quantity, e.borrow_status, ri.requested_quantity FROM borrowing_request_items ri JOIN equipment e USING (equipment_id) WHERE ri.request_id = ?",
                    (request_id,),
                ).fetchall():
                    if item["borrow_status"] != "Available" or item["available_quantity"] < item["requested_quantity"]:
                        raise ValueError(f"Not enough available stock for {item['equipment_name']}.")
            connection.execute(
                """UPDATE borrowing_requests SET request_status = ?, reviewed_by = ?, reviewed_at = ?,
                   review_notes = ?, is_new = 0 WHERE request_id = ?""",
                (action.capitalize(), session["account_id"], iso_now(), str(data.get("reviewNotes", "")).strip(), request_id),
            )
        else:
            if row["request_status"] != "Pending" or action != "cancelled":
                raise ValueError("Only pending requests can be cancelled.")
            connection.execute("UPDATE borrowing_requests SET request_status = 'Cancelled' WHERE request_id = ?", (request_id,))
        connection.commit()
        return jsonify(ok=True, request=next(row for row in request_rows(None if session["role"] == "laboratory_staff" else session["account_id"]) if row["id"] == request_id))
    except (ValueError, sqlite3.IntegrityError) as exc:
        connection.rollback()
        return api_error(str(exc))


@app.post("/api/requests/<request_id>/release")
@require_role("laboratory_staff")
def release_request(request_id):
    connection = db()
    try:
        with connection:
            req = connection.execute("SELECT * FROM borrowing_requests WHERE request_id = ?", (request_id,)).fetchone()
            if not req or req["request_status"] != "Approved":
                raise ValueError("Only an approved request can be released.")
            items = connection.execute("SELECT * FROM borrowing_request_items WHERE request_id = ?", (request_id,)).fetchall()
            if not items:
                raise ValueError("This request has no equipment items.")
            for item in items:
                equipment = require_existing_equipment(item["equipment_id"])
                if (equipment["equipment_status"] != "Active" or equipment["borrow_status"] != "Available"
                        or equipment["available_quantity"] < item["requested_quantity"]):
                    raise ValueError(f"Not enough available stock for {equipment['equipment_name']}.")
            transaction_id = new_id("TXN")
            now = iso_now()
            connection.execute(
                """INSERT INTO borrowing_transactions
                   (transaction_id, request_id, released_by, release_datetime, return_deadline)
                   VALUES (?, ?, ?, ?, ?)""",
                (transaction_id, request_id, session["account_id"], now, req["requested_return_datetime"]),
            )
            for item in items:
                connection.execute(
                    "UPDATE equipment SET available_quantity = available_quantity - ?, last_updated = ? WHERE equipment_id = ?",
                    (item["requested_quantity"], now, item["equipment_id"]),
                )
                connection.execute(
                    "INSERT INTO transaction_items (transaction_id, equipment_id, quantity_borrowed) VALUES (?, ?, ?)",
                    (transaction_id, item["equipment_id"], item["requested_quantity"]),
                )
        return jsonify(ok=True, transactionId=transaction_id), 201
    except (ValueError, sqlite3.IntegrityError) as exc:
        connection.rollback()
        return api_error(str(exc))


@app.get("/api/transactions")
@require_role("laboratory_staff", "user")
def list_transactions():
    rows = request_rows(None if session["role"] == "laboratory_staff" else session["account_id"])
    return jsonify(items=[row for row in rows if row["transactionId"]])


@app.post("/api/transactions/<transaction_id>/return-request")
@require_role("user")
def request_return(transaction_id):
    connection = db()
    row = connection.execute(
        """SELECT bt.*, br.account_id FROM borrowing_transactions bt
           JOIN borrowing_requests br USING (request_id) WHERE bt.transaction_id = ?""",
        (transaction_id,),
    ).fetchone()
    if not row or row["account_id"] != session["account_id"]:
        return api_error("Borrowing transaction was not found.", 404)
    if row["transaction_status"] not in ("Active", "Partially Returned", "Overdue") or row["return_requested_at"]:
        return api_error("This transaction is not awaiting a return request.")
    connection.execute("UPDATE borrowing_transactions SET return_requested_at = ? WHERE transaction_id = ?", (iso_now(), transaction_id))
    connection.commit()
    return jsonify(ok=True)


@app.post("/api/transactions/<transaction_id>/extensions")
@require_role("user")
def request_extension(transaction_id):
    data = json_body()
    reason = str(data.get("reason", "")).strip()
    try:
        proposed = valid_date(data.get("newDueDate"), "Proposed return date")
        connection = db()
        row = connection.execute(
            """SELECT bt.*, br.account_id FROM borrowing_transactions bt
               JOIN borrowing_requests br USING (request_id) WHERE bt.transaction_id = ?""",
            (transaction_id,),
        ).fetchone()
        if not row or row["account_id"] != session["account_id"]:
            return api_error("Borrowing transaction was not found.", 404)
        if row["transaction_status"] not in ("Active", "Partially Returned", "Overdue") or not reason:
            raise ValueError("An active transaction and extension reason are required.")
        if proposed <= row["return_deadline"]:
            raise ValueError("Choose a date later than the current return deadline.")
        existing = connection.execute(
            "SELECT 1 FROM extension_requests WHERE transaction_id = ?",
            (transaction_id,),
        ).fetchone()
        if existing:
            raise ValueError("Only one extension request is allowed per transaction.")
        connection.execute(
            """INSERT INTO extension_requests
               (extension_id, transaction_id, account_id, reason, requested_new_due_date)
               VALUES (?, ?, ?, ?, ?)""",
            (new_id("EXT"), transaction_id, session["account_id"], reason, proposed),
        )
        connection.commit()
        return jsonify(ok=True), 201
    except (ValueError, sqlite3.IntegrityError) as exc:
        db().rollback()
        return api_error(str(exc))


@app.patch("/api/extensions/<extension_id>")
@require_role("laboratory_staff")
def review_extension(extension_id):
    data = json_body()
    action = str(data.get("status", "")).lower()
    connection = db()
    row = connection.execute("SELECT * FROM extension_requests WHERE extension_id = ?", (extension_id,)).fetchone()
    if not row or row["extension_status"] != "Pending" or action not in ("approved", "rejected"):
        return api_error("This extension request is no longer pending.", 404)
    with connection:
        connection.execute(
            """UPDATE extension_requests SET extension_status = ?, reviewed_by = ?, reviewed_at = ?
               WHERE extension_id = ?""",
            (action.capitalize(), session["account_id"], iso_now(), extension_id),
        )
        if action == "approved":
            connection.execute(
                "UPDATE borrowing_transactions SET return_deadline = ?, transaction_status = 'Active' WHERE transaction_id = ?",
                (row["requested_new_due_date"], row["transaction_id"]),
            )
    return jsonify(ok=True)


@app.post("/api/transactions/<transaction_id>/returns")
@require_role("laboratory_staff")
def confirm_return(transaction_id):
    data = json_body()
    records = data.get("items")
    if not isinstance(records, list) or not records:
        return api_error("Record at least one returned item.")
    connection = db()
    transaction = connection.execute("SELECT * FROM borrowing_transactions WHERE transaction_id = ?", (transaction_id,)).fetchone()
    if not transaction or transaction["transaction_status"] in ("Returned", "Lost"):
        return api_error("This transaction cannot accept another return.")
    if not transaction["return_requested_at"]:
        return api_error("The user must submit this equipment for return before staff can confirm it.")
    try:
        now = iso_now()
        with connection:
            for item in records:
                item_id = int(item.get("transactionItemId"))
                quantity = validate_quantity(item.get("quantity"))
                condition = str(item.get("condition", "Good")).strip()
                if condition not in ("Good", "Needs Repair", "Damaged", "Improper Return"):
                    raise ValueError("Select a valid return condition.")
                row = connection.execute(
                    """SELECT ti.*, e.equipment_id FROM transaction_items ti
                       JOIN equipment e USING (equipment_id)
                       WHERE ti.transaction_item_id = ? AND ti.transaction_id = ?""",
                    (item_id, transaction_id),
                ).fetchone()
                if not row or quantity > row["quantity_borrowed"] - row["quantity_returned"] - row["quantity_lost"]:
                    raise ValueError("Returned quantity exceeds the outstanding quantity.")
                connection.execute(
                    "UPDATE transaction_items SET quantity_returned = quantity_returned + ? WHERE transaction_item_id = ?",
                    (quantity, item_id),
                )
                if condition == "Good":
                    connection.execute(
                        "UPDATE equipment SET available_quantity = available_quantity + ?, last_updated = ? WHERE equipment_id = ?",
                        (quantity, now, row["equipment_id"]),
                    )
                else:
                    equipment_condition = "Needs Repair" if condition in ("Damaged", "Improper Return") else "Good"
                    connection.execute(
                        "UPDATE equipment SET condition_status = ?, last_updated = ? WHERE equipment_id = ?",
                        (equipment_condition, now, row["equipment_id"]),
                    )
                    case_type = "Improper Return" if condition == "Improper Return" else "Damaged"
                    connection.execute(
                        """INSERT INTO other_cases
                           (case_id, transaction_item_id, recorded_by, case_type, quantity, description)
                           VALUES (?, ?, ?, ?, ?, ?)""",
                        (new_id("CASE"), item_id, session["account_id"], case_type, quantity,
                         str(item.get("notes", "")).strip() or condition + " condition recorded during return inspection."),
                    )
                connection.execute(
                    """INSERT INTO return_records
                       (return_id, transaction_item_id, inspected_by, quantity_returned,
                        actual_return_datetime, condition_status, inspection_notes)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (new_id("RET"), item_id, session["account_id"], quantity, now, condition, str(item.get("notes", "")).strip()),
                )
            quantities = connection.execute(
                "SELECT quantity_borrowed, quantity_returned, quantity_lost FROM transaction_items WHERE transaction_id = ?",
                (transaction_id,),
            ).fetchall()
            outstanding = sum(item["quantity_borrowed"] - item["quantity_returned"] - item["quantity_lost"] for item in quantities)
            returned = sum(item["quantity_returned"] for item in quantities)
            status = "Returned" if outstanding == 0 else ("Partially Returned" if returned else transaction["transaction_status"])
            actual_return = now if status == "Returned" else None
            connection.execute(
                """UPDATE borrowing_transactions SET transaction_status = ?,
                   actual_return_datetime = COALESCE(?, actual_return_datetime), return_requested_at = NULL
                   WHERE transaction_id = ?""",
                (status, actual_return, transaction_id),
            )
        return jsonify(ok=True, status=status)
    except (ValueError, TypeError, sqlite3.IntegrityError) as exc:
        connection.rollback()
        return api_error(str(exc))


@app.post("/api/transactions/<transaction_id>/cases")
@require_role("laboratory_staff")
def record_case(transaction_id):
    data = json_body()
    case_type = str(data.get("caseType", "")).strip()
    description = str(data.get("description", "")).strip()
    try:
        if case_type not in OtherCases.CASE_TYPES or not description:
            raise ValueError("Choose a case type and provide a description.")
        quantity = validate_quantity(data.get("quantity", 1))
        item_id = int(data.get("transactionItemId"))
        connection = db()
        with connection:
            item = connection.execute(
                """SELECT ti.*, e.equipment_id FROM transaction_items ti JOIN equipment e USING (equipment_id)
                   WHERE ti.transaction_item_id = ? AND ti.transaction_id = ?""",
                (item_id, transaction_id),
            ).fetchone()
            if not item:
                raise ValueError("Transaction item was not found.")
            outstanding = item["quantity_borrowed"] - item["quantity_returned"] - item["quantity_lost"]
            if quantity > outstanding:
                raise ValueError("Case quantity exceeds the outstanding borrowed quantity.")
            connection.execute(
                """INSERT INTO other_cases
                   (case_id, transaction_item_id, recorded_by, case_type, quantity, description)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (new_id("CASE"), item_id, session["account_id"], case_type, quantity, description),
            )
            if case_type == "Lost":
                connection.execute("UPDATE transaction_items SET quantity_lost = quantity_lost + ? WHERE transaction_item_id = ?", (quantity, item_id))
                connection.execute("UPDATE equipment SET total_quantity = total_quantity - ?, last_updated = ? WHERE equipment_id = ?", (quantity, iso_now(), item["equipment_id"]))
            elif case_type in ("Damaged", "Improper Return"):
                connection.execute("UPDATE equipment SET condition_status = 'Needs Repair', last_updated = ? WHERE equipment_id = ?", (iso_now(), item["equipment_id"]))
            rest = connection.execute(
                "SELECT SUM(quantity_borrowed - quantity_returned - quantity_lost) AS outstanding FROM transaction_items WHERE transaction_id = ?",
                (transaction_id,),
            ).fetchone()["outstanding"]
            if rest == 0:
                connection.execute("UPDATE borrowing_transactions SET transaction_status = 'Lost', actual_return_datetime = ? WHERE transaction_id = ?", (iso_now(), transaction_id))
        return jsonify(ok=True)
    except (ValueError, TypeError, sqlite3.IntegrityError) as exc:
        db().rollback()
        return api_error(str(exc))


@app.get("/api/dashboard")
@require_role("laboratory_staff")
def dashboard_data():
    equipment = equipment_rows(True)
    requests = request_rows()
    transactions = [item for item in requests if item["transactionId"]]
    now = datetime.now().astimezone()
    return jsonify(
        stats={
            "equipment": len([item for item in equipment if item["active"]]),
            "available": sum(1 for item in equipment if item["active"] and item["stock"] > 0),
            "unavailable": sum(1 for item in equipment if not item["active"] or item["stock"] == 0),
            "pending": sum(1 for item in requests if item["requestStatus"] == "pending"),
            "borrowed": sum(item["outstanding"] for row in transactions for item in row["items"]),
            "overdue": sum(1 for row in transactions if row["status"] == "overdue"),
        },
        pendingRequests=[row for row in requests if row["requestStatus"] == "pending"][:5],
        upcomingReturns=[row for row in transactions if row["status"] in ("active", "overdue", "partially_returned") and row["returnBy"]][:8],
        recentActivity=connection_rows("activity"),
        serverTime=now.isoformat(timespec="minutes"),
    )


def connection_rows(kind):
    if kind == "activity":
        rows = db().execute(
            """SELECT bt.transaction_id AS id, a.full_name, e.equipment_name, bt.transaction_status,
                      bt.release_datetime AS event_date
               FROM borrowing_transactions bt
               JOIN borrowing_requests br USING (request_id)
               JOIN accounts a USING (account_id)
               JOIN transaction_items ti USING (transaction_id)
               JOIN equipment e USING (equipment_id)
               UNION ALL
               SELECT br.request_id, a.full_name, '', br.request_status, br.submitted_at
               FROM borrowing_requests br JOIN accounts a USING (account_id)
               ORDER BY event_date DESC LIMIT 8"""
        ).fetchall()
        return [{"id": row["id"], "name": row["full_name"], "equipment": row["equipment_name"],
                 "status": row["transaction_status"], "date": row["event_date"]} for row in rows]
    return []


@app.get("/api/notifications")
@require_role("laboratory_staff")
def notifications():
    rows = db().execute(
        """SELECT br.request_id, br.submitted_at, a.full_name
           FROM borrowing_requests br JOIN accounts a USING (account_id)
           WHERE br.is_new = 1 AND br.request_status = 'Pending'
           ORDER BY br.submitted_at DESC"""
    ).fetchall()
    return jsonify(count=len(rows), items=[{"id": row["request_id"], "name": row["full_name"], "date": row["submitted_at"]} for row in rows])


@app.post("/api/notifications/acknowledge")
@require_role("laboratory_staff")
def acknowledge_notifications():
    data = json_body()
    ids = data.get("ids")
    if isinstance(ids, list) and ids:
        db().executemany("UPDATE borrowing_requests SET is_new = 0 WHERE request_id = ?", ((str(value),) for value in ids))
    else:
        db().execute("UPDATE borrowing_requests SET is_new = 0 WHERE request_status = 'Pending'")
    db().commit()
    return jsonify(ok=True)


@app.get("/api/history")
@require_role("laboratory_staff")
def history():
    records = []
    for row in request_rows():
        if not row["transactionId"]:
            continue
        details = db().execute(
            """SELECT e.equipment_name, ti.quantity_borrowed, ti.quantity_returned, ti.quantity_lost
               FROM transaction_items ti JOIN equipment e USING (equipment_id)
               WHERE ti.transaction_id = ? ORDER BY e.equipment_name""",
            (row["transactionId"],),
        ).fetchall()
        if row["status"] not in ("returned", "lost", "damaged") and not any(item["quantity_returned"] or item["quantity_lost"] for item in details):
            continue
        records.append({
            "transactionId": row["transactionId"], "userId": row["accountId"], "userName": row["studentName"],
            "borrow": row["releaseDate"], "due": row["returnBy"], "actualReturn": row["actualReturn"],
            "status": row["status"], "items": [
                {"name": item["equipment_name"], "borrowed": item["quantity_borrowed"],
                 "returned": item["quantity_returned"], "lost": item["quantity_lost"]} for item in details],
        })
    return jsonify(items=records)


@app.get("/api/users")
@require_role("laboratory_staff")
def users():
    rows = db().execute(
        """SELECT a.account_id, a.full_name, a.university_email, a.department, r.role_name
           FROM accounts a JOIN roles r USING (role_id) ORDER BY a.full_name"""
    ).fetchall()
    return jsonify(items=[{"id": row["account_id"], "name": row["full_name"], "email": row["university_email"],
                          "department": row["department"], "role": row["role_name"]} for row in rows])


@app.get("/api/reports")
@require_role("laboratory_staff")
def reports():
    equipment = equipment_rows(True)
    transactions = [item for item in request_rows() if item["transactionId"]]
    cases = db().execute(
        """SELECT oc.*, e.equipment_name, br.request_id, a.full_name, a.account_id
           FROM other_cases oc JOIN transaction_items ti USING (transaction_item_id)
           JOIN equipment e USING (equipment_id)
           JOIN borrowing_transactions bt USING (transaction_id)
           JOIN borrowing_requests br USING (request_id)
           JOIN accounts a USING (account_id)
           ORDER BY oc.date_recorded DESC"""
    ).fetchall()
    return jsonify(
        equipment=equipment,
        transactions=transactions,
        cases=[{"id": row["case_id"], "transactionId": row["request_id"], "userId": row["account_id"],
                "userName": row["full_name"], "equipment": row["equipment_name"], "type": row["case_type"],
                "quantity": row["quantity"], "description": row["description"], "date": row["date_recorded"],
                "resolution": row["resolution_status"]} for row in cases],
        summary={
            "equipment": len(equipment),
            "available": sum(item["stock"] for item in equipment),
            "borrowed": sum(item["outstanding"] for row in transactions for item in row["items"]),
            "returnedTransactions": sum(1 for row in transactions if row["status"] == "returned"),
            "overdue": sum(1 for row in transactions if row["status"] == "overdue"),
            "cases": len(cases),
        },
    )


@app.get("/api/settings")
@require_role("laboratory_staff")
def get_settings():
    return jsonify(settings={row["setting_key"]: row["setting_value"] for row in db().execute("SELECT setting_key, setting_value FROM system_settings")})


@app.put("/api/settings")
@require_role("laboratory_staff")
def save_settings():
    data = json_body()
    allowed = {"office", "phone", "email", "hours", "rules", "extension"}
    values = [(key, str(value).strip()) for key, value in data.items() if key in allowed]
    if not values:
        return api_error("No supported settings were supplied.")
    db().executemany(
        "INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value",
        values,
    )
    db().commit()
    return get_settings()


@app.get("/api/reports/export")
@require_role("laboratory_staff")
def export_report():
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Transaction ID", "User ID", "User name", "Equipment", "Borrowed", "Returned", "Due", "Actual return", "Status"])
    for row in [item for item in request_rows() if item["transactionId"]]:
        for item in row["items"]:
            writer.writerow([row["transactionId"], row["accountId"], row["studentName"], item["name"],
                             item["quantityBorrowed"], item["quantityReturned"], row["returnBy"], row["actualReturn"], row["status"]])
    return app.response_class(output.getvalue(), mimetype="text/csv",
                              headers={"Content-Disposition": "attachment; filename=lablink-report.csv"})


if __name__ == "__main__":
    app.run(debug=os.environ.get("FLASK_DEBUG") == "1")
