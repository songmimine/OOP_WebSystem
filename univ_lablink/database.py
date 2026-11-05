"""SQLite persistence for the University LabLink prototype."""

import os
import sqlite3
from pathlib import Path

from werkzeug.security import generate_password_hash

BASE = Path(__file__).parent
DATABASE = Path(os.environ.get("LABLINK_DATABASE", BASE.parent / "instance" / "lablink.sqlite3"))

STARTER_EQUIPMENT = (
    ("EQ-001", "Beakers", "250 mL", "Glassware & Containers", "Lab 1 · Room S201", 10, "pieces"),
    ("EQ-002", "Bunsen Burner", "Standard", "Equipment & Machines", "Lab 3 · Room S305", 9, "units"),
    ("EQ-003", "Centrifuge", "Digital", "Equipment & Machines", "Lab 2 · Room S204", 5, "units"),
    ("EQ-004", "Digital Weighing Scale", "Precision balance", "Equipment & Machines", "Lab 1 · Room S201", 10, "units"),
    ("EQ-005", "Ethanol", "C₂H₅OH · 95%", "Chemicals & Reagents", "Store · Room S110", 10, "bottles"),
    ("EQ-006", "Graduated Cylinders", "100 mL", "Glassware & Containers", "Lab 2 · Room S204", 10, "pieces"),
    ("EQ-007", "Hydrochloric Acid", "HCl · 1M", "Chemicals & Reagents", "Store · Room S110", 10, "bottles"),
    ("EQ-008", "Hydrogen Peroxide", "H₂O₂ · 3%", "Chemicals & Reagents", "Store · Room S110", 10, "bottles"),
    ("EQ-009", "Microscope", "Model M-400", "Equipment & Machines", "Lab 3 · Room S305", 4, "units"),
    ("EQ-010", "Test Tubes", "15 × 150 mm", "Glassware & Containers", "Lab 1 · Room S101", 20, "pieces"),
)

DEMO_ACCOUNTS = (
    ("LAB-00001", "Laboratory Staff", "admin.labs@lpu.edu.ph", "Computer Science", "laboratory_staff", "lab123"),
    ("2025-2-00001", "Katrina Mendoza", "2025-2-00001@lpu.edu.ph", "Computer Science", "user", "lab123"),
    ("2025-2-00002", "Charmaine Tablatin", "2025-2-00002@lpu.edu.ph", "Computer Science", "user", "cha123"),
)


def connect(path=None):
    database = Path(path or DATABASE)
    database.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(database), timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 10000")
    return connection


