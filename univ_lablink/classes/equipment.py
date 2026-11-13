class Equipment:
    def __init__(self, equipment_id, name, available_quantity, total_quantity=None):
        self.id = equipment_id
        self.name = name
        self.available_quantity = available_quantity
        self.total_quantity = total_quantity

    @classmethod
    def add(
        cls, connection, equipment_id, category_name, name, description, location, unit,
        quantity, borrow_status="Available", image_path=None
    ):
        connection.execute(
            """INSERT IGNORE INTO equipment_categories (category_name) VALUES (?)""",
            (category_name,),
        )
        category = connection.execute(
            "SELECT category_id FROM equipment_categories WHERE category_name = ?",
            (category_name,),
        ).fetchone()
        connection.execute(
            """INSERT INTO equipment
               (equipment_id, category_id, equipment_name, description, location, unit,
                total_quantity, available_quantity, borrow_status, image_path)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                equipment_id, category["category_id"], name, description, location,
                unit, quantity, quantity, borrow_status, image_path,
            ),
        )

    @classmethod
    def update(
        cls, connection, equipment_id, category_name, name, description, location, unit,
        total_quantity, available_quantity, borrow_status, equipment_status, image_path
    ):
        connection.execute(
            "INSERT IGNORE INTO equipment_categories (category_name) VALUES (?)",
            (category_name,),
        )
        category = connection.execute(
            "SELECT category_id FROM equipment_categories WHERE category_name = ?",
            (category_name,),
        ).fetchone()
        connection.execute(
            """UPDATE equipment SET category_id = ?, equipment_name = ?, description = ?,
               location = ?, unit = ?, total_quantity = ?, available_quantity = ?,
               borrow_status = ?, equipment_status = ?, image_path = ?, last_updated = CURRENT_TIMESTAMP
               WHERE equipment_id = ?""",
            (
                category["category_id"], name, description, location, unit, total_quantity,
                available_quantity, borrow_status, equipment_status, image_path, equipment_id,
            ),
        )

    @classmethod
    def get(cls, connection, equipment_id, lock=False):
        suffix = " FOR UPDATE" if lock else ""
        row = connection.execute(
            "SELECT equipment_id, equipment_name, available_quantity, total_quantity, "
            "equipment_status, borrow_status FROM equipment WHERE equipment_id = ?" + suffix,
            (equipment_id,),
        ).fetchone()
        return row

    @classmethod
    def check_availability(cls, connection, equipment_id, quantity, lock=False):
        row = cls.get(connection, equipment_id, lock=lock)
        if not row:
            raise ValueError("Equipment was not found.")
        if row["equipment_status"] != "Active" or row["borrow_status"] != "Available":
            raise ValueError(f"{row['equipment_name']} is not available for borrowing.")
        if row["available_quantity"] < quantity:
            raise ValueError(f"Not enough available stock for {row['equipment_name']}.")
        return row

    @classmethod
    def update_quantity(cls, connection, equipment_id, available_delta, total_delta=0):
        connection.execute(
            """UPDATE equipment
               SET available_quantity = available_quantity + ?,
                   total_quantity = total_quantity + ?,
                   last_updated = CURRENT_TIMESTAMP
               WHERE equipment_id = ?""",
            (available_delta, total_delta, equipment_id),
        )

    @classmethod
    def update_condition(cls, connection, equipment_id, condition):
        connection.execute(
            "UPDATE equipment SET condition_status = ?, last_updated = CURRENT_TIMESTAMP WHERE equipment_id = ?",
            (condition, equipment_id),
        )
