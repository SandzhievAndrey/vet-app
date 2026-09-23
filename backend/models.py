from datetime import datetime, date
from typing import Optional
from sqlalchemy import (
    create_engine, Column, Integer, String, Boolean,
    Date, DateTime, ForeignKey, Text, Enum as SQLEnum
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
import enum

DATABASE_URL = "sqlite:///./vet.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


class AnimalStatus(str, enum.Enum):
    ACTIVE = "active"        # в хозяйстве
    SOLD = "sold"            # продан
    DEAD = "dead"            # падёж
    SLAUGHTERED = "slaughtered"  # забит


class Sex(str, enum.Enum):
    MALE = "male"
    FEMALE = "female"


class Animal(Base):
    __tablename__ = "animals"

    id = Column(Integer, primary_key=True, index=True)
    tag_number = Column(String, unique=True, index=True, nullable=False)  # номер бирки
    chip_number = Column(String, unique=True, nullable=True)              # номер чипа
    name = Column(String, nullable=True)
    sex = Column(SQLEnum(Sex), nullable=False)
    birth_date = Column(Date, nullable=True)
    breed = Column(String, default="Калмыцкая")
    color = Column(String, nullable=True)       # масть

    # Племенной учёт
    mother_id = Column(Integer, ForeignKey("animals.id"), nullable=True)
    father_id = Column(Integer, ForeignKey("animals.id"), nullable=True)

    # Статус
    status = Column(SQLEnum(AnimalStatus), default=AnimalStatus.ACTIVE)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=True)

    # Служебное
    photo_url = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.now)

    # Связи
    group = relationship("Group", back_populates="animals")
    vaccinations = relationship("Vaccination", back_populates="animal", cascade="all, delete-orphan")
    events = relationship("AnimalEvent", back_populates="animal", cascade="all, delete-orphan")


class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)          # "Гурт №1", "Стельные коровы"
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.now)

    animals = relationship("Animal", back_populates="group")


class Vaccine(Base):
    __tablename__ = "vaccines"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)          # "Вакцина против сибирской язвы"
    disease = Column(String, nullable=False)       # "Сибирская язва"
    manufacturer = Column(String, nullable=True)
    dose_ml = Column(String, nullable=True)        # "2.0 мл"
    notes = Column(Text, nullable=True)


class Vaccination(Base):
    __tablename__ = "vaccinations"

    id = Column(Integer, primary_key=True)
    animal_id = Column(Integer, ForeignKey("animals.id"), nullable=False)
    vaccine_id = Column(Integer, ForeignKey("vaccines.id"), nullable=False)

    planned_date = Column(Date, nullable=False)    # когда по плану
    actual_date = Column(Date, nullable=True)      # когда сделали
    is_done = Column(Boolean, default=False)
    vet_name = Column(String, nullable=True)       # кто делал
    dose_used = Column(String, nullable=True)
    notes = Column(Text, nullable=True)

    animal = relationship("Animal", back_populates="vaccinations")
    vaccine = relationship("Vaccine")


class AnimalEvent(Base):
    """Общие события: отёл, перевод в группу, продажа, падёж."""
    __tablename__ = "animal_events"

    id = Column(Integer, primary_key=True)
    animal_id = Column(Integer, ForeignKey("animals.id"), nullable=False)
    event_type = Column(String, nullable=False)   # "calving", "transfer", "sold", "dead"
    event_date = Column(Date, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.now)

    animal = relationship("Animal", back_populates="events")


Base.metadata.create_all(bind=engine)