import os
import unittest
import uuid
from datetime import date, timedelta

import app as lablink
from univ_lablink.database import connect
from werkzeug.security import generate_password_hash


MYSQL_TESTS_ENABLED = os.environ.get("LABLINK_RUN_MYSQL_TESTS") == "1"


class LabLinkUnauthenticatedApiTests(unittest.TestCase):
    def setUp(self):
        lablink.app.config.update(TESTING=True)
        self.client = lablink.app.test_client()

    def test_api_operations_require_authentication(self):
        self.assertEqual(self.client.get("/api/equipment").status_code, 401)
        self.assertEqual(self.client.get("/api/staff/requests").status_code, 401)

    def test_logout_clears_session_without_database_access(self):
        response = self.client.post("/api/auth/logout")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["ok"])


@unittest.skipUnless(
    MYSQL_TESTS_ENABLED,
    "Set LABLINK_RUN_MYSQL_TESTS=1 to run integration tests against the configured MySQL database.",
)
class LabLinkMySQLApiTests(unittest.TestCase):
    def setUp(self):
        token = uuid.uuid4().hex[:12].upper()
        self.user_id = "TSTU" + token
        self.staff_id = "TSTF" + token
        self.equipment_id = "TSEQ" + token
        self.category = "LabLink test " + token
        self.connection = connect()
        with self.connection:
            for role_id, role_name in (("user", "User"), ("laboratory_staff", "Laboratory Staff")):
                self.connection.execute(
                    "INSERT IGNORE INTO roles (role_id, role_name) VALUES (?, ?)",
                    (role_id, role_name),
                )
            self.connection.execute(
                "INSERT INTO equipment_categories (category_name) VALUES (?)",
                (self.category,),
            )
            category_id = self.connection.execute(
                "SELECT category_id FROM equipment_categories WHERE category_name = ?",
                (self.category,),
            ).fetchone()["category_id"]
            for account_id, role_id, name in (
                (self.user_id, "user", "LabLink API Test User"),
                (self.staff_id, "laboratory_staff", "LabLink API Test Staff"),
            ):
                self.connection.execute(
                    """INSERT INTO accounts
                       (account_id, role_id, account_identifier, university_email, full_name,
                        department, password_hash)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (
                        account_id,
                        role_id,
                        account_id,
                        account_id.lower() + "@test.invalid",
                        name,
                        "Testing",
                        generate_password_hash("test-password"),
                    ),
                )
            self.connection.execute(
                """INSERT INTO equipment
                   (equipment_id, category_id, equipment_name, description, total_quantity, available_quantity)
                   VALUES (?, ?, 'Test microscope', 'Integration test fixture', 5, 5)""",
                (self.equipment_id, category_id),
            )

        lablink.app.config.update(TESTING=True)
        self.client = lablink.app.test_client()

    def tearDown(self):
        with self.connection:
            self.connection.execute(
                """DELETE rr FROM return_records rr
                   JOIN transaction_items ti ON ti.transaction_item_id = rr.transaction_item_id
                   JOIN borrowing_transactions bt ON bt.transaction_id = ti.transaction_id
                   JOIN borrowing_requests br ON br.request_id = bt.request_id
                   WHERE br.account_id = ?""",
                (self.user_id,),
            )
            self.connection.execute(
                """DELETE oc FROM other_cases oc
                   JOIN transaction_items ti ON ti.transaction_item_id = oc.transaction_item_id
                   JOIN borrowing_transactions bt ON bt.transaction_id = ti.transaction_id
                   JOIN borrowing_requests br ON br.request_id = bt.request_id
                   WHERE br.account_id = ?""",
                (self.user_id,),
            )
            self.connection.execute(
                """DELETE er FROM extension_requests er
                   JOIN borrowing_transactions bt ON bt.transaction_id = er.transaction_id
                   JOIN borrowing_requests br ON br.request_id = bt.request_id
                   WHERE br.account_id = ?""",
                (self.user_id,),
            )
            self.connection.execute(
                """DELETE ti FROM transaction_items ti
                   JOIN borrowing_transactions bt ON bt.transaction_id = ti.transaction_id
                   JOIN borrowing_requests br ON br.request_id = bt.request_id
                   WHERE br.account_id = ?""",
                (self.user_id,),
            )
            self.connection.execute(
                """DELETE bt FROM borrowing_transactions bt
                   JOIN borrowing_requests br ON br.request_id = bt.request_id
                   WHERE br.account_id = ?""",
                (self.user_id,),
            )
            self.connection.execute(
                """DELETE ri FROM borrowing_request_items ri
                   JOIN borrowing_requests br ON br.request_id = ri.request_id
                   WHERE br.account_id = ?""",
                (self.user_id,),
            )
            self.connection.execute("DELETE FROM borrowing_requests WHERE account_id = ?", (self.user_id,))
            self.connection.execute("DELETE FROM equipment WHERE equipment_id = ?", (self.equipment_id,))
            self.connection.execute("DELETE FROM accounts WHERE account_id IN (?, ?)", (self.user_id, self.staff_id))
            self.connection.execute("DELETE FROM equipment_categories WHERE category_name = ?", (self.category,))
        self.connection.close()

    def login(self, account_id):
        return self.client.post(
            "/api/auth/login",
            json={"id": account_id, "password": "test-password"},
        )

    def test_role_restrictions_and_invalid_login(self):
        self.assertEqual(self.login(self.user_id).status_code, 200)
        self.assertEqual(self.client.get("/api/staff/requests").status_code, 403)
        invalid = self.client.post("/api/auth/login", json={"id": self.user_id, "password": "wrong"})
        self.assertEqual(invalid.status_code, 401)

    def test_request_reservation_release_and_partial_return(self):
        self.assertEqual(self.login(self.user_id).status_code, 200)
        today = date.today()
        created = self.client.post(
            "/api/requests",
            json={
                "purpose": "MySQL integration test",
                "borrow": today.isoformat(),
                "returnBy": (today + timedelta(days=7)).isoformat(),
                "items": [{"id": self.equipment_id, "qty": 2}],
            },
        )
        self.assertEqual(created.status_code, 201, created.get_json())
        request_id = created.get_json()["request"]["id"]

        self.assertEqual(self.login(self.staff_id).status_code, 200)
        approved = self.client.post("/api/staff/requests/" + request_id + "/approve", json={})
        self.assertEqual(approved.status_code, 200, approved.get_json())
        available = next(
            row for row in self.client.get("/api/equipment").get_json()["items"]
            if row["id"] == self.equipment_id
        )["stock"]
        self.assertEqual(available, 3)

        released = self.client.post("/api/staff/requests/" + request_id + "/release", json={})
        self.assertEqual(released.status_code, 201, released.get_json())
        transaction_id = released.get_json()["transactionId"]
        transaction = self.client.get("/api/staff/transactions").get_json()["items"][0]
        item = transaction["items"][0]
        self.assertEqual(item["outstanding"], 2)

        self.assertEqual(self.login(self.user_id).status_code, 200)
        self.assertEqual(
            self.client.post("/api/transactions/" + transaction_id + "/return-request", json={}).status_code,
            200,
        )
        self.assertEqual(self.login(self.staff_id).status_code, 200)
        partial = self.client.post(
            "/api/staff/transactions/" + transaction_id + "/returns",
            json={"items": [{"transactionItemId": item["transactionItemId"], "quantity": 1, "condition": "Good"}]},
        )
        self.assertEqual(partial.status_code, 200, partial.get_json())
        self.assertEqual(partial.get_json()["status"], "Partially Returned")
        available = next(
            row for row in self.client.get("/api/equipment").get_json()["items"]
            if row["id"] == self.equipment_id
        )["stock"]
        self.assertEqual(available, 4)
        self.assertEqual(self.login(self.user_id).status_code, 200)
        self.assertEqual(
            self.client.post("/api/transactions/" + transaction_id + "/return-request", json={}).status_code,
            200,
        )
        self.assertEqual(self.login(self.staff_id).status_code, 200)
        final_item = self.client.get("/api/staff/transactions").get_json()["items"][0]["items"][0]
        completed = self.client.post(
            "/api/staff/transactions/" + transaction_id + "/returns",
            json={"items": [{"transactionItemId": final_item["transactionItemId"], "quantity": 1, "condition": "Good"}]},
        )
        self.assertEqual(completed.status_code, 200, completed.get_json())
        self.assertEqual(completed.get_json()["status"], "Returned")
        available = next(
            row for row in self.client.get("/api/equipment").get_json()["items"]
            if row["id"] == self.equipment_id
        )["stock"]
        self.assertEqual(available, 5)

    def test_extension_damage_and_lost_case_workflows(self):
        self.assertEqual(self.login(self.user_id).status_code, 200)
        today = date.today()
        created = self.client.post(
            "/api/requests",
            json={
                "purpose": "Extension and incident integration test",
                "borrow": today.isoformat(),
                "returnBy": (today + timedelta(days=7)).isoformat(),
                "items": [{"id": self.equipment_id, "qty": 2}],
            },
        )
        self.assertEqual(created.status_code, 201, created.get_json())
        request_id = created.get_json()["request"]["id"]

        self.assertEqual(self.login(self.staff_id).status_code, 200)
        self.assertEqual(self.client.post("/api/staff/requests/" + request_id + "/approve", json={}).status_code, 200)
        released = self.client.post("/api/staff/requests/" + request_id + "/release", json={})
        transaction_id = released.get_json()["transactionId"]

        self.assertEqual(self.login(self.user_id).status_code, 200)
        extension = self.client.post(
            "/api/extensions",
            json={
                "transactionId": transaction_id,
                "reason": "Additional experiment time",
                "newDueDate": (today + timedelta(days=14)).isoformat(),
            },
        )
        self.assertEqual(extension.status_code, 201, extension.get_json())
        extension_id = extension.get_json()["extensionId"]

        self.assertEqual(self.login(self.staff_id).status_code, 200)
        reviewed = self.client.post(
            "/api/staff/extensions/" + extension_id + "/approve",
            json={},
        )
        self.assertEqual(reviewed.status_code, 200, reviewed.get_json())
        transaction = next(
            row for row in self.client.get("/api/staff/transactions").get_json()["items"]
            if row["transactionId"] == transaction_id
        )
        self.assertTrue(transaction["returnBy"].startswith((today + timedelta(days=14)).isoformat()))

        item = transaction["items"][0]
        self.assertEqual(self.login(self.user_id).status_code, 200)
        self.assertEqual(
            self.client.post("/api/transactions/" + transaction_id + "/return-request", json={}).status_code,
            200,
        )
        self.assertEqual(self.login(self.staff_id).status_code, 200)
        damaged = self.client.post(
            "/api/staff/transactions/" + transaction_id + "/returns",
            json={"items": [{"transactionItemId": item["transactionItemId"], "quantity": 1, "condition": "Damaged"}]},
        )
        self.assertEqual(damaged.status_code, 200, damaged.get_json())
        self.assertEqual(damaged.get_json()["status"], "Partially Returned")
        self.assertEqual(self.client.get("/api/staff/cases").status_code, 200)

        lost = self.client.post(
            "/api/transactions/" + transaction_id + "/cases",
            json={
                "transactionItemId": item["transactionItemId"],
                "caseType": "Lost",
                "quantity": 1,
                "description": "Remaining unit was lost",
            },
        )
        self.assertEqual(lost.status_code, 200, lost.get_json())
        transactions = self.client.get("/api/staff/transactions").get_json()["items"]
        final = next(row for row in transactions if row["transactionId"] == transaction_id)
        self.assertEqual(final["status"], "lost")


if __name__ == "__main__":
    unittest.main()
