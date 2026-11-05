from werkzeug.security import check_password_hash


class Account:
    def __init__(
        self,
        account_id,
        name,
        role,
        account_identifier=None,
        email="",
        department="",
        password_hash="",
        account_status="Active",
    ):
        self.id = account_id
        self.account_identifier = account_identifier or account_id
        self.name = name
        self.role = role
        self.email = email
        self.department = department
        self._password_hash = password_hash
        self.account_status = account_status

    @classmethod
    def authenticate(cls, connection, identifier, password):
        from .laboratory_staff import LaboratoryStaff
        from .user import User

        row = connection.execute(
            """SELECT a.account_id, a.account_identifier, a.full_name, a.role_id,
                      a.university_email, a.department, a.password_hash, a.account_status
               FROM accounts a
               WHERE a.account_identifier = ? AND a.account_status = 'Active'""",
            (identifier,),
        ).fetchone()
        if not row or not check_password_hash(row["password_hash"], password):
            return None

        role = row["role_id"]
        if role not in ("user", "laboratory_staff"):
            return None
        account_class = LaboratoryStaff if role == "laboratory_staff" else User
        return account_class(
            row["account_id"],
            row["full_name"],
            role,
            row["account_identifier"],
            row["university_email"],
            row["department"],
            row["password_hash"],
            row["account_status"],
        )

    def display_dashboard(self):
        return "index.html"
