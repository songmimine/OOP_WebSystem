import uuid

from .equipment import Equipment


class BorrowingRequest:
    @staticmethod
    def validate(connection, items, require_availability=True, lock=False):
        if not isinstance(items, list) or not items:
            raise ValueError("Add at least one equipment item to your request.")
        seen = set()
        for item in items:
            if not isinstance(item, dict):
                raise ValueError("Each requested equipment item must be valid.")
            equipment_id = str(item.get("id", ""))
            quantity = item.get("qty")
            if isinstance(quantity, bool) or not str(quantity).isdigit() or int(quantity) < 1:
                raise ValueError("Quantity must be a positive whole number.")
            if equipment_id in seen:
                raise ValueError("Each equipment item may only appear once in a request.")
            seen.add(equipment_id)
            if require_availability:
                Equipment.check_availability(connection, equipment_id, int(quantity), lock=lock)

    @classmethod
    def create(cls, connection, account_id, purpose, notes, borrow_date, return_date, items):
        cls.validate(connection, items)
        request_id = "REQ-" + uuid.uuid4().hex[:10].upper()
        with connection:
            for item in sorted(items, key=lambda value: str(value["id"])):
                Equipment.check_availability(
                    connection, str(item["id"]), int(item["qty"]), lock=True
                )
            connection.execute(
                """INSERT INTO borrowing_requests
                   (request_id, account_id, purpose, notes, requested_borrowing_datetime,
                    requested_return_datetime)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (request_id, account_id, purpose, notes, borrow_date, return_date),
            )
            for item in items:
                connection.execute(
                    """INSERT INTO borrowing_request_items
                       (request_id, equipment_id, requested_quantity) VALUES (?, ?, ?)""",
                    (request_id, str(item["id"]), int(item["qty"])),
                )
        return request_id

    @classmethod
    def approve(cls, connection, request_id, reviewer_id, review_notes=""):
        with connection:
            request_row = connection.execute(
                "SELECT request_status FROM borrowing_requests WHERE request_id = ? FOR UPDATE",
                (request_id,),
            ).fetchone()
            if not request_row or request_row["request_status"] != "Pending":
                raise ValueError("Only pending requests can be approved.")
            items = connection.execute(
                """SELECT equipment_id, requested_quantity FROM borrowing_request_items
                   WHERE request_id = ? ORDER BY equipment_id""",
                (request_id,),
            ).fetchall()
            if not items:
                raise ValueError("This request has no equipment items.")
            for item in items:
                Equipment.check_availability(
                    connection, item["equipment_id"], item["requested_quantity"], lock=True
                )
            for item in items:
                cursor = connection.execute(
                    """UPDATE equipment
                       SET available_quantity = available_quantity - ?, last_updated = CURRENT_TIMESTAMP
                       WHERE equipment_id = ? AND available_quantity >= ?""",
                    (item["requested_quantity"], item["equipment_id"], item["requested_quantity"]),
                )
                if cursor.rowcount != 1:
                    raise ValueError("Equipment availability changed; review the request again.")
            connection.execute(
                """UPDATE borrowing_requests SET request_status = 'Approved', reviewed_by = ?,
                   reviewed_at = CURRENT_TIMESTAMP, review_notes = ?, is_new = 0
                   WHERE request_id = ?""",
                (reviewer_id, review_notes, request_id),
            )
        return True

    @staticmethod
    def reject(connection, request_id, reviewer_id, review_notes=""):
        cursor = connection.execute(
            """UPDATE borrowing_requests SET request_status = 'Rejected', reviewed_by = ?,
               reviewed_at = CURRENT_TIMESTAMP, review_notes = ?, is_new = 0
               WHERE request_id = ? AND request_status = 'Pending'""",
            (reviewer_id, review_notes, request_id),
        )
        if cursor.rowcount != 1:
            raise ValueError("Only pending requests can be rejected.")
        connection.commit()
        return True

    @staticmethod
    def cancel(connection, request_id, account_id):
        cursor = connection.execute(
            """UPDATE borrowing_requests SET request_status = 'Cancelled'
               WHERE request_id = ? AND account_id = ? AND request_status = 'Pending'""",
            (request_id, account_id),
        )
        if cursor.rowcount != 1:
            raise ValueError("Only your pending requests can be cancelled.")
        connection.commit()
        return True
