"""Flask application for University LabLink."""

import csv
import io
import logging
import os
import secrets
import uuid
from datetime import datetime, timedelta
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, redirect, request, send_from_directory, session
import mysql.connector
from werkzeug.utils import secure_filename

from config import SECRET_KEY
from univ_lablink.classes import (
    Account,
    BorrowingRequest,
    BorrowingTransaction,
    Equipment,
    LaboratoryStaff,
    OtherCases,
    User,
)
from univ_lablink.database import connect

logging.basicConfig(level=logging.INFO)

BASE = Path(__file__).parent / "univ_lablink"
UPLOADS = BASE / "uploads"
UPLOADS.mkdir(exist_ok=True)

app = Flask(__name__, static_folder=str(BASE), static_url_path="")
app.config.update(
    SECRET_KEY=SECRET_KEY or secrets.token_hex(32),
    MAX_CONTENT_LENGTH=5 * 1024 * 1024,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    PERMANENT_SESSION_LIFETIME=timedelta(days=30),
)


def db():
    if "database" not in g:
        g.database = connect()
    return g.database


@app.teardown_appcontext
def close_db(_error=None):
    connection = g.pop("database", None)
    if connection is not None:
        connection.close()


def api_error(message, status=400):
    return jsonify(ok=False, message=message), status


@app.errorhandler(mysql.connector.Error)
def handle_database_error(error):
    logging.exception("MySQL operation failed")
    return api_error("The database operation could not be completed. Check the Flask server log.", 500)


def require_role(*roles):
    def decorator(handler):
        @wraps(handler)
        def guarded(*args, **kwargs):
            if not session.get("account_id"):
                return api_error("Please sign in to continue.", 401)
            account = account_from_session()
            if not account:
                return api_error("Your account is unavailable. Please sign in again.", 401)
            session["role"] = account.role
            if roles and account.role not in roles:
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
    if row["role_id"] not in ("user", "laboratory_staff"):
        session.clear()
        return None
    role = "laboratory_staff" if row["role_id"] == "laboratory_staff" else "user"
    cls = LaboratoryStaff if role == "laboratory_staff" else User
    return cls(row["account_id"], row["full_name"], role)


def iso_now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def valid_date(value, label):
    if not isinstance(value, str) or not value:
        raise ValueError(label + " is required.")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(label + " must be a valid date and time.") from exc
    return parsed.strftime("%Y-%m-%d %H:%M:%S") if "T" in value or " " in value else parsed.date().isoformat()


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
            "categoryId": row["category_id"],
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
    BorrowingTransaction.check_overdue(db())
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
    if required_role:
        account = account_from_session() if session.get("account_id") else None
        if not account or account.role != required_role:
            return redirect("/index.html")


@app.route("/")
def home():
    return send_from_directory(BASE, "index.html")


@app.post("/api/login")
@app.post("/api/auth/login")
def login():
    session.clear()
    data = json_body()
    account_id = str(data.get("id", "")).strip().upper()
    password = str(data.get("password", ""))
    if not account_id or not password:
        return api_error("Please enter your User ID and password.")
    account = Account.authenticate(db(), account_id, password)
    if not account:
        return api_error("Invalid User ID or password.", 401)
    session.clear()
    session["account_id"] = account.id
    session["role"] = account.role
    session.permanent = bool(data.get("remember"))
    return jsonify(
        ok=True,
        id=account.id,
        role="admin" if account.role == "laboratory_staff" else "user",
        name=account.name,
        department=account.department,
        email=account.email,
        redirect=account.display_dashboard(),
    )


@app.get("/api/me")
@app.get("/api/auth/me")
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
    if not email:
        return api_error("Enter a valid university email address.")
    try:
        db().execute(
            "UPDATE accounts SET full_name = ?, university_email = ?, department = ? WHERE account_id = ?",
            (name, email, department, session["account_id"]),
        )
        db().commit()
    except mysql.connector.IntegrityError:
        db().rollback()
        return api_error("That email address is already associated with another account.")
    return me()


@app.get("/logout")
def logout():
    session.clear()
    return redirect("/index.html")


@app.post("/api/auth/logout")
def api_logout():
    session.clear()
    return jsonify(ok=True)


