from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from models import (
    SessionLocal, Animal, Group, Vaccine, Vaccination, AnimalEvent,
    AnimalStatus, Sex
)
from schemas import (
    AnimalCreate, AnimalUpdate, AnimalResponse,
    GroupCreate, GroupResponse,
    VaccineCreate, VaccineResponse,
    VaccinationCreate, VaccinationComplete, VaccinationResponse,
    EventCreate, EventResponse,
)
from vaccination_schedule import (
    generate_schedule_for_animal,
    generate_schedule_for_pregnant,
    VACCINATION_SCHEMES,
)


app = FastAPI(title="Vet App API — Калмыкия КРС")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== ОБРАБОТКА ОШИБОК ВАЛИДАЦИИ ====================

FIELD_NAMES = {
    "tag_number": "Номер бирки",
    "chip_number": "Номер чипа",
    "name": "Кличка",
    "sex": "Пол",
    "birth_date": "Дата рождения",
    "breed": "Порода",
    "color": "Масть",
    "group_id": "Группа",
    "notes": "Заметки",
    "animal_id": "Животное",
    "vaccine_id": "Вакцина",
    "planned_date": "Плановая дата",
    "actual_date": "Фактическая дата",
    "vet_name": "Ветеринар",
    "dose_used": "Доза",
    "event_type": "Тип события",
    "event_date": "Дата события",
    "description": "Описание",
    "title": "Название",
}


@app.exception_handler(RequestValidationError)
async def validation_handler(request, exc: RequestValidationError):
    errors = {}
    for e in exc.errors():
        loc = e["loc"]
        field = loc[-1] if len(loc) > 1 else "body"
        msg = e.get("msg", "")
        etype = e.get("type", "")

        if "field required" in msg.lower():
            msg = "Обязательное поле"
        elif "not a valid date" in msg.lower():
            msg = "Неверный формат даты"
        elif "date_from_datetime_parsing" in etype:
            msg = "Неверный формат даты"
        elif "not a valid integer" in msg.lower():
            msg = "Должно быть число"
        elif "int_parsing" in etype:
            msg = "Должно быть целое число"
        elif "string_too_short" in etype:
            msg = "Слишком короткое значение"
        elif "string_too_long" in etype:
            msg = "Слишком длинное значение"
        elif "value_error" in etype:
            msg = "Неверное значение"

        field_label = FIELD_NAMES.get(field, field)
        errors[field] = f"{field_label}: {msg}"

    return JSONResponse(
        status_code=422,
        content={
            "detail": "Проверьте правильность заполнения полей",
            "errors": errors,
        },
    )


# ==================== БАЗА ====================

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ==================== ANIMALS ====================

@app.get("/api/animals", response_model=list[AnimalResponse])
def list_animals(
    status: Optional[str] = None,
    group_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Animal)
    if status:
        q = q.filter(Animal.status == status)
    if group_id:
        q = q.filter(Animal.group_id == group_id)
    return q.order_by(Animal.tag_number).all()


