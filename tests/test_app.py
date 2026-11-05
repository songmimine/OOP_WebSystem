import io
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

import app as lablink
from univ_lablink.database import initialize


class LabLinkApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        lablink.app.config.update(TESTING=True, DATABASE=str(Path(self.temp.name) / "lablink.sqlite3"))
        self.original_uploads = lablink.UPLOADS
        lablink.UPLOADS = Path(self.temp.name) / "uploads"
        lablink.UPLOADS.mkdir()
        initialize(lablink.app.config["DATABASE"])
        self.client = lablink.app.test_client()

    def tearDown(self):
        lablink.UPLOADS = self.original_uploads
        self.temp.cleanup()

    def login(self, account_id):
        password = "cha123" if account_id == "2025-2-00002" else "lab123"
        response = self.client.post("/api/login", json={"id": account_id, "password": password})
        self.assertEqual(response.status_code, 200, response.get_json())
        return response.get_json()

    def create_request(self, items, return_offset=7):
        start = date.today()
        response = self.client.post(
            "/api/requests",
            json={
                "purpose": "Chemistry research",
                "borrow": start.isoformat(),
                "returnBy": (start + timedelta(days=return_offset)).isoformat(),
                "items": items,
            },
        )
        self.assertEqual(response.status_code, 201, response.get_json())
        return response.get_json()["request"]

    def test_request_approval_release_partial_return_and_history(self):
        self.login("2025-2-00001")
        catalog = self.client.get("/api/equipment").get_json()["items"]
        item = catalog[0]
        request = self.create_request([{"id": item["id"], "qty": 2}])
        self.assertEqual(self.client.get("/api/equipment").get_json()["items"][0]["stock"], item["stock"])

        self.login("LAB-00001")
        self.assertEqual(self.client.get("/api/dashboard").get_json()["stats"]["pending"], 1)
        self.assertEqual(self.client.get("/api/notifications").get_json()["count"], 1)
        decision = self.client.patch("/api/requests/" + request["id"], json={"status": "approved"})
        self.assertEqual(decision.status_code, 200, decision.get_json())
        self.assertEqual(self.client.get("/api/equipment").get_json()["items"][0]["stock"], item["stock"])
        release = self.client.post("/api/requests/" + request["id"] + "/release", json={})
        self.assertEqual(release.status_code, 201, release.get_json())
        transaction_id = release.get_json()["transactionId"]

        self.login("LAB-00001")
        transaction = self.client.get("/api/transactions").get_json()["items"][0]
        item_row = transaction["items"][0]
        not_submitted = self.client.post(
            "/api/transactions/" + transaction_id + "/returns",
            json={"items": [{"transactionItemId": item_row["transactionItemId"], "quantity": 1, "condition": "Good"}]},
        )
        self.assertEqual(not_submitted.status_code, 400)

        self.login("2025-2-00001")
        transaction = self.client.get("/api/transactions").get_json()["items"][0]
        self.assertEqual(transaction["transactionId"], transaction_id)
        self.assertEqual(transaction["status"], "active")
        extension = self.client.post(
            "/api/transactions/" + transaction_id + "/extensions",
            json={"reason": "Additional lab time", "newDueDate": (date.today() + timedelta(days=14)).isoformat()},
        )
        self.assertEqual(extension.status_code, 201, extension.get_json())
        duplicate_extension = self.client.post(
            "/api/transactions/" + transaction_id + "/extensions",
            json={"reason": "Another request", "newDueDate": (date.today() + timedelta(days=21)).isoformat()},
        )
        self.assertEqual(duplicate_extension.status_code, 400)

        self.login("LAB-00001")
        extension_row = self.client.get("/api/transactions").get_json()["items"][0]
        self.assertEqual(
            self.client.patch("/api/extensions/" + extension_row["extensionId"], json={"status": "approved"}).status_code,
            200,
        )

        self.login("2025-2-00001")
        self.assertEqual(self.client.post("/api/transactions/" + transaction_id + "/return-request", json={}).status_code, 200)

        self.login("LAB-00001")
        transaction = self.client.get("/api/transactions").get_json()["items"][0]
        item_row = transaction["items"][0]
        partial = self.client.post(
            "/api/transactions/" + transaction_id + "/returns",
            json={"items": [{"transactionItemId": item_row["transactionItemId"], "quantity": 1, "condition": "Good"}]},
        )
        self.assertEqual(partial.status_code, 200, partial.get_json())
        self.assertEqual(partial.get_json()["status"], "Partially Returned")
        history = self.client.get("/api/history").get_json()["items"]
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["userId"], "2025-2-00001")
        self.assertEqual(history[0]["userName"], "Katrina Mendoza")
        self.assertEqual(history[0]["items"][0]["returned"], 1)

        self.login("2025-2-00001")
        self.assertEqual(self.client.post("/api/transactions/" + transaction_id + "/return-request", json={}).status_code, 200)
        self.login("LAB-00001")
        remaining = self.client.get("/api/transactions").get_json()["items"][0]["items"][0]
        completed = self.client.post(
            "/api/transactions/" + transaction_id + "/returns",
            json={"items": [{"transactionItemId": remaining["transactionItemId"], "quantity": 1, "condition": "Good"}]},
        )
        self.assertEqual(completed.get_json()["status"], "Returned")
        reports = self.client.get("/api/reports").get_json()
        self.assertEqual(reports["summary"]["returnedTransactions"], 1)
        exported = self.client.get("/api/reports/export")
        self.assertEqual(exported.status_code, 200)
        self.assertIn(b"2025-2-00001", exported.data)

    def test_equipment_image_is_shared_and_rejects_invalid_upload(self):
        self.login("LAB-00001")
        bad = self.client.post(
            "/api/equipment",
            data={"name": "Bad upload", "category": "Equipment & Machines", "stock": "1",
                  "image": (io.BytesIO(b"not an image"), "bad.png")},
            content_type="multipart/form-data",
        )
        self.assertEqual(bad.status_code, 400)
        good = self.client.post(
            "/api/equipment",
            data={"name": "Lab Camera", "detail": "Digital", "category": "Equipment & Machines",
                  "location": "Lab 1", "unit": "units", "totalQuantity": "2",
                  "image": (io.BytesIO(b"\x89PNG\r\n\x1a\nvalid-test-image"), "camera.png")},
            content_type="multipart/form-data",
        )
        self.assertEqual(good.status_code, 201, good.get_json())
        image_url = good.get_json()["item"]["image"]
        self.assertTrue(image_url.startswith("/uploads/"))
        self.login("2025-2-00001")
        shared = [item for item in self.client.get("/api/equipment").get_json()["items"] if item["name"] == "Lab Camera"]
        self.assertEqual(shared[0]["image"], image_url)

        self.login("LAB-00001")
        updated = self.client.patch(
            "/api/equipment/" + good.get_json()["item"]["id"],
            data={"name": "Shared Lab Camera", "detail": "Updated model", "category": "Equipment & Machines",
                  "location": "Lab 2", "unit": "units", "totalQuantity": "3",
                  "image": (io.BytesIO(b"\x89PNG\r\n\x1a\nupdated-test-image"), "updated-camera.png")},
            content_type="multipart/form-data",
        )
        self.assertEqual(updated.status_code, 200, updated.get_json())
        self.login("2025-2-00001")
        catalog = self.client.get("/api/equipment").get_json()["items"]
        shared_update = next(item for item in catalog if item["id"] == good.get_json()["item"]["id"])
        self.assertEqual(shared_update["name"], "Shared Lab Camera")
        self.assertEqual(shared_update["detail"], "Updated model")
        self.assertEqual(shared_update["totalQuantity"], 3)
        self.assertNotEqual(shared_update["image"], image_url)
        stored_image = Path(lablink.UPLOADS) / Path(shared_update["image"]).name
        self.assertTrue(stored_image.is_file())

    def test_request_quantity_validation_and_case_records(self):
        self.login("2025-2-00001")
        item = self.client.get("/api/equipment").get_json()["items"][0]
        too_many = self.client.post("/api/requests", json={
            "purpose": "Research", "borrow": date.today().isoformat(),
            "returnBy": (date.today() + timedelta(days=2)).isoformat(),
            "items": [{"id": item["id"], "qty": item["stock"] + 1}],
        })
        self.assertEqual(too_many.status_code, 400)
        request = self.create_request([{"id": item["id"], "qty": 1}])
        self.login("LAB-00001")
        self.client.patch("/api/requests/" + request["id"], json={"status": "approved"})
        transaction_id = self.client.post("/api/requests/" + request["id"] + "/release", json={}).get_json()["transactionId"]
        transaction = self.client.get("/api/transactions").get_json()["items"][0]
        borrowed_item = transaction["items"][0]
        case = self.client.post("/api/transactions/" + transaction_id + "/cases", json={
            "transactionItemId": borrowed_item["transactionItemId"],
            "caseType": "Lost", "quantity": 1, "description": "Item reported lost",
        })
        self.assertEqual(case.status_code, 200, case.get_json())
        self.assertEqual(self.client.get("/api/reports").get_json()["summary"]["cases"], 1)
        self.assertEqual(self.client.get("/api/transactions").get_json()["items"][0]["status"], "lost")

    def test_admin_can_toggle_equipment_borrow_status(self):
        self.login("LAB-00001")
        equipment_id = "EQ-001"
        unavailable = self.client.patch(
            "/api/equipment/" + equipment_id,
            json={"borrowStatus": "Unavailable"},
        )
        self.assertEqual(unavailable.status_code, 200, unavailable.get_json())
        self.assertEqual(unavailable.get_json()["item"]["borrowStatus"], "Unavailable")

        self.login("2025-2-00001")
        equipment = next(
            item for item in self.client.get("/api/equipment").get_json()["items"]
            if item["id"] == equipment_id
        )
        self.assertEqual(equipment["status"], "Unavailable")
        rejected_request = self.client.post("/api/requests", json={
            "purpose": "Research", "borrow": date.today().isoformat(),
            "returnBy": (date.today() + timedelta(days=2)).isoformat(),
            "items": [{"id": equipment_id, "qty": 1}],
        })
        self.assertEqual(rejected_request.status_code, 400)

        self.login("LAB-00001")
        available = self.client.patch(
            "/api/equipment/" + equipment_id,
            json={"borrowStatus": "Available"},
        )
        self.assertEqual(available.status_code, 200, available.get_json())
        self.assertEqual(available.get_json()["item"]["status"], "Available")


if __name__ == "__main__":
    unittest.main()