@app.get("/api/equipment")
@require_role("user", "laboratory_staff")
def list_equipment():
    items = equipment_rows(include_inactive=session.get("role") == "laboratory_staff")
    search = request.args.get("search", "").strip().casefold()
    category = request.args.get("category", "").strip().casefold()
    if search:
        items = [item for item in items if search in item["name"].casefold()]
    if category:
        items = [
            item for item in items
            if category == item["category"].casefold() or category == str(item["categoryId"])
        ]
    return jsonify(items=items)


@app.get("/api/equipment/<equipment_id>")
@require_role("user", "laboratory_staff")
def get_equipment(equipment_id):
    item = next((row for row in equipment_rows(session.get("role") == "laboratory_staff")
                 if row["id"] == equipment_id), None)
    if not item:
        return api_error("Equipment was not found.", 404)
    return jsonify(item=item)


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
        detail = str(data.get("detail", data.get("description", ""))).strip()
        location = str(data.get("location", "")).strip()
        unit = str(data.get("unit", "units")).strip() or "units"
        if not name or len(name) > 160 or not category or len(category) > 120 or quantity < 0:
            raise ValueError("Enter an equipment name, category, and a non-negative quantity.")
        if len(location) > 160 or len(unit) > 40:
            raise ValueError("Location or unit exceeds the maximum supported length.")
        image = save_uploaded_image()
        equipment_id = new_id("EQ")
        connection = db()
        account_from_session().add_equipment(
            connection,
            equipment_id,
            category,
            name,
            detail,
            location,
            unit,
            quantity,
            borrow_status,
            image,
        )
        connection.commit()
        return jsonify(ok=True, item=next(item for item in equipment_rows(True) if item["id"] == equipment_id)), 201
    except (ValueError, mysql.connector.IntegrityError) as exc:
        db().rollback()
        return api_error(str(exc))


@app.patch("/api/equipment/<equipment_id>")
@app.put("/api/equipment/<equipment_id>")
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
        if not name or len(name) > 160 or not category or len(category) > 120 or total < borrowed:
            raise ValueError("Total quantity cannot be lower than units currently borrowed or unavailable.")
        if len(location) > 160 or len(unit) > 40:
            raise ValueError("Location or unit exceeds the maximum supported length.")
        image = save_uploaded_image() or existing["image_path"]
        available = max(0, existing["available_quantity"] + total - existing["total_quantity"])
        account_from_session().update_equipment(
            connection,
            equipment_id,
            category,
            name,
            detail,
            location,
            unit,
            total,
            available,
            borrow_status,
            "Active" if active else "Inactive",
            image,
        )
        connection.commit()
        return jsonify(ok=True, item=next(item for item in equipment_rows(True) if item["id"] == equipment_id))
    except (ValueError, mysql.connector.IntegrityError) as exc:
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


@app.get("/api/categories")
@require_role("user", "laboratory_staff")
def list_categories():
    rows = db().execute(
        "SELECT category_id, category_name, category_description FROM equipment_categories ORDER BY category_name"
    ).fetchall()
    return jsonify(items=[
        {"id": row["category_id"], "name": row["category_name"], "description": row["category_description"] or ""}
        for row in rows
    ])


@app.post("/api/categories")
@require_role("laboratory_staff")
def create_category():
    data = json_body()
    name = str(data.get("name", "")).strip()
    description = str(data.get("description", "")).strip()
    if not name or len(name) > 120:
        return api_error("Enter a category name up to 120 characters.")
    try:
        connection = db()
        connection.execute(
            "INSERT INTO equipment_categories (category_name, category_description) VALUES (?, ?)",
            (name, description),
        )
        category_id = connection.execute("SELECT LAST_INSERT_ID() AS category_id").fetchone()["category_id"]
        connection.commit()
        return jsonify(ok=True, item={"id": category_id, "name": name, "description": description}), 201
    except mysql.connector.IntegrityError:
        db().rollback()
        return api_error("A category with that name already exists.")


