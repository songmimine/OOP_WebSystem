"""Insert optional demo accounts and inventory into the configured MySQL database."""

from werkzeug.security import generate_password_hash

from univ_lablink.database import connect


ACCOUNTS = (
    ("LAB-00001", "Laboratory Staff", "admin.labs@lpu.edu.ph", "Computer Science", "laboratory_staff", "lab123"),
    ("2025-2-00001", "Katrina Mendoza", "2025-2-00001@lpu.edu.ph", "Computer Science", "user", "lab123"),
    ("2025-2-00002", "Charmaine Tablatin", "2025-2-00002@lpu.edu.ph", "Computer Science", "user", "cha123"),
)

CATEGORIES = ("Equipment & Machines", "Glassware & Containers", "Chemicals & Reagents")

EQUIPMENT = (
    ("EQ-001", "Beakers", "250 mL", "Glassware & Containers", "Lab 1 · Room S201", 10, "pieces"),
    ("EQ-002", "Bunsen Burner", "Standard", "Equipment & Machines", "Lab 3 · Room S305", 9, "units"),
    ("EQ-003", "Centrifuge", "Digital", "Equipment & Machines", "Lab 2 · Room S204", 5, "units"),
    ("EQ-004", "Digital Weighing Scale", "Precision balance", "Equipment & Machines", "Lab 1 · Room S201", 10, "units"),
    ("EQ-005", "Ethanol", "C2H5OH · 95%", "Chemicals & Reagents", "Store · Room S110", 10, "bottles"),
    ("EQ-006", "Graduated Cylinders", "100 mL", "Glassware & Containers", "Lab 2 · Room S204", 10, "pieces"),
    ("EQ-007", "Hydrochloric Acid", "HCl · 1M", "Chemicals & Reagents", "Store · Room S110", 10, "bottles"),
    ("EQ-008", "Hydrogen Peroxide", "H2O2 · 3%", "Chemicals & Reagents", "Store · Room S110", 10, "bottles"),
    ("EQ-009", "Microscope", "Model M-400", "Equipment & Machines", "Lab 3 · Room S305", 4, "units"),
    ("EQ-010", "Test Tubes", "15 x 150 mm", "Glassware & Containers", "Lab 1 · Room S101", 20, "pieces"),
)


def seed():
    connection = connect()
    try:
        with connection:
            for role_id, role_name in (("user", "User"), ("laboratory_staff", "Laboratory Staff")):
                connection.execute(
                    "INSERT IGNORE INTO roles (role_id, role_name) VALUES (?, ?)",
                    (role_id, role_name),
                )
            for category in CATEGORIES:
                connection.execute(
                    "INSERT IGNORE INTO equipment_categories (category_name) VALUES (?)",
                    (category,),
                )
            for account_id, name, email, department, role_id, password in ACCOUNTS:
                connection.execute(
                    """INSERT IGNORE INTO accounts
                       (account_id, role_id, account_identifier, university_email, full_name,
                        department, password_hash)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (account_id, role_id, account_id, email, name, department, generate_password_hash(password)),
                )
            for equipment_id, name, description, category, location, quantity, unit in EQUIPMENT:
                connection.execute(
                    """INSERT IGNORE INTO equipment
                       (equipment_id, category_id, equipment_name, description, location, unit,
                        total_quantity, available_quantity)
                       SELECT ?, category_id, ?, ?, ?, ?, ?, ?
                       FROM equipment_categories WHERE category_name = ?""",
                    (equipment_id, name, description, location, unit, quantity, quantity, category),
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
                "INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES (?, ?)",
                list(defaults.items()),
            )
    finally:
        connection.close()


if __name__ == "__main__":
    seed()
    print("Demo records are ready in the configured MySQL database.")
