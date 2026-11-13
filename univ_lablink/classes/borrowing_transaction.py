import uuid

from .equipment import Equipment
from .other_cases import OtherCases
from datetime import datetime


class BorrowingTransaction:
    @classmethod
    def release(cls, connection, request_id, staff_id):
        with connection:
            request_row = connection.execute(
                "SELECT * FROM borrowing_requests WHERE request_id = ? FOR UPDATE",
                (request_id,),
            ).fetchone()
            if not request_row or request_row["request_status"] != "Approved":
                raise ValueError("Only an approved request can be released.")
            existing = connection.execute(
                "SELECT transaction_id FROM borrowing_transactions WHERE request_id = ?",
                (request_id,),
            ).fetchone()
            if existing:
                raise ValueError("This request has already been released.")
            items = connection.execute(
                "SELECT equipment_id, requested_quantity FROM borrowing_request_items WHERE request_id = ?",
                (request_id,),
            ).fetchall()
            if not items:
                raise ValueError("This request has no equipment items.")

            transaction_id = "TXN-" + uuid.uuid4().hex[:10].upper()
            connection.execute(
                """INSERT INTO borrowing_transactions
                   (transaction_id, request_id, released_by, release_datetime, return_deadline)
                   VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)""",
                (transaction_id, request_id, staff_id, request_row["requested_return_datetime"]),
            )
            for item in items:
                connection.execute(
                    """INSERT INTO transaction_items
                       (transaction_id, equipment_id, quantity_borrowed) VALUES (?, ?, ?)""",
                    (transaction_id, item["equipment_id"], item["requested_quantity"]),
                )
        return transaction_id

    @staticmethod
    def request_extension(connection, account_id, transaction_id, reason, new_due_date):
        transaction = connection.execute(
            """SELECT bt.*, br.account_id FROM borrowing_transactions bt
               JOIN borrowing_requests br ON br.request_id = bt.request_id
               WHERE bt.transaction_id = ? FOR UPDATE""",
            (transaction_id,),
        ).fetchone()
        if not transaction or transaction["account_id"] != account_id:
            raise ValueError("Borrowing transaction was not found.")
        if transaction["transaction_status"] not in ("Active", "Partially Returned", "Overdue"):
            raise ValueError("Only active transactions can be extended.")
        if not reason.strip():
            raise ValueError("An extension reason is required.")
        if datetime.fromisoformat(new_due_date) <= datetime.fromisoformat(transaction["return_deadline"]):
            raise ValueError("Choose a date later than the current return deadline.")
        if connection.execute(
            "SELECT 1 FROM extension_requests WHERE transaction_id = ?",
            (transaction_id,),
        ).fetchone():
            raise ValueError("Only one extension request is allowed per transaction.")
        extension_id = "EXT-" + uuid.uuid4().hex[:10].upper()
        connection.execute(
            """INSERT INTO extension_requests
               (extension_id, transaction_id, account_id, reason, requested_new_due_date)
               VALUES (?, ?, ?, ?, ?)""",
            (extension_id, transaction_id, account_id, reason.strip(), new_due_date),
        )
        connection.commit()
        return extension_id

    @classmethod
    def record_return(cls, connection, transaction_id, inspected_by, records):
        if not isinstance(records, list) or not records:
            raise ValueError("Record at least one returned item.")
        if any(not isinstance(item, dict) for item in records):
            raise ValueError("Each returned item must be valid.")
        with connection:
            transaction = connection.execute(
                "SELECT transaction_status, return_requested_at FROM borrowing_transactions "
                "WHERE transaction_id = ? FOR UPDATE",
                (transaction_id,),
            ).fetchone()
            if (
                not transaction
                or transaction["transaction_status"] in ("Returned", "Lost")
                or not transaction["return_requested_at"]
            ):
                raise ValueError("This transaction is not ready to accept a return.")
            for item in sorted(records, key=lambda value: str(value.get("transactionItemId", ""))):
                try:
                    if isinstance(item.get("quantity"), bool):
                        raise ValueError()
                    item_id = int(item.get("transactionItemId"))
                    quantity = int(item.get("quantity"))
                except (TypeError, ValueError):
                    raise ValueError("Returned item and quantity must be valid.")
                condition = str(item.get("condition", "Good")).strip()
                if quantity < 1:
                    raise ValueError("Returned quantity must be a positive whole number.")
                if condition not in ("Good", "Needs Repair", "Damaged", "Improper Return"):
                    raise ValueError("Select a valid return condition.")
                row = connection.execute(
                    """SELECT ti.*, e.equipment_id FROM transaction_items ti
                       JOIN equipment e ON e.equipment_id = ti.equipment_id
                       WHERE ti.transaction_item_id = ? AND ti.transaction_id = ? FOR UPDATE""",
                    (item_id, transaction_id),
                ).fetchone()
                if not row or quantity > (
                    row["quantity_borrowed"] - row["quantity_returned"] - row["quantity_lost"]
                ):
                    raise ValueError("Returned quantity exceeds the outstanding quantity.")
                connection.execute(
                    """UPDATE transaction_items SET quantity_returned = quantity_returned + ?
                       WHERE transaction_item_id = ?""",
                    (quantity, item_id),
                )
                notes = str(item.get("notes", "")).strip()
                if condition == "Good":
                    Equipment.update_quantity(connection, row["equipment_id"], quantity)
                else:
                    Equipment.update_condition(connection, row["equipment_id"], "Needs Repair")
                    OtherCases.record(
                        connection,
                        item_id,
                        inspected_by,
                        "Improper Return" if condition == "Improper Return" else "Damaged",
                        quantity,
                        notes or condition + " condition recorded during return inspection.",
                    )
                connection.execute(
                    """INSERT INTO return_records
                       (return_id, transaction_item_id, inspected_by, quantity_returned,
                        actual_return_datetime, condition_status, inspection_notes)
                       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)""",
                    (
                        "RET-" + uuid.uuid4().hex[:10].upper(),
                        item_id,
                        inspected_by,
                        quantity,
                        condition,
                        notes,
                    ),
                )
            status = cls.update_status(connection, transaction_id)
            connection.execute(
                "UPDATE borrowing_transactions SET return_requested_at = NULL WHERE transaction_id = ?",
                (transaction_id,),
            )
        return status

    @staticmethod
    def update_status(connection, transaction_id):
        quantities = connection.execute(
            """SELECT quantity_borrowed, quantity_returned, quantity_lost
               FROM transaction_items WHERE transaction_id = ?""",
            (transaction_id,),
        ).fetchall()
        outstanding = sum(
            row["quantity_borrowed"] - row["quantity_returned"] - row["quantity_lost"]
            for row in quantities
        )
        returned = sum(row["quantity_returned"] for row in quantities)
        lost = sum(row["quantity_lost"] for row in quantities)
        incidents = connection.execute(
            """SELECT case_type FROM other_cases oc
               JOIN transaction_items ti ON ti.transaction_item_id = oc.transaction_item_id
               WHERE ti.transaction_id = ? AND oc.case_type IN ('Damaged', 'Lost', 'Improper Return')""",
            (transaction_id,),
        ).fetchall()
        incident_types = {row["case_type"] for row in incidents}
        if outstanding:
            status = "Partially Returned" if returned or lost else "Active"
        elif "Lost" in incident_types:
            status = "Lost"
        elif incident_types.intersection({"Damaged", "Improper Return"}):
            status = "Damaged"
        else:
            status = "Returned"
        is_complete = outstanding == 0 and status in ("Returned", "Damaged", "Lost")
        connection.execute(
            """UPDATE borrowing_transactions SET transaction_status = ?,
               actual_return_datetime = IF(? = 1, CURRENT_TIMESTAMP, actual_return_datetime)
               WHERE transaction_id = ?""",
            (status, int(is_complete), transaction_id),
        )
        return status

    @staticmethod
    def check_overdue(connection):
        connection.execute(
            """UPDATE borrowing_transactions SET transaction_status = 'Overdue'
               WHERE transaction_status IN ('Active', 'Partially Returned')
                 AND return_deadline < CURRENT_TIMESTAMP
                 AND return_requested_at IS NULL"""
        )
        staff = connection.execute(
            """SELECT account_id FROM accounts
               WHERE role_id = 'laboratory_staff' AND account_status = 'Active'
               ORDER BY account_id LIMIT 1"""
        ).fetchone()
        if not staff:
            return
        overdue_items = connection.execute(
            """SELECT ti.transaction_item_id, bt.transaction_id,
                      ti.quantity_borrowed - ti.quantity_returned - ti.quantity_lost AS quantity
               FROM transaction_items ti
               JOIN borrowing_transactions bt ON bt.transaction_id = ti.transaction_id
               WHERE bt.transaction_status = 'Overdue'
                 AND ti.quantity_borrowed > ti.quantity_returned + ti.quantity_lost
                 AND NOT EXISTS (
                     SELECT 1 FROM other_cases oc
                     WHERE oc.transaction_item_id = ti.transaction_item_id
                       AND oc.case_type = 'Overdue'
                 )"""
        ).fetchall()
        for item in overdue_items:
            connection.execute(
                """INSERT INTO other_cases
                   (case_id, transaction_item_id, recorded_by, case_type, quantity, description)
                   VALUES (?, ?, ?, 'Overdue', ?, ?)""",
                (
                    "CASE-" + uuid.uuid4().hex[:10].upper(),
                    item["transaction_item_id"],
                    staff["account_id"],
                    item["quantity"],
                    "Transaction " + item["transaction_id"] + " is overdue.",
                ),
            )
