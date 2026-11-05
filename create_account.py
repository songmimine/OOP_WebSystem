"""Create a LabLink account with a Werkzeug password hash."""

import getpass

from werkzeug.security import generate_password_hash

from univ_lablink.database import connect


def main():
    identifier = input("Account identifier (e.g. student number or LAB-00001): ").strip()
    full_name = input("Full name: ").strip()
    email = input("University email: ").strip().lower()
    department = input("Department: ").strip()
    role = input("Role (user/laboratory_staff): ").strip()
    password = getpass.getpass("Password: ")
    if (
        not identifier or len(identifier) > 32
        or not full_name or len(full_name) > 120
        or not email or len(email) > 160 or "@" not in email
        or role not in ("user", "laboratory_staff")
    ):
        raise ValueError("Identifier, name, email, and a valid role are required.")
    if len(password) < 8:
        raise ValueError("Use a password with at least 8 characters.")

    connection = connect()
    try:
        with connection:
            connection.execute(
                """INSERT INTO accounts
                   (account_id, role_id, account_identifier, university_email, full_name,
                    department, password_hash)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    identifier,
                    role,
                    identifier,
                    email,
                    full_name,
                    department,
                    generate_password_hash(password),
                ),
            )
    finally:
        connection.close()
    print("Account created.")


if __name__ == "__main__":
    main()