@app.post("/api/animals", response_model=AnimalResponse, status_code=201)
def create_animal(data: AnimalCreate, db: Session = Depends(get_db)):
    errors = {}

    # Уникальность бирки
    tag = data.tag_number.strip()
    if not tag:
        errors["tag_number"] = "Номер бирки не может быть пустым"
    elif len(tag) < 3:
        errors["tag_number"] = "Номер бирки слишком короткий (минимум 3 символа)"
    elif len(tag) > 50:
        errors["tag_number"] = "Номер бирки слишком длинный (максимум 50 символов)"
    else:
        existing = db.query(Animal).filter(Animal.tag_number == tag).first()
        if existing:
            errors["tag_number"] = f"Бирка {tag} уже используется другим животным"

    # Уникальность чипа
    if data.chip_number:
        chip = data.chip_number.strip()
        if chip:
            chip_existing = (
                db.query(Animal).filter(Animal.chip_number == chip).first()
            )
            if chip_existing:
                errors["chip_number"] = f"Чип {chip} уже используется"

    # Дата рождения
    if data.birth_date:
        if data.birth_date > date.today():
            errors["birth_date"] = "Дата рождения не может быть в будущем"
        else:
            min_date = date.today() - timedelta(days=365 * 30)
            if data.birth_date < min_date:
                errors["birth_date"] = "Дата рождения более 30 лет назад — проверьте"

    # Пол
    if data.sex not in ("male", "female"):
        errors["sex"] = "Пол должен быть male или female"

    # Кличка
    if data.name and len(data.name) > 100:
        errors["name"] = "Кличка слишком длинная (максимум 100 символов)"

    # Порода
    if data.breed and len(data.breed) > 100:
        errors["breed"] = "Название породы слишком длинное"

    # Группа
    if data.group_id:
        group = db.query(Group).filter(Group.id == data.group_id).first()
        if not group:
            errors["group_id"] = f"Группа #{data.group_id} не найдена"

    # Мать / отец
    if data.mother_id:
        mother = db.query(Animal).filter(Animal.id == data.mother_id).first()
        if not mother:
            errors["mother_id"] = f"Мать #{data.mother_id} не найдена"
        elif mother.sex != Sex.FEMALE:
            errors["mother_id"] = "Мать должна быть женского пола"

    if data.father_id:
        father = db.query(Animal).filter(Animal.id == data.father_id).first()
        if not father:
            errors["father_id"] = f"Отец #{data.father_id} не найден"
        elif father.sex != Sex.MALE:
            errors["father_id"] = "Отец должен быть мужского пола"

    if errors:
        raise HTTPException(
            status_code=400,
            detail={"message": "Проверьте поля формы", "errors": errors},
        )

    animal = Animal(
        tag_number=tag,
        chip_number=data.chip_number.strip() if data.chip_number else None,
        name=data.name.strip() if data.name else None,
        sex=Sex(data.sex),
        birth_date=data.birth_date,
        breed=(data.breed or "Калмыцкая").strip(),
        color=data.color.strip() if data.color else None,
        mother_id=data.mother_id,
        father_id=data.father_id,
        group_id=data.group_id,
        notes=data.notes,
    )
    db.add(animal)
    db.commit()
    db.refresh(animal)
    return animal


@app.get("/api/animals/{animal_id}", response_model=AnimalResponse)
def get_animal(animal_id: int, db: Session = Depends(get_db)):
    animal = db.query(Animal).filter(Animal.id == animal_id).first()
    if not animal:
        raise HTTPException(status_code=404, detail="Животное не найдено")
    return animal


@app.patch("/api/animals/{animal_id}", response_model=AnimalResponse)
def update_animal(animal_id: int, data: AnimalUpdate, db: Session = Depends(get_db)):
    animal = db.query(Animal).filter(Animal.id == animal_id).first()
    if not animal:
        raise HTTPException(status_code=404, detail="Животное не найдено")

    errors = {}

    if data.name is not None and len(data.name) > 100:
        errors["name"] = "Кличка слишком длинная (максимум 100 символов)"

    if data.group_id is not None:
        group = db.query(Group).filter(Group.id == data.group_id).first()
        if not group:
            errors["group_id"] = f"Группа #{data.group_id} не найдена"

    if data.status is not None and data.status not in ("active", "sold", "dead", "slaughtered"):
        errors["status"] = "Неверный статус"

    if errors:
        raise HTTPException(
            status_code=400,
            detail={"message": "Проверьте поля формы", "errors": errors},
        )

    for field, value in data.model_dump(exclude_unset=True).items():
        if field == "status" and value:
            value = AnimalStatus(value)
        setattr(animal, field, value)

    db.commit()
    db.refresh(animal)
    return animal


@app.delete("/api/animals/{animal_id}", status_code=204)
def delete_animal(animal_id: int, db: Session = Depends(get_db)):
    animal = db.query(Animal).filter(Animal.id == animal_id).first()
    if not animal:
        raise HTTPException(status_code=404, detail="Животное не найдено")
    db.delete(animal)
    db.commit()


# ==================== GROUPS ====================

@app.get("/api/groups", response_model=list[GroupResponse])
def list_groups(db: Session = Depends(get_db)):
    return db.query(Group).all()


