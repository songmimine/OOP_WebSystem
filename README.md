# University LabLink

University LabLink is a Flask-served frontend prototype for the LPU Cavite laboratory equipment borrowing system. The student and admin screens share a browser-local demo store, so the main equipment request and return flow can be tried before connecting a database or API.

## Run locally

Install Flask if needed, then run:

```powershell
python -m pip install flask
python app.py
```

Open `http://127.0.0.1:5000`. The existing demo accounts are `2025-2-00001` / `lab123` for a student and `LAB-00001` / `lab123` for an administrator.

## Try the demo flow

1. Browse the equipment catalog, select items, and submit a borrowing request.
2. Sign in as the administrator to approve or reject it.
3. Sign back in as the student to confirm pickup, request a return or extension, and view request status.
4. Sign in as the administrator again to approve a return, flag damaged equipment, or manage inventory and settings.

Inventory, requests, profiles, and demo settings are stored in the browser's `localStorage`; they are not shared across browsers and are not a substitute for backend validation. Clear this site's browser storage to reset the prototype data.