from .account import Account
from .borrowing_request import BorrowingRequest
from .borrowing_transaction import BorrowingTransaction
from .equipment import Equipment
from .other_cases import OtherCases


class LaboratoryStaff(Account):
    def display_dashboard(self):
        return "admin_welcome/admin_welcome.html"

    def approve_request(self, connection, request_id, review_notes=""):
        return BorrowingRequest.approve(connection, request_id, self.id, review_notes)

    def reject_request(self, connection, request_id, review_notes=""):
        return BorrowingRequest.reject(connection, request_id, self.id, review_notes)

    def release_equipment(self, connection, request_id):
        return BorrowingTransaction.release(connection, request_id, self.id)

    def record_returns(self, connection, transaction_id, items):
        return BorrowingTransaction.record_return(connection, transaction_id, self.id, items)

    def add_equipment(self, connection, *equipment_fields):
        return Equipment.add(connection, *equipment_fields)

    def update_equipment(self, connection, *equipment_fields):
        return Equipment.update(connection, *equipment_fields)

    def record_case(self, connection, transaction_item_id, case_type, quantity, description):
        return OtherCases.record(
            connection, transaction_item_id, self.id, case_type, quantity, description
        )

    def resolve_case(self, connection, case_id, resolution_notes):
        return OtherCases.resolve(connection, case_id, resolution_notes)