@app.post("/api/groups", response_model=GroupResponse, status_code=201)
def create_group(data: GroupCreate, db: Session = Depends(get_db)):
    errors = {}

    name = data.name.strip()
    if not name:
        errors["name"] = "Название группы обязательно"
    elif len(name) > 100:
        errors["name"] = "Название слишком длинное"
    else:
        existing = db.query(Group).filter(Group.name == name).first()
        if existing:
            errors["name"] = f"Группа «{name}» уже существует"

    if errors:
        raise HTTPException(
            status_code=400,
            detail={"message": "Проверьте поля формы", "errors": errors},
        )

    group = Group(name=name, description=data.description)
    db.add(group)
    db.commit()
    db.refresh(group)
    return group


# ==================== VACCINES ====================

@app.get("/api/vaccines", response_model=list[VaccineResponse])
def list_vaccines(db: Session = Depends(get_db)):
    return db.query(Vaccine).all()


@app.post("/api/vaccines", response_model=VaccineResponse, status_code=201)
def create_vaccine(data: VaccineCreate, db: Session = Depends(get_db)):
    errors = {}

    name = data.name.strip()
    if not name:
        errors["name"] = "Название вакцины обязательно"
    else:
        existing = db.query(Vaccine).filter(Vaccine.name == name).first()
        if existing:
            errors["name"] = f"Вакцина «{name}» уже существует"

    if not data.disease.strip():
        errors["disease"] = "Заболевание обязательно"

    if errors:
        raise HTTPException(
            status_code=400,
            detail={"message": "Проверьте поля формы", "errors": errors},
        )

    v = Vaccine(**data.model_dump())
    db.add(v)
    db.commit()
    db.refresh(v)
    return v


@app.get("/api/vaccination-schemes")
def get_schemes():
    return VACCINATION_SCHEMES


# ==================== VACCINATIONS ====================

@app.get("/api/vaccinations", response_model=list[VaccinationResponse])
def list_vaccinations(
    is_done: Optional[bool] = None,
    upcoming_days: Optional[int] = Query(None, description="Только предстоящие N дней"),
    animal_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Vaccination)
    if is_done is not None:
        q = q.filter(Vaccination.is_done == is_done)
    if animal_id:
        q = q.filter(Vaccination.animal_id == animal_id)
    if upcoming_days:
        today = date.today()
        end = today + timedelta(days=upcoming_days)
        q = q.filter(
            Vaccination.planned_date >= today,
            Vaccination.planned_date <= end,
        )
    return q.order_by(Vaccination.planned_date).all()


@app.post("/api/vaccinations", response_model=VaccinationResponse, status_code=201)
def create_vaccination(data: VaccinationCreate, db: Session = Depends(get_db)):
    errors = {}

    animal = db.query(Animal).filter(Animal.id == data.animal_id).first()
    if not animal:
        errors["animal_id"] = f"Животное #{data.animal_id} не найдено"

    vaccine = db.query(Vaccine).filter(Vaccine.id == data.vaccine_id).first()
    if not vaccine:
        errors["vaccine_id"] = f"Вакцина #{data.vaccine_id} не найдена"

    if data.planned_date < date.today() - timedelta(days=365):
        errors["planned_date"] = "Плановая дата слишком далеко в прошлом"

    if errors:
        raise HTTPException(
            status_code=400,
            detail={"message": "Проверьте поля формы", "errors": errors},
        )

    v = Vaccination(**data.model_dump())
    db.add(v)
    db.commit()
    db.refresh(v)
    return v


@app.post("/api/vaccinations/{vac_id}/complete", response_model=VaccinationResponse)
def complete_vaccination(vac_id: int, data: VaccinationComplete, db: Session = Depends(get_db)):
    vac = db.query(Vaccination).filter(Vaccination.id == vac_id).first()
    if not vac:
        raise HTTPException(status_code=404, detail="Вакцинация не найдена")

    errors = {}

    if vac.is_done:
        errors["_general"] = "Вакцинация уже отмечена как выполненная"

    if data.actual_date > date.today():
        errors["actual_date"] = "Дата выполнения не может быть в будущем"

    if data.actual_date < vac.planned_date - timedelta(days=365):
        errors["actual_date"] = "Дата выполнения слишком отличается от плановой"

    if errors:
        raise HTTPException(
            status_code=400,
            detail={"message": "Проверьте поля формы", "errors": errors},
        )

    vac.is_done = True
    vac.actual_date = data.actual_date
    vac.vet_name = data.vet_name
    vac.dose_used = data.dose_used
    if data.notes:
        vac.notes = (vac.notes or "") + "\n" + data.notes

    db.commit()
    db.refresh(vac)
    return vac


