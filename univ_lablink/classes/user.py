from .account import Account


class User(Account):
    def display_dashboard(self):
        return "user_welcome/user_welcome.html"

    def browse_equipment(self, connection, search="", category_id=None):
        sql = """SELECT e.equipment_id, e.equipment_name, e.description, e.available_quantity,
                        e.total_quantity, e.condition_status, c.category_name
                 FROM equipment e
                 JOIN equipment_categories c ON c.category_id = e.category_id
                 WHERE e.equipment_status = 'Active'"""
        params = []
        if search:
            sql += " AND e.equipment_name LIKE ?"
            params.append("%" + search + "%")
        if category_id:
            sql += " AND e.category_id = ?"
            params.append(category_id)
        sql += " ORDER BY e.equipment_name"
        return connection.execute(sql, tuple(params)).fetchall()

    def cancel_request(self, connection, request_id):
        from .borrowing_request import BorrowingRequest

        try:
            return BorrowingRequest.cancel(connection, request_id, self.id)
        except ValueError:
            return False

    def submit_borrowing_request(self, connection, purpose, notes, borrow_date, return_date, items):
        from .borrowing_request import BorrowingRequest

        return BorrowingRequest.create(
            connection, self.id, purpose, notes, borrow_date, return_date, items
        )

    def request_extension(self, connection, transaction_id, reason, new_due_date):
        from .borrowing_transaction import BorrowingTransaction

        return BorrowingTransaction.request_extension(
            connection, self.id, transaction_id, reason, new_due_date
        )