@app.put("/api/categories/<int:category_id>")
@app.patch("/api/categories/<int:category_id>")
@require_role("laboratory_staff")
def update_category(category_id):
    data = json_body()
    name = str(data.get("name", "")).strip()
    description = str(data.get("description", "")).strip()
    if not name or len(name) > 120:
        return api_error("Enter a category name up to 120 characters.")
    try:
        connection = db()
        if not connection.execute(
            "SELECT 1 FROM equipment_categories WHERE category_id = ?",
            (category_id,),
        ).fetchone():
            return api_error("Category was not found.", 404)
        cursor = connection.execute(
            "UPDATE equipment_categories SET category_name = ?, category_description = ? WHERE category_id = ?",
            (name, description, category_id),
        )
        connection.commit()
        return jsonify(ok=True, item={"id": category_id, "name": name, "description": description})
    except mysql.connector.IntegrityError:
        db().rollback()
        return api_error("A category with that name already exists.")


@app.delete("/api/categories/<int:category_id>")
@require_role("laboratory_staff")
def delete_category(category_id):
    connection = db()
    try:
        cursor = connection.execute("DELETE FROM equipment_categories WHERE category_id = ?", (category_id,))
        if cursor.rowcount != 1:
            return api_error("Category was not found.", 404)
        connection.commit()
        return jsonify(ok=True)
    except mysql.connector.IntegrityError:
        connection.rollback()
        return api_error("A category assigned to equipment cannot be deleted.")


@app.get("/api/requests")
@require_role("user", "laboratory_staff")
def list_requests():
    account_id = None if session["role"] == "laboratory_staff" else session["account_id"]
    return jsonify(items=request_rows(account_id))


@app.get("/api/staff/requests")
@require_role("laboratory_staff")
def staff_requests():
    return jsonify(items=request_rows())


@app.get("/api/requests/mine")
@require_role("user")
def list_my_requests():
    return jsonify(items=request_rows(session["account_id"]))


@app.get("/api/requests/<request_id>")
@require_role("user", "laboratory_staff")
def get_request(request_id):
    account_id = None if session["role"] == "laboratory_staff" else session["account_id"]
    row = next((item for item in request_rows(account_id) if item["id"] == request_id), None)
    if not row:
        return api_error("Request was not found.", 404)
    return jsonify(request=row)


@app.post("/api/requests")
@require_role("user")
def create_request():
    data = json_body()
    try:
        purpose = str(data.get("purpose", "")).strip()
        notes = str(data.get("notes", "")).strip()
        borrowed = valid_date(data.get("borrow"), "Borrow date")
        due = valid_date(data.get("returnBy"), "Return date")
        if not purpose or len(purpose) > 500 or len(notes) > 2000:
            raise ValueError("Enter a purpose up to 500 characters and notes up to 2,000 characters.")
        if datetime.fromisoformat(due) < datetime.fromisoformat(borrowed):
            raise ValueError("Enter a purpose and a return date on or after the borrowing date.")
        items = data.get("items")
        connection = db()
        request_id = User(session["account_id"], "", "user").submit_borrowing_request(
            connection, purpose, notes, borrowed, due, items
        )
        return jsonify(ok=True, request=next(row for row in request_rows(session["account_id"]) if row["id"] == request_id)), 201
    except (ValueError, mysql.connector.IntegrityError) as exc:
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
            staff = account_from_session()
            if action == "approved":
                staff.approve_request(connection, request_id, str(data.get("reviewNotes", "")).strip())
            elif action == "rejected":
                staff.reject_request(connection, request_id, str(data.get("reviewNotes", "")).strip())
            else:
                raise ValueError("Only pending requests can be approved or rejected.")
        else:
            if row["request_status"] != "Pending" or action != "cancelled":
                raise ValueError("Only pending requests can be cancelled.")
            if not User(row["account_id"], "", "user").cancel_request(connection, request_id):
                raise ValueError("Only your pending requests can be cancelled.")
        connection.commit()
        return jsonify(ok=True, request=next(row for row in request_rows(None if session["role"] == "laboratory_staff" else session["account_id"]) if row["id"] == request_id))
    except (ValueError, mysql.connector.IntegrityError) as exc:
        connection.rollback()
        return api_error(str(exc))


@app.post("/api/staff/requests/<request_id>/approve")
@require_role("laboratory_staff")
def approve_staff_request(request_id):
    try:
        account_from_session().approve_request(db(), request_id, str(json_body().get("reviewNotes", "")).strip())
        return jsonify(ok=True, request=next(row for row in request_rows() if row["id"] == request_id))
    except (ValueError, mysql.connector.IntegrityError) as exc:
        db().rollback()
        return api_error(str(exc))