def initialize(path=None):
    connection = connect(path)
    try:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS roles (
                role_id TEXT PRIMARY KEY,
                role_name TEXT NOT NULL UNIQUE
            );
            CREATE TABLE IF NOT EXISTS accounts (
                account_id TEXT PRIMARY KEY,
                role_id TEXT NOT NULL REFERENCES roles(role_id),
                university_email TEXT NOT NULL UNIQUE,
                full_name TEXT NOT NULL,
                department TEXT NOT NULL DEFAULT '',
                password_hash TEXT NOT NULL,
                account_status TEXT NOT NULL DEFAULT 'Active' CHECK (account_status IN ('Active', 'Inactive')),
                creation_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS equipment_categories (
                category_id INTEGER PRIMARY KEY AUTOINCREMENT,
                category_name TEXT NOT NULL UNIQUE,
                category_description TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS equipment (
                equipment_id TEXT PRIMARY KEY,
                category_id INTEGER NOT NULL REFERENCES equipment_categories(category_id),
                equipment_name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                location TEXT NOT NULL DEFAULT '',
                unit TEXT NOT NULL DEFAULT 'units',
                total_quantity INTEGER NOT NULL CHECK (total_quantity >= 0),
                available_quantity INTEGER NOT NULL CHECK (available_quantity >= 0 AND available_quantity <= total_quantity),
                condition_status TEXT NOT NULL DEFAULT 'Good',
                borrow_status TEXT NOT NULL DEFAULT 'Available' CHECK (borrow_status IN ('Available', 'Unavailable')),
                equipment_status TEXT NOT NULL DEFAULT 'Active' CHECK (equipment_status IN ('Active', 'Inactive')),
                image_path TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_updated TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS borrowing_requests (
                request_id TEXT PRIMARY KEY,
                account_id TEXT NOT NULL REFERENCES accounts(account_id),
                purpose TEXT NOT NULL,
                notes TEXT NOT NULL DEFAULT '',
                requested_borrowing_datetime TEXT NOT NULL,
                requested_return_datetime TEXT NOT NULL,
                request_status TEXT NOT NULL DEFAULT 'Pending' CHECK (request_status IN ('Pending', 'Approved', 'Rejected', 'Cancelled')),
                reviewed_by TEXT REFERENCES accounts(account_id),
                submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                reviewed_at TEXT,
                review_notes TEXT NOT NULL DEFAULT '',
                is_new INTEGER NOT NULL DEFAULT 1 CHECK (is_new IN (0, 1))
            );
            CREATE TABLE IF NOT EXISTS borrowing_request_items (
                request_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id TEXT NOT NULL REFERENCES borrowing_requests(request_id) ON DELETE CASCADE,
                equipment_id TEXT NOT NULL REFERENCES equipment(equipment_id),
                requested_quantity INTEGER NOT NULL CHECK (requested_quantity > 0),
                UNIQUE (request_id, equipment_id)
            );
            CREATE TABLE IF NOT EXISTS borrowing_transactions (
                transaction_id TEXT PRIMARY KEY,
                request_id TEXT NOT NULL UNIQUE REFERENCES borrowing_requests(request_id),
                released_by TEXT NOT NULL REFERENCES accounts(account_id),
                release_datetime TEXT NOT NULL,
                return_deadline TEXT NOT NULL,
                actual_return_datetime TEXT,
                return_requested_at TEXT,
                transaction_status TEXT NOT NULL DEFAULT 'Active'
                    CHECK (transaction_status IN ('Active', 'Partially Returned', 'Returned', 'Overdue', 'Damaged', 'Lost'))
            );
            CREATE TABLE IF NOT EXISTS transaction_items (
                transaction_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
                transaction_id TEXT NOT NULL REFERENCES borrowing_transactions(transaction_id),
                equipment_id TEXT NOT NULL REFERENCES equipment(equipment_id),
                quantity_borrowed INTEGER NOT NULL CHECK (quantity_borrowed > 0),
                quantity_returned INTEGER NOT NULL DEFAULT 0 CHECK (quantity_returned >= 0),
                quantity_lost INTEGER NOT NULL DEFAULT 0 CHECK (quantity_lost >= 0),
                UNIQUE (transaction_id, equipment_id)
            );
            CREATE TABLE IF NOT EXISTS extension_requests (
                extension_id TEXT PRIMARY KEY,
                transaction_id TEXT NOT NULL REFERENCES borrowing_transactions(transaction_id),
                account_id TEXT NOT NULL REFERENCES accounts(account_id),
                reviewed_by TEXT REFERENCES accounts(account_id),
                reason TEXT NOT NULL,
                requested_new_due_date TEXT NOT NULL,
                extension_status TEXT NOT NULL DEFAULT 'Pending' CHECK (extension_status IN ('Pending', 'Approved', 'Rejected')),
                submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                reviewed_at TEXT
            );
            CREATE TABLE IF NOT EXISTS return_records (
                return_id TEXT PRIMARY KEY,
                transaction_item_id INTEGER NOT NULL REFERENCES transaction_items(transaction_item_id),
                inspected_by TEXT NOT NULL REFERENCES accounts(account_id),
                quantity_returned INTEGER NOT NULL CHECK (quantity_returned > 0),
                actual_return_datetime TEXT NOT NULL,
                condition_status TEXT NOT NULL,
                inspection_notes TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS other_cases (
                case_id TEXT PRIMARY KEY,
                transaction_item_id INTEGER NOT NULL REFERENCES transaction_items(transaction_item_id),
                recorded_by TEXT NOT NULL REFERENCES accounts(account_id),
                case_type TEXT NOT NULL CHECK (case_type IN ('Damaged', 'Lost', 'Overdue', 'Improper Return')),
                quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
                description TEXT NOT NULL,
                date_recorded TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                resolution_status TEXT NOT NULL DEFAULT 'Under Review' CHECK (resolution_status IN ('Under Review', 'Resolved')),
                resolution_notes TEXT NOT NULL DEFAULT '',
                resolved_at TEXT
            );
            CREATE TABLE IF NOT EXISTS system_settings (
                setting_key TEXT PRIMARY KEY,
                setting_value TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_requests_status ON borrowing_requests(request_status, submitted_at);
            CREATE INDEX IF NOT EXISTS idx_transactions_deadline ON borrowing_transactions(return_deadline, transaction_status);
            CREATE INDEX IF NOT EXISTS idx_transaction_items_equipment ON transaction_items(equipment_id);
            """
        )
        equipment_columns = {row["name"] for row in connection.execute("PRAGMA table_info(equipment)")}
        if "borrow_status" not in equipment_columns:
            connection.execute(
                "ALTER TABLE equipment ADD COLUMN borrow_status TEXT NOT NULL DEFAULT 'Available' "
                "CHECK (borrow_status IN ('Available', 'Unavailable'))"
            )
        for role_id, role_name in (("user", "User"), ("laboratory_staff", "Laboratory Staff")):
            connection.execute(
                "INSERT OR IGNORE INTO roles (role_id, role_name) VALUES (?, ?)",
                (role_id, role_name),
            )
        for account_id, name, email, department, role_id, password in DEMO_ACCOUNTS:
            connection.execute(
                """INSERT OR IGNORE INTO accounts
                   (account_id, role_id, university_email, full_name, department, password_hash)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (account_id, role_id, email, name, department, generate_password_hash(password)),
            )
        for name in ("Equipment & Machines", "Glassware & Containers", "Chemicals & Reagents"):
            connection.execute(
                "INSERT OR IGNORE INTO equipment_categories (category_name) VALUES (?)",
                (name,),
            )
        for equipment_id, name, description, category, location, quantity, unit in STARTER_EQUIPMENT:
            connection.execute(
                """INSERT OR IGNORE INTO equipment
                   (equipment_id, category_id, equipment_name, description, location, unit,
                    total_quantity, available_quantity)
                   VALUES (?, (SELECT category_id FROM equipment_categories WHERE category_name = ?),
                           ?, ?, ?, ?, ?, ?)""",
                (equipment_id, category, name, description, location, unit, quantity, quantity),
            )
        defaults = {
            "office": "Room A201",
            "phone": "+63 (046) 437-1250",
            "email": "admin.labs@lpu.edu.ph",
            "hours": "Mon-Fri 7:00 AM - 6:00 PM | Sat 8:00 AM - 12:00 PM",
            "rules": "14-day loan period, returns due by 5:00 PM",
            "extension": "One 7-day extension per request",
        }
        connection.executemany(
            "INSERT OR IGNORE INTO system_settings (setting_key, setting_value) VALUES (?, ?)",
            defaults.items(),
        )
        connection.commit()
    finally:
        connection.close()
