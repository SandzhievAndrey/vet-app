from datetime import datetime, date
from typing import Optional
from sqlalchemy import (
    create_engine, Column, Integer, String, Boolean,
    Date, DateTime, ForeignKey, Text, Enum as SQLEnum, Float
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
import enum

DATABASE_URL = "sqlite:///./vet.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


class AnimalStatus(str, enum.Enum):
    ACTIVE = "active"
    SOLD = "sold"
    DEAD = "dead"
    SLAUGHTERED = "slaughtered"


class Sex(str, enum.Enum):
    MALE = "male"
    FEMALE = "female"


class ExpenseCategory(str, enum.Enum):
    FEED = "feed"              # Корм (сено, комбикорм, силос)
    SALARY = "salary"          # Зарплата
    VET = "vet"                # Ветеринария
    FUEL = "fuel"              # Бензин / ГСМ
    UTILITIES = "utilities"    # Содержание (электричество, вода)
    EQUIPMENT = "equipment"    # Оборудование, инвентарь
    TAXES = "taxes"            # Налоги, взносы
    OTHER = "other"            # Прочее


class IncomeCategory(str, enum.Enum):
    MEAT = "meat"              # Продажа мяса
    LIVESTOCK = "livestock"    # Продажа скота
    MILK = "milk"              # Продажа молока
    BYPRODUCTS = "byproducts"  # Субпродукты, шкуры
    SUBSIDY = "subsidy"        # Субсидии
    OTHER = "other"            # Прочее


class Animal(Base):
    __tablename__ = "animals"

    id = Column(Integer, primary_key=True, index=True)
    tag_number = Column(String, unique=True, index=True, nullable=False)
    chip_number = Column(String, unique=True, nullable=True)
    name = Column(String, nullable=True)
    sex = Column(SQLEnum(Sex), nullable=False)
    birth_date = Column(Date, nullable=True)
    breed = Column(String, default="Калмыцкая")
    color = Column(String, nullable=True)

    mother_id = Column(Integer, ForeignKey("animals.id"), nullable=True)
    father_id = Column(Integer, ForeignKey("animals.id"), nullable=True)

    status = Column(SQLEnum(AnimalStatus), default=AnimalStatus.ACTIVE)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=True)

    photo_url = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.now)

    group = relationship("Group", back_populates="animals")
    vaccinations = relationship("Vaccination", back_populates="animal", cascade="all, delete-orphan")
    events = relationship("AnimalEvent", back_populates="animal", cascade="all, delete-orphan")


class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.now)

    animals = relationship("Animal", back_populates="group")


class Vaccine(Base):
    __tablename__ = "vaccines"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    disease = Column(String, nullable=False)
    manufacturer = Column(String, nullable=True)
    dose_ml = Column(String, nullable=True)
    notes = Column(Text, nullable=True)


class Vaccination(Base):
    __tablename__ = "vaccinations"

    id = Column(Integer, primary_key=True)
    animal_id = Column(Integer, ForeignKey("animals.id"), nullable=False)
    vaccine_id = Column(Integer, ForeignKey("vaccines.id"), nullable=False)

    recommended_date = Column(Date, nullable=True)
    planned_date = Column(Date, nullable=False)
    actual_date = Column(Date, nullable=True)
    is_done = Column(Boolean, default=False)

    vet_name = Column(String, nullable=True)
    dose_used = Column(String, nullable=True)
    notes = Column(Text, nullable=True)

    animal = relationship("Animal", back_populates="vaccinations")
    vaccine = relationship("Vaccine")


class AnimalEvent(Base):
    __tablename__ = "animal_events"

    id = Column(Integer, primary_key=True)
    animal_id = Column(Integer, ForeignKey("animals.id"), nullable=False)
    event_type = Column(String, nullable=False)
    event_date = Column(Date, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.now)

    animal = relationship("Animal", back_populates="events")


class Expense(Base):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True)
    category = Column(SQLEnum(ExpenseCategory), nullable=False)
    amount = Column(Float, nullable=False)         # сумма в рублях
    expense_date = Column(Date, nullable=False)
    description = Column(String, nullable=True)
    quantity = Column(String, nullable=True)       # например, "5 тонн"
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=True)
    animal_id = Column(Integer, ForeignKey("animals.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.now)


class Income(Base):
    __tablename__ = "incomes"

    id = Column(Integer, primary_key=True)
    category = Column(SQLEnum(IncomeCategory), nullable=False)
    amount = Column(Float, nullable=False)
    income_date = Column(Date, nullable=False)
    description = Column(String, nullable=True)
    weight_kg = Column(Float, nullable=True)       # вес (для продажи мяса)
    animal_id = Column(Integer, ForeignKey("animals.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.now)


Base.metadata.create_all(bind=engine)