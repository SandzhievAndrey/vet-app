from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel


# === Animal ===
class AnimalBase(BaseModel):
    tag_number: str
    chip_number: Optional[str] = None
    name: Optional[str] = None
    sex: str
    birth_date: Optional[date] = None
    breed: Optional[str] = "Калмыцкая"
    color: Optional[str] = None
    mother_id: Optional[int] = None
    father_id: Optional[int] = None
    group_id: Optional[int] = None
    notes: Optional[str] = None


class AnimalCreate(AnimalBase):
    pass


class AnimalUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    group_id: Optional[int] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class AnimalResponse(AnimalBase):
    id: int
    status: str
    photo_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# === Group ===
class GroupBase(BaseModel):
    name: str
    description: Optional[str] = None


class GroupCreate(GroupBase):
    pass

class GroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class GroupResponse(GroupBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# === Vaccine ===
class VaccineBase(BaseModel):
    name: str
    disease: str
    manufacturer: Optional[str] = None
    dose_ml: Optional[str] = None
    notes: Optional[str] = None


class VaccineCreate(VaccineBase):
    pass


class VaccineResponse(VaccineBase):
    id: int

    class Config:
        from_attributes = True


# === Vaccination ===
class VaccinationBase(BaseModel):
    animal_id: int
    vaccine_id: int
    planned_date: date
    recommended_date: Optional[date] = None
    notes: Optional[str] = None


class VaccinationCreate(VaccinationBase):
    pass


class VaccinationComplete(BaseModel):
    actual_date: date
    vet_name: Optional[str] = None
    dose_used: Optional[str] = None
    notes: Optional[str] = None


class VaccinationResponse(VaccinationBase):
    id: int
    actual_date: Optional[date] = None
    is_done: bool
    vet_name: Optional[str] = None
    dose_used: Optional[str] = None

    class Config:
        from_attributes = True


# === Event ===
class EventBase(BaseModel):
    animal_id: int
    event_type: str
    event_date: date
    description: Optional[str] = None


class EventCreate(EventBase):
    pass


class EventResponse(EventBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

# === Гуртовая вакцинация ===
class GroupCompleteRequest(BaseModel):
    disease: str
    actual_date: date
    vet_name: Optional[str] = None
    dose_used: Optional[str] = None

# === Управление составом гурта ===
class GroupAssignRequest(BaseModel):
    animal_ids: list[int]
    action: str  # "add" | "remove"