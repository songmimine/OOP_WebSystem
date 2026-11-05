import uuid


class OtherCases:
    CASE_TYPES = {"Damaged", "Lost", "Overdue", "Improper Return"}

    @classmethod
    def record(cls, connection, transaction_item_id, staff_id, case_type, quantity, description):
        if case_type not in cls.CASE_TYPES or not description.strip() or quantity < 1:
            raise ValueError("Choose a case type, a positive quantity, and provide a description.")
        case_id = "CASE-" + uuid.uuid4().hex[:10].upper()
        connection.execute(
            """INSERT INTO other_cases
               (case_id, transaction_item_id, recorded_by, case_type, quantity, description)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (case_id, transaction_item_id, staff_id, case_type, quantity, description.strip()),
        )
        return case_id

    @staticmethod
    def update(connection, case_id, description, resolution_notes):
        existing = connection.execute(
            "SELECT case_id FROM other_cases WHERE case_id = ? AND resolution_status = 'Under Review'",
            (case_id,),
        ).fetchone()
        if not existing:
            return False
        connection.execute(
            """UPDATE other_cases SET description = ?, resolution_notes = ?
               WHERE case_id = ? AND resolution_status = 'Under Review'""",
            (description, resolution_notes, case_id),
        )
        return True

    @staticmethod
    def resolve(connection, case_id, resolution_notes):
        cursor = connection.execute(
            """UPDATE other_cases SET resolution_status = 'Resolved', resolution_notes = ?,
               resolved_at = CURRENT_TIMESTAMP WHERE case_id = ? AND resolution_status = 'Under Review'""",
            (resolution_notes, case_id),
        )
        return cursor.rowcount == 1
