from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field


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


# === Расходы ===
class ExpenseCreate(BaseModel):
    category: str
    amount: float
    expense_date: date
    description: Optional[str] = None
    quantity: Optional[str] = None
    group_id: Optional[int] = None
    animal_id: Optional[int] = None


class ExpenseResponse(BaseModel):
    id: int
    category: str
    amount: float
    expense_date: date
    description: Optional[str] = None
    quantity: Optional[str] = None
    group_id: Optional[int] = None
    animal_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


# === Доходы ===
class IncomeCreate(BaseModel):
    category: str
    amount: float
    income_date: date
    description: Optional[str] = None
    weight_kg: Optional[float] = None
    animal_id: Optional[int] = None


class IncomeResponse(BaseModel):
    id: int
    category: str
    amount: float
    income_date: date
    description: Optional[str] = None
    weight_kg: Optional[float] = None
    animal_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True



# ==================== АВТОРИЗАЦИЯ ====================

class FarmRegister(BaseModel):
    farm_name: str = Field(..., min_length=2, max_length=200)
    region: Optional[str] = None
    district: Optional[str] = None
    inn: Optional[str] = None

    email: EmailStr
    password: str = Field(..., min_length=6, max_length=100)
    full_name: str = Field(..., min_length=2, max_length=200)
    nickname: Optional[str] = None
    phone: Optional[str] = None
    birth_date: Optional[date] = None


class UserJoin(BaseModel):
    invite_code: str = Field(..., min_length=6, max_length=20)
    role: str = "worker"

    email: EmailStr
    password: str = Field(..., min_length=6, max_length=100)
    full_name: str = Field(..., min_length=2, max_length=200)
    nickname: Optional[str] = None
    phone: Optional[str] = None
    birth_date: Optional[date] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    nickname: Optional[str] = None
    phone: Optional[str] = None
    birth_date: Optional[date] = None
    avatar_url: Optional[str] = None
    role: str
    farm_id: int
    settings: Optional[str] = None
    created_at: datetime
    last_login_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class FarmResponse(BaseModel):
    id: int
    name: str
    region: Optional[str] = None
    district: Optional[str] = None
    inn: Optional[str] = None
    invite_code: str
    created_at: datetime

    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
    farm: FarmResponse


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    nickname: Optional[str] = None
    phone: Optional[str] = None
    birth_date: Optional[date] = None
    avatar_url: Optional[str] = None
    settings: Optional[str] = None


class FarmUpdate(BaseModel):
    name: Optional[str] = None
    region: Optional[str] = None
    district: Optional[str] = None
    inn: Optional[str] = None


class ChangePassword(BaseModel):
    old_password: str
    new_password: str = Field(..., min_length=6, max_length=100)