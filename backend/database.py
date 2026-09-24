"""Подключение к БД как отдельная зависимость FastAPI.

Вынесено отдельно от main.py, чтобы auth.py мог использовать get_db
без циклического импорта.
"""

from models import SessionLocal


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()