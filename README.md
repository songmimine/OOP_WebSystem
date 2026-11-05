# University LabLink

University LabLink is a Flask application for laboratory equipment borrowing and management at LPU Cavite. The student and laboratory-staff pages use the same SQLite database and Flask session, so catalog updates, requests, releases, returns, and reports stay synchronized.

## Run locally

```powershell
python -m pip install -r requirements.txt
python app.py
```

Open `http://127.0.0.1:5000`. On first startup, Flask creates `instance/lablink.sqlite3`, initializes the schema, and seeds the existing demo equipment list and accounts:

| Role | User ID | Password |
|---|---|---|
| Laboratory staff | `LAB-00001` | `lab123` |
| User | `2025-2-00001` | `lab123` |
| User | `2025-2-00002` | `cha123` |

Set `LABLINK_SECRET_KEY` to a stable, randomly generated secret before using the app beyond local development. Set `LABLINK_DATABASE` to select another SQLite database path. Uploaded equipment images are stored in `univ_lablink/uploads/` and served to both dashboards.

## Borrowing workflow

1. A user browses the database-backed catalog and submits a request for available equipment.
2. Laboratory staff review and approve or reject the request. Approval alone does not reserve or release items.
3. Staff record the physical equipment release to create the borrowing transaction and reduce availability.
4. The user submits a return for inspection. Staff record actual quantities, condition, and notes before the return updates availability and history. Partial returns leave the outstanding balance active.
5. Damaged, lost, overdue, and improperly returned items are recorded as laboratory cases and included in reports.

The database schema and local seed initialization live in `univ_lablink/database.py`; Flask routes and application operations are in `app.py`. SQLite is used because this repository did not include a database connection or MySQL credentials. The application remains within the proposal's stated borrowing, inventory, and incident-recording scope.