@app.post("/api/staff/requests/<request_id>/reject")
@require_role("laboratory_staff")
def reject_staff_request(request_id):
    try:
        account_from_session().reject_request(db(), request_id, str(json_body().get("reviewNotes", "")).strip())
        return jsonify(ok=True, request=next(row for row in request_rows() if row["id"] == request_id))
    except (ValueError, mysql.connector.IntegrityError) as exc:
        db().rollback()
        return api_error(str(exc))


@app.delete("/api/requests/<request_id>")
@require_role("user")
def cancel_request(request_id):
    connection = db()
    try:
        if not User(session["account_id"], "", "user").cancel_request(connection, request_id):
            return api_error("Only your pending requests can be cancelled.")
        connection.commit()
        return jsonify(ok=True)
    except mysql.connector.Error:
        connection.rollback()
        raise


@app.post("/api/requests/<request_id>/release")
@app.post("/api/staff/requests/<request_id>/release")
@require_role("laboratory_staff")
def release_request(request_id):
    connection = db()
    try:
        staff = account_from_session()
        transaction_id = staff.release_equipment(connection, request_id)
        return jsonify(ok=True, transactionId=transaction_id), 201
    except (ValueError, mysql.connector.IntegrityError) as exc:
        connection.rollback()
        return api_error(str(exc))


@app.get("/api/transactions")
@app.get("/api/transactions/mine")
@require_role("laboratory_staff", "user")
def list_transactions():
    rows = request_rows(None if session["role"] == "laboratory_staff" else session["account_id"])
    return jsonify(items=[row for row in rows if row["transactionId"]])


@app.get("/api/staff/transactions")
@require_role("laboratory_staff")
def staff_transactions():
    rows = request_rows()
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
        if datetime.fromisoformat(proposed) <= datetime.fromisoformat(row["return_deadline"]):
            raise ValueError("Choose a date later than the current return deadline.")
        extension_id = User(session["account_id"], "", "user").request_extension(
            connection, transaction_id, reason, proposed
        )
        return jsonify(ok=True, extensionId=extension_id), 201
    except (ValueError, mysql.connector.IntegrityError) as exc:
        db().rollback()
        return api_error(str(exc))


@app.post("/api/extensions")
@require_role("user")
def create_extension():
    transaction_id = str(json_body().get("transactionId", "")).strip()
    if not transaction_id:
        return api_error("Choose a borrowing transaction.")
    return request_extension(transaction_id)


@app.get("/api/extensions/mine")
@require_role("user")
def my_extensions():
    rows = db().execute(
        """SELECT er.extension_id, er.transaction_id, er.reason, er.requested_new_due_date,
                  er.extension_status, er.submitted_at
           FROM extension_requests er WHERE er.account_id = ? ORDER BY er.submitted_at DESC""",
        (session["account_id"],),
    ).fetchall()
    return jsonify(items=[
        {"id": row["extension_id"], "transactionId": row["transaction_id"], "reason": row["reason"],
         "newDueDate": row["requested_new_due_date"], "status": row["extension_status"],
         "submittedAt": row["submitted_at"]}
        for row in rows
    ])


@app.get("/api/staff/extensions")
@require_role("laboratory_staff")
def staff_extensions():
    rows = db().execute(
        """SELECT er.extension_id, er.transaction_id, er.account_id, a.full_name, er.reason,
                  er.requested_new_due_date, er.extension_status, er.submitted_at
           FROM extension_requests er JOIN accounts a ON a.account_id = er.account_id
           ORDER BY er.submitted_at DESC"""
    ).fetchall()
    return jsonify(items=[
        {"id": row["extension_id"], "transactionId": row["transaction_id"], "accountId": row["account_id"],
         "studentName": row["full_name"], "reason": row["reason"], "newDueDate": row["requested_new_due_date"],
         "status": row["extension_status"], "submittedAt": row["submitted_at"]}
        for row in rows
    ])


