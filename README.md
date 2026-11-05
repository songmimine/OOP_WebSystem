# University LabLink

University LabLink is the existing LabLink student and laboratory-staff portal, now backed by Flask and **MySQL only**. It preserves the current HTML, CSS, and JavaScript screens while storing accounts, inventory, borrowing requests, releases, returns, extensions, settings, and incidents in the `university_lablink` MySQL database. The Python domain classes use native inheritance and handle the application's borrowing and inventory rules.

## Requirements

- Python 3.10 or later
- MySQL Server 8.0 or later and MySQL Workbench
- Visual Studio Code (optional)

The app uses Flask, `mysql-connector-python`, and Werkzeug password hashing. It does not use SQLite or an ORM.

## Set up MySQL

1. Start MySQL Server and open MySQL Workbench.
2. Open `univ_lablink/database/schema.sql` in Workbench and execute the complete script. It creates `university_lablink` and its eleven domain tables, indexes, constraints, and foreign keys.
3. Configure the application account in the local environment file. From the repository root in PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

   Edit `.env` and set `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`, and a long random `LABLINK_SECRET_KEY`. Keep `.env` private; it is ignored by Git.
4. Install dependencies and optionally add demo data:

   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   python -m pip install -r requirements.txt
   python -m univ_lablink.seed
   ```

   The seed script is repeatable and inserts sample accounts, categories, equipment, and settings only when their unique identifiers are unused. Demo credentials are for local development only:

   | Role | Identifier | Password |
   |---|---|---|
   | Laboratory staff | `LAB-00001` | `lab123` |
   | User | `2025-2-00001` | `lab123` |
   | User | `2025-2-00002` | `cha123` |

5. To add an account with a new password hash, run `python create_account.py` and answer its prompts. Supported roles are `user` and `laboratory_staff`.

## Run in VS Code

Open the repository folder in VS Code, select the `.venv` Python interpreter, and run in the integrated terminal:

```powershell
python app.py
```

Open `http://127.0.0.1:5000` in a browser. Serve the site through Flask rather than opening the HTML files directly, so page navigation, sessions, API requests, and uploaded equipment images work. Use Ctrl+C in the terminal to stop Flask.

## Borrowing workflow

1. Users sign in, browse/search the MySQL-backed catalog, and submit requests with one or more items.
2. Staff approve or reject pending requests. Approval locks the inventory rows and reserves the requested quantities in the same MySQL transaction as the decision; a failed reservation rolls the entire approval back.
3. Staff release approved items. Release creates the borrowing transaction and item records without reducing availability again.
4. Users submit a return request. Staff record full or partial quantities, inspected condition, and notes. Good items return to available stock; repair/damaged items remain unavailable; damaged or lost items create incidents.
5. Users can request a later deadline. The transaction due date changes only when staff approves the extension. Staff can create and resolve incident records, including overdue cases.

Staff-only operations are protected by role checks on the server. Passwords are hashed, account status is checked during authentication and subsequent requests, and all SQL values use parameterized queries.

## API and implementation

The original browser code continues to use its existing API paths. The Flask app also exposes the proposal's `/api/auth/*`, `/api/categories`, `/api/staff/*`, and `/api/dashboard/user` endpoints. Route logic is in `app.py`; direct MySQL connection helpers are in `univ_lablink/database.py`; native domain classes are in `univ_lablink/classes/`; the schema is in `univ_lablink/database/schema.sql`.

The schema must be imported into MySQL before starting the app. Database connection failures are reported in the Flask server log and returned as explicit API errors; the application does not silently fall back to another database.

## Tests

The integration tests use the configured `university_lablink` MySQL database and clean up their uniquely prefixed fixture records. First import the schema and set the `.env` values above, then opt in to running them:

```powershell
$env:LABLINK_RUN_MYSQL_TESTS = "1"
python -m unittest discover -s tests -v
```

The suite covers authentication and role restrictions, request submission, reservation at approval, release without a second deduction, partial and full returns, extension approval, and damaged/lost incident handling. It is skipped by default to avoid writing to a developer's database unintentionally. No SQLite test or fallback database is used.