@app.get("/api/animals/{animal_id}/schedule")
def get_animal_schedule(animal_id: int, db: Session = Depends(get_db)):
    animal = db.query(Animal).filter(Animal.id == animal_id).first()
    if not animal:
        raise HTTPException(status_code=404, detail="Животное не найдено")
    if not animal.birth_date:
        raise HTTPException(
            status_code=400,
            detail={"message": "Заполните поля", "errors": {"birth_date": "У животного не указана дата рождения"}},
        )

    return generate_schedule_for_animal(
        birth_date=animal.birth_date,
        sex=animal.sex.value,
    )


@app.post("/api/animals/{animal_id}/generate-vaccinations")
def generate_and_save_vaccinations(animal_id: int, db: Session = Depends(get_db)):
    animal = db.query(Animal).filter(Animal.id == animal_id).first()
    if not animal:
        raise HTTPException(status_code=404, detail="Животное не найдено")
    if not animal.birth_date:
        raise HTTPException(
            status_code=400,
            detail={"message": "Заполните поля", "errors": {"birth_date": "Укажите дату рождения животного"}},
        )

    schedule = generate_schedule_for_animal(animal.birth_date, animal.sex.value)
    created = []

    for item in schedule:
        vaccine = db.query(Vaccine).filter(Vaccine.name == item["vaccine"]).first()
        if not vaccine:
            vaccine = Vaccine(name=item["vaccine"], disease=item["disease"])
            db.add(vaccine)
            db.flush()

        existing = (
            db.query(Vaccination)
            .filter(
                Vaccination.animal_id == animal_id,
                Vaccination.vaccine_id == vaccine.id,
                Vaccination.planned_date == item["planned_date"],
            )
            .first()
        )
        if existing:
            continue

        v = Vaccination(
            animal_id=animal_id,
            vaccine_id=vaccine.id,
            planned_date=item["planned_date"],
            notes=item.get("notes"),
        )
        db.add(v)
        created.append(v)

    db.commit()
    return {"created": len(created), "schedule": schedule}


# ==================== EVENTS ====================

@app.get("/api/animals/{animal_id}/events", response_model=list[EventResponse])
def list_events(animal_id: int, db: Session = Depends(get_db)):
    return db.query(AnimalEvent).filter(AnimalEvent.animal_id == animal_id).all()


@app.post("/api/events", response_model=EventResponse, status_code=201)
def create_event(data: EventCreate, db: Session = Depends(get_db)):
    animal = db.query(Animal).filter(Animal.id == data.animal_id).first()
    if not animal:
        raise HTTPException(
            status_code=404,
            detail={"message": "Ошибка", "errors": {"animal_id": "Животное не найдено"}},
        )

    valid_types = ("calving", "transfer", "sold", "dead", "slaughtered", "other")
    if data.event_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail={"message": "Проверьте поля", "errors": {"event_type": f"Допустимые типы: {', '.join(valid_types)}"}},
        )

    event = AnimalEvent(**data.model_dump())
    db.add(event)

    if data.event_type == "dead":
        animal.status = AnimalStatus.DEAD
    elif data.event_type == "sold":
        animal.status = AnimalStatus.SOLD
    elif data.event_type == "slaughtered":
        animal.status = AnimalStatus.SLAUGHTERED

    db.commit()
    db.refresh(event)
    return event


# ==================== DASHBOARD ====================

@app.get("/api/dashboard")
def dashboard(db: Session = Depends(get_db)):
    total = db.query(Animal).filter(Animal.status == AnimalStatus.ACTIVE).count()
    today = date.today()
    week_later = today + timedelta(days=7)

    upcoming = (
        db.query(Vaccination)
        .filter(
            Vaccination.is_done == False,
            Vaccination.planned_date >= today,
            Vaccination.planned_date <= week_later,
        )
        .count()
    )

    overdue = (
        db.query(Vaccination)
        .filter(
            Vaccination.is_done == False,
            Vaccination.planned_date < today,
        )
        .count()
    )

    return {
        "total_active": total,
        "upcoming_7_days": upcoming,
        "overdue": overdue,
    }