@app.patch("/api/extensions/<extension_id>")
@app.post("/api/staff/extensions/<extension_id>/approve")
@app.post("/api/staff/extensions/<extension_id>/reject")
@require_role("laboratory_staff")
def review_extension(extension_id):
    data = json_body()
    action = str(data.get("status", "")).lower()
    if request.path.endswith("/approve"):
        action = "approved"
    elif request.path.endswith("/reject"):
        action = "rejected"
    connection = db()
    row = connection.execute("SELECT * FROM extension_requests WHERE extension_id = ?", (extension_id,)).fetchone()
    if not row or row["extension_status"] != "Pending" or action not in ("approved", "rejected"):
        return api_error("This extension request is no longer pending.", 404)
    try:
        with connection:
            current = connection.execute(
                "SELECT extension_status FROM extension_requests WHERE extension_id = ? FOR UPDATE",
                (extension_id,),
            ).fetchone()
            if not current or current["extension_status"] != "Pending":
                raise ValueError("This extension request is no longer pending.")
            if action == "approved":
                transaction = connection.execute(
                    """SELECT transaction_status FROM borrowing_transactions
                       WHERE transaction_id = ? FOR UPDATE""",
                    (row["transaction_id"],),
                ).fetchone()
                if not transaction or transaction["transaction_status"] not in (
                    "Active", "Partially Returned", "Overdue"
                ):
                    raise ValueError("Only an active transaction can be extended.")
            cursor = connection.execute(
                """UPDATE extension_requests SET extension_status = ?, reviewed_by = ?, reviewed_at = ?
                   WHERE extension_id = ? AND extension_status = 'Pending'""",
                (action.capitalize(), session["account_id"], iso_now(), extension_id),
            )
            if cursor.rowcount != 1:
                raise ValueError("This extension request is no longer pending.")
            if action == "approved":
                connection.execute(
                    "UPDATE borrowing_transactions SET return_deadline = ?, transaction_status = 'Active' WHERE transaction_id = ?",
                    (row["requested_new_due_date"], row["transaction_id"]),
                )
    except ValueError as exc:
        connection.rollback()
        return api_error(str(exc))
    return jsonify(ok=True)


@app.post("/api/transactions/<transaction_id>/returns")
@app.post("/api/staff/transactions/<transaction_id>/returns")
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
        status = account_from_session().record_returns(connection, transaction_id, records)
        return jsonify(ok=True, status=status)
    except (ValueError, TypeError, mysql.connector.IntegrityError) as exc:
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
            account_from_session().record_case(
                connection, item_id, case_type, quantity, description
            )
            if case_type == "Lost":
                connection.execute("UPDATE transaction_items SET quantity_lost = quantity_lost + ? WHERE transaction_item_id = ?", (quantity, item_id))
                Equipment.update_quantity(connection, item["equipment_id"], 0, -quantity)
            elif case_type in ("Damaged", "Improper Return"):
                Equipment.update_condition(connection, item["equipment_id"], "Needs Repair")
            BorrowingTransaction.update_status(connection, transaction_id)
        return jsonify(ok=True)
    except (ValueError, TypeError, mysql.connector.IntegrityError) as exc:
        db().rollback()
        return api_error(str(exc))


@app.get("/api/staff/cases")
@require_role("laboratory_staff")
def list_cases():
    rows = db().execute(
        """SELECT oc.*, e.equipment_name, bt.transaction_id, br.account_id, a.full_name
           FROM other_cases oc
           JOIN transaction_items ti ON ti.transaction_item_id = oc.transaction_item_id
           JOIN equipment e ON e.equipment_id = ti.equipment_id
           JOIN borrowing_transactions bt ON bt.transaction_id = ti.transaction_id
           JOIN borrowing_requests br ON br.request_id = bt.request_id
           JOIN accounts a ON a.account_id = br.account_id
           ORDER BY oc.date_recorded DESC"""
    ).fetchall()
    return jsonify(items=[
        {"id": row["case_id"], "transactionId": row["transaction_id"], "transactionItemId": row["transaction_item_id"],
         "accountId": row["account_id"], "studentName": row["full_name"], "equipment": row["equipment_name"],
         "type": row["case_type"], "quantity": row["quantity"], "description": row["description"],
         "date": row["date_recorded"], "resolutionStatus": row["resolution_status"],
         "resolutionNotes": row["resolution_notes"], "resolvedAt": row["resolved_at"]}
        for row in rows
    ])


@app.post("/api/staff/cases")
@require_role("laboratory_staff")
def create_staff_case():
    data = json_body()
    transaction_id = str(data.get("transactionId", "")).strip()
    if not transaction_id:
        return api_error("Choose a borrowing transaction.")
    return record_case(transaction_id)


