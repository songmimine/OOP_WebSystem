"""Environment-backed MySQL and Flask configuration."""

import os

from dotenv import load_dotenv

load_dotenv()

MYSQL_CONFIG = {
    "host": os.environ.get("MYSQL_HOST", "127.0.0.1"),
    "port": int(os.environ.get("MYSQL_PORT", "3306")),
    "user": os.environ.get("MYSQL_USER", "root"),
    "password": os.environ.get("MYSQL_PASSWORD", ""),
    "database": os.environ.get("MYSQL_DATABASE", "university_lablink"),
    "charset": "utf8mb4",
    "use_unicode": True,
}

SECRET_KEY = os.environ.get("LABLINK_SECRET_KEY")