@app.put("/api/staff/cases/<case_id>")
@require_role("laboratory_staff")
def update_case(case_id):
    data = json_body()
    description = str(data.get("description", "")).strip()
    resolution_notes = str(data.get("resolutionNotes", "")).strip()
    action = str(data.get("resolutionStatus", "")).strip().lower()
    if not description:
        return api_error("Incident description is required.")
    if action not in ("under review", "resolved"):
        return api_error("Choose a valid incident resolution status.")
    connection = db()
    try:
        if action == "resolved":
            changed = account_from_session().resolve_case(connection, case_id, resolution_notes)
        else:
            changed = OtherCases.update(connection, case_id, description, resolution_notes)
        if not changed:
            return api_error("An unresolved incident with that ID was not found.", 404)
        connection.commit()
        return jsonify(ok=True)
    except mysql.connector.Error:
        connection.rollback()
        raise


@app.get("/api/dashboard")
@app.get("/api/dashboard/staff")
@require_role("laboratory_staff")
def dashboard_data():
    equipment = equipment_rows(True)
    requests = request_rows()
    transactions = [item for item in requests if item["transactionId"]]
    now = datetime.now().astimezone()
    extra_stats = db().execute(
        """SELECT
             (SELECT COUNT(*) FROM extension_requests WHERE extension_status = 'Pending') AS pending_extensions,
             (SELECT COUNT(*) FROM borrowing_requests br
              LEFT JOIN borrowing_transactions bt ON bt.request_id = br.request_id
              WHERE br.request_status = 'Approved' AND bt.transaction_id IS NULL) AS awaiting_release,
             (SELECT COUNT(*) FROM borrowing_transactions
              WHERE transaction_status IN ('Active', 'Partially Returned', 'Overdue')) AS active_transactions,
             (SELECT COUNT(*) FROM equipment
              WHERE equipment_status = 'Active' AND condition_status = 'Needs Repair') AS damaged_equipment,
             (SELECT COUNT(*) FROM other_cases WHERE case_type = 'Lost') AS lost_cases,
             (SELECT COUNT(*) FROM other_cases WHERE resolution_status = 'Under Review') AS open_cases"""
    ).fetchone()
    return jsonify(
        stats={
            "equipment": len([item for item in equipment if item["active"]]),
            "available": sum(1 for item in equipment if item["active"] and item["stock"] > 0),
            "unavailable": sum(1 for item in equipment if not item["active"] or item["stock"] == 0),
            "pending": sum(1 for item in requests if item["requestStatus"] == "pending"),
            "borrowed": sum(item["outstanding"] for row in transactions for item in row["items"]),
            "overdue": sum(1 for row in transactions if row["status"] == "overdue"),
            "pendingExtensions": extra_stats["pending_extensions"],
            "awaitingRelease": extra_stats["awaiting_release"],
            "activeTransactions": extra_stats["active_transactions"],
            "damagedEquipment": extra_stats["damaged_equipment"],
            "lostCases": extra_stats["lost_cases"],
            "openCases": extra_stats["open_cases"],
        },
        pendingRequests=[row for row in requests if row["requestStatus"] == "pending"][:5],
        upcomingReturns=[row for row in transactions if row["status"] in ("active", "overdue", "partially_returned") and row["returnBy"]][:8],
        recentActivity=connection_rows("activity"),
        serverTime=now.isoformat(timespec="minutes"),
    )


@app.get("/api/dashboard/user")
@require_role("user")
def user_dashboard_data():
    requests = request_rows(session["account_id"])
    equipment = equipment_rows()
    transactions = [row for row in requests if row["transactionId"]]
    return jsonify(
        user={"id": session["account_id"], "name": account_from_session().name},
        stats={
            "availableEquipment": len([item for item in equipment if item["stock"] > 0]),
            "pendingRequests": sum(1 for row in requests if row["requestStatus"] == "pending"),
            "activeTransactions": sum(1 for row in transactions if row["status"] in ("active", "partially_returned")),
            "overdueTransactions": sum(1 for row in transactions if row["status"] == "overdue"),
        },
        recentRequests=requests[:5],
        transactions=transactions,
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
        "INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)",
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
