import csv
import io
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from models import (
    SessionLocal, Animal, Group, Vaccine, Vaccination, AnimalEvent,
    Expense, Income,
    AnimalStatus, Sex, ExpenseCategory, IncomeCategory
)
from schemas import (
    AnimalCreate, AnimalUpdate, AnimalResponse,
    GroupCreate, GroupUpdate, GroupResponse,
    VaccineCreate, VaccineResponse,
    VaccinationCreate, VaccinationComplete, VaccinationResponse,
    EventCreate, EventResponse,
    GroupCompleteRequest,
    GroupAssignRequest,
    ExpenseCreate, ExpenseResponse,
    IncomeCreate, IncomeResponse,
)
from vaccination_schedule import (
    generate_schedule_for_animal,
    generate_schedule_for_pregnant,
    VACCINATION_SCHEMES,
)


app = FastAPI(title="Моё поголовье — API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== ОБРАБОТКА ОШИБОК ====================

FIELD_NAMES = {
    "tag_number": "Номер бирки", "chip_number": "Номер чипа",
    "name": "Кличка", "sex": "Пол", "birth_date": "Дата рождения",
    "breed": "Порода", "color": "Масть", "group_id": "Группа",
    "notes": "Заметки", "animal_id": "Животное", "vaccine_id": "Вакцина",
    "planned_date": "Плановая дата", "recommended_date": "Рекомендуемая дата",
    "actual_date": "Фактическая дата", "vet_name": "Ветеринар",
    "dose_used": "Доза", "event_type": "Тип события", "event_date": "Дата события",
    "description": "Описание", "title": "Название", "status": "Статус",
    "category": "Категория", "amount": "Сумма", "expense_date": "Дата расхода",
    "income_date": "Дата дохода", "quantity": "Количество", "weight_kg": "Вес",
    "disease": "Болезнь",
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
        elif "not a valid date" in msg.lower() or "date_from_datetime_parsing" in etype:
            msg = "Неверный формат даты"
        elif "not a valid integer" in msg.lower() or "int_parsing" in etype:
            msg = "Должно быть целое число"
        elif "not a valid number" in msg.lower() or "float_parsing" in etype:
            msg = "Должно быть число"
        elif "string_too_short" in etype:
            msg = "Слишком короткое значение"
        elif "string_too_long" in etype:
            msg = "Слишком длинное значение"

        field_label = FIELD_NAMES.get(field, field)
        errors[field] = f"{field_label}: {msg}"

    return JSONResponse(
        status_code=422,
        content={"detail": "Проверьте правильность заполнения полей", "errors": errors},
    )


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

    if data.chip_number:
        chip = data.chip_number.strip()
        if chip:
            chip_existing = db.query(Animal).filter(Animal.chip_number == chip).first()
            if chip_existing:
                errors["chip_number"] = f"Чип {chip} уже используется"

    if data.birth_date:
        if data.birth_date > date.today():
            errors["birth_date"] = "Дата рождения не может быть в будущем"
        else:
            min_date = date.today() - timedelta(days=365 * 30)
            if data.birth_date < min_date:
                errors["birth_date"] = "Дата рождения более 30 лет назад"

    if data.sex not in ("male", "female"):
        errors["sex"] = "Пол должен быть male или female"

    if data.name and len(data.name) > 100:
        errors["name"] = "Кличка слишком длинная (максимум 100 символов)"

    if data.group_id:
        group = db.query(Group).filter(Group.id == data.group_id).first()
        if not group:
            errors["group_id"] = f"Группа #{data.group_id} не найдена"

    if errors:
        raise HTTPException(status_code=400, detail={"message": "Проверьте поля формы", "errors": errors})

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

    if data.color is not None and len(data.color) > 50:
        errors["color"] = "Масть слишком длинная"

    if data.group_id is not None:
        group = db.query(Group).filter(Group.id == data.group_id).first()
        if not group:
            errors["group_id"] = f"Группа #{data.group_id} не найдена"

    if data.status is not None and data.status not in ("active", "sold", "dead", "slaughtered"):
        errors["status"] = "Неверный статус"

    if errors:
        raise HTTPException(status_code=400, detail={"message": "Проверьте поля формы", "errors": errors})

    for field, value in data.model_dump(exclude_unset=True).items():
        if field == "status" and value:
            value = AnimalStatus(value)
        if field == "name" and value:
            value = value.strip()
        if field == "color" and value:
            value = value.strip()
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
    return db.query(Group).order_by(Group.name).all()


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
        raise HTTPException(status_code=400, detail={"message": "Проверьте поля формы", "errors": errors})

    group = Group(name=name, description=data.description)
    db.add(group)
    db.commit()
    db.refresh(group)
    return group


@app.patch("/api/groups/{group_id}", response_model=GroupResponse)
def update_group(group_id: int, data: GroupUpdate, db: Session = Depends(get_db)):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")

    errors = {}

    if data.name is not None:
        name = data.name.strip()
        if not name:
            errors["name"] = "Название не может быть пустым"
        elif len(name) > 100:
            errors["name"] = "Название слишком длинное"
        else:
            existing = db.query(Group).filter(Group.name == name, Group.id != group_id).first()
            if existing:
                errors["name"] = f"Группа «{name}» уже существует"

    if errors:
        raise HTTPException(status_code=400, detail={"message": "Проверьте поля формы", "errors": errors})

    for field, value in data.model_dump(exclude_unset=True).items():
        if field == "name" and value:
            value = value.strip()
        setattr(group, field, value)

    db.commit()
    db.refresh(group)
    return group


@app.delete("/api/groups/{group_id}", status_code=204)
def delete_group(group_id: int, db: Session = Depends(get_db)):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")

    db.query(Animal).filter(Animal.group_id == group_id).update({Animal.group_id: None})
    db.delete(group)
    db.commit()


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
        raise HTTPException(status_code=400, detail={"message": "Проверьте поля формы", "errors": errors})

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
    upcoming_days: Optional[int] = Query(None),
    animal_id: Optional[int] = None,
    include_inactive: bool = False,
    db: Session = Depends(get_db),
):
    q = db.query(Vaccination).join(Animal, Vaccination.animal_id == Animal.id)

    if not include_inactive:
        q = q.filter(Animal.status == AnimalStatus.ACTIVE)

    if is_done is not None:
        q = q.filter(Vaccination.is_done == is_done)
    if animal_id:
        q = q.filter(Vaccination.animal_id == animal_id)
    if upcoming_days:
        today = date.today()
        end = today + timedelta(days=upcoming_days)
        q = q.filter(Vaccination.planned_date >= today, Vaccination.planned_date <= end)
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

    if errors:
        raise HTTPException(status_code=400, detail={"message": "Проверьте поля формы", "errors": errors})

    v = Vaccination(**data.model_dump())
    db.add(v)
    db.commit()
    db.refresh(v)
    return v


@app.patch("/api/vaccinations/{vac_id}", response_model=VaccinationResponse)
def update_vaccination(vac_id: int, data: dict, db: Session = Depends(get_db)):
    vac = db.query(Vaccination).filter(Vaccination.id == vac_id).first()
    if not vac:
        raise HTTPException(status_code=404, detail="Вакцинация не найдена")

    if vac.is_done:
        raise HTTPException(status_code=400, detail={"message": "Уже выполнено", "errors": {"_general": "Нельзя изменить выполненную вакцинацию"}})

    if "planned_date" in data and data["planned_date"]:
        try:
            new_date = datetime.fromisoformat(str(data["planned_date"])).date()
            vac.planned_date = new_date
        except Exception:
            raise HTTPException(status_code=400, detail={"message": "Ошибка", "errors": {"planned_date": "Неверный формат даты"}})

    db.commit()
    db.refresh(vac)
    return vac


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

    if errors:
        raise HTTPException(status_code=400, detail={"message": "Проверьте поля формы", "errors": errors})

    vac.is_done = True
    vac.actual_date = data.actual_date
    vac.vet_name = data.vet_name
    vac.dose_used = data.dose_used
    if data.notes:
        vac.notes = (vac.notes or "") + "\n" + data.notes

    db.commit()
    db.refresh(vac)
    return vac


@app.delete("/api/vaccinations/{vac_id}", status_code=204)
def delete_vaccination(vac_id: int, db: Session = Depends(get_db)):
    vac = db.query(Vaccination).filter(Vaccination.id == vac_id).first()
    if not vac:
        raise HTTPException(status_code=404, detail="Вакцинация не найдена")
    db.delete(vac)
    db.commit()


@app.get("/api/animals/{animal_id}/schedule")
def get_animal_schedule(animal_id: int, db: Session = Depends(get_db)):
    animal = db.query(Animal).filter(Animal.id == animal_id).first()
    if not animal:
        raise HTTPException(status_code=404, detail="Животное не найдено")
    if not animal.birth_date:
        raise HTTPException(status_code=400, detail={"message": "Заполните поля", "errors": {"birth_date": "У животного не указана дата рождения"}})

    return generate_schedule_for_animal(birth_date=animal.birth_date, sex=animal.sex.value)


@app.post("/api/animals/{animal_id}/generate-vaccinations")
def generate_and_save_vaccinations(animal_id: int, db: Session = Depends(get_db)):
    animal = db.query(Animal).filter(Animal.id == animal_id).first()
    if not animal:
        raise HTTPException(status_code=404, detail="Животное не найдено")
    if not animal.birth_date:
        raise HTTPException(status_code=400, detail={"message": "Заполните поля", "errors": {"birth_date": "Укажите дату рождения животного"}})

    schedule = generate_schedule_for_animal(animal.birth_date, animal.sex.value)
    created = []

    for item in schedule:
        vaccine = db.query(Vaccine).filter(Vaccine.name == item["vaccine"]).first()
        if not vaccine:
            vaccine = Vaccine(name=item["vaccine"], disease=item["disease"])
            db.add(vaccine)
            db.flush()

        existing = db.query(Vaccination).filter(
            Vaccination.animal_id == animal_id,
            Vaccination.vaccine_id == vaccine.id,
            Vaccination.planned_date == item["planned_date"],
        ).first()
        if existing:
            continue

        v = Vaccination(
            animal_id=animal_id,
            vaccine_id=vaccine.id,
            planned_date=item["planned_date"],
            recommended_date=item["planned_date"],
            notes=item.get("notes"),
        )
        db.add(v)
        created.append(v)

    db.commit()
    return {"created": len(created), "schedule": schedule}


# ==================== EVENTS ====================

@app.get("/api/animals/{animal_id}/events", response_model=list[EventResponse])
def list_events(animal_id: int, db: Session = Depends(get_db)):
    return db.query(AnimalEvent).filter(AnimalEvent.animal_id == animal_id).order_by(AnimalEvent.event_date.desc()).all()


@app.get("/api/events", response_model=list[EventResponse])
def list_all_events(db: Session = Depends(get_db)):
    return db.query(AnimalEvent).order_by(AnimalEvent.event_date.desc()).limit(100).all()


@app.post("/api/events", response_model=EventResponse, status_code=201)
def create_event(data: EventCreate, db: Session = Depends(get_db)):
    animal = db.query(Animal).filter(Animal.id == data.animal_id).first()
    if not animal:
        raise HTTPException(status_code=404, detail={"message": "Ошибка", "errors": {"animal_id": "Животное не найдено"}})

    # Запрет событий для выбывших животных
    if animal.status != AnimalStatus.ACTIVE:
        status_label = {
            "sold": "продан",
            "dead": "пал",
            "slaughtered": "забит",
        }.get(animal.status.value, "неактивен")
        raise HTTPException(
            status_code=400,
            detail={
                "message": "События недоступны",
                "errors": {
                    "animal_id": f"Животное {animal.tag_number} {status_label}. Добавление событий заблокировано."
                },
            },
        )

    valid_types = ("calving", "transfer", "sold", "dead", "slaughtered", "other")
    if data.event_type not in valid_types:
        raise HTTPException(status_code=400, detail={"message": "Проверьте поля", "errors": {"event_type": f"Допустимые типы: {', '.join(valid_types)}"}})

    if data.event_date > date.today():
        raise HTTPException(status_code=400, detail={"message": "Проверьте поля", "errors": {"event_date": "Дата события не может быть в будущем"}})

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


@app.delete("/api/events/{event_id}", status_code=204)
def delete_event(event_id: int, db: Session = Depends(get_db)):
    event = db.query(AnimalEvent).filter(AnimalEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Событие не найдено")
    db.delete(event)
    db.commit()


# ==================== EXPORT ====================

@app.get("/api/export/animals.csv")
def export_animals_csv(db: Session = Depends(get_db)):
    animals = db.query(Animal).order_by(Animal.tag_number).all()
    groups_map = {g.id: g.name for g in db.query(Group).all()}

    output = io.StringIO()
    output.write('\ufeff')
    writer = csv.writer(output, delimiter=';')
    writer.writerow(["ID", "Бирка", "Чип", "Кличка", "Пол", "Дата рождения", "Возраст", "Порода", "Масть", "Группа", "Статус", "Мать ID", "Отец ID", "Заметки"])

    for a in animals:
        writer.writerow([
            a.id, a.tag_number, a.chip_number or "", a.name or "",
            "Корова" if a.sex == Sex.FEMALE else "Бык",
            a.birth_date.strftime("%d.%m.%Y") if a.birth_date else "",
            a.birth_date.strftime("%Y") if a.birth_date else "",
            a.breed, a.color or "",
            groups_map.get(a.group_id, "") if a.group_id else "",
            a.status.value, a.mother_id or "", a.father_id or "",
            (a.notes or "").replace("\n", " "),
        ])

    output.seek(0)
    filename = f"animals_{date.today().strftime('%Y%m%d')}.csv"
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@app.get("/api/export/vaccinations.csv")
def export_vaccinations_csv(is_done: Optional[bool] = None, db: Session = Depends(get_db)):
    q = db.query(Vaccination)
    if is_done is not None:
        q = q.filter(Vaccination.is_done == is_done)
    v_list = q.order_by(Vaccination.planned_date).all()

    animals_map = {a.id: a for a in db.query(Animal).all()}
    vaccines_map = {v.id: v for v in db.query(Vaccine).all()}

    output = io.StringIO()
    output.write('\ufeff')
    writer = csv.writer(output, delimiter=';')
    writer.writerow(["ID", "Бирка", "Болезнь", "Вакцина", "Рекомендуемая дата", "Плановая дата", "Фактическая дата", "Выполнено", "Ветеринар", "Доза", "Заметки"])

    for v in v_list:
        animal = animals_map.get(v.animal_id)
        vaccine = vaccines_map.get(v.vaccine_id)
        writer.writerow([
            v.id, animal.tag_number if animal else "",
            vaccine.disease if vaccine else "", vaccine.name if vaccine else "",
            v.recommended_date.strftime("%d.%m.%Y") if v.recommended_date else "",
            v.planned_date.strftime("%d.%m.%Y") if v.planned_date else "",
            v.actual_date.strftime("%d.%m.%Y") if v.actual_date else "",
            "Да" if v.is_done else "Нет", v.vet_name or "", v.dose_used or "",
            (v.notes or "").replace("\n", " "),
        ])

    output.seek(0)
    filename = f"vaccinations_{date.today().strftime('%Y%m%d')}.csv"
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="{filename}"'})


# ==================== ГУРТОВАЯ ВАКЦИНАЦИЯ ====================

@app.get("/api/groups/{group_id}/upcoming-vaccinations")
def group_upcoming_vaccinations(group_id: int, db: Session = Depends(get_db)):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")

    animals = db.query(Animal).filter(Animal.group_id == group_id, Animal.status == AnimalStatus.ACTIVE).all()
    animal_ids = [a.id for a in animals]
    if not animal_ids:
        return []

    vacs = db.query(Vaccination).filter(Vaccination.animal_id.in_(animal_ids), Vaccination.is_done == False).all()

    vaccines_map = {v.id: v for v in db.query(Vaccine).all()}
    grouped: dict = {}

    for v in vacs:
        vaccine = vaccines_map.get(v.vaccine_id)
        if not vaccine:
            continue
        key = vaccine.disease
        if key not in grouped:
            grouped[key] = {"disease": key, "vaccine_id": vaccine.id, "vaccine_name": vaccine.name, "animal_ids": [], "earliest_date": v.planned_date, "latest_date": v.planned_date, "overdue_count": 0}
        g = grouped[key]
        g["animal_ids"].append(v.animal_id)
        if v.planned_date < g["earliest_date"]:
            g["earliest_date"] = v.planned_date
        if v.planned_date > g["latest_date"]:
            g["latest_date"] = v.planned_date
        if v.planned_date < date.today():
            g["overdue_count"] += 1

    result = []
    for g in grouped.values():
        result.append({
            "disease": g["disease"], "vaccine_id": g["vaccine_id"], "vaccine_name": g["vaccine_name"],
            "count": len(g["animal_ids"]), "earliest_date": g["earliest_date"].isoformat(),
            "latest_date": g["latest_date"].isoformat(), "overdue_count": g["overdue_count"],
        })

    result.sort(key=lambda x: x["earliest_date"])
    return result


@app.post("/api/groups/{group_id}/complete-vaccinations")
def group_complete_vaccinations(group_id: int, data: GroupCompleteRequest, db: Session = Depends(get_db)):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")

    if data.actual_date > date.today():
        raise HTTPException(status_code=400, detail={"message": "Проверьте поля", "errors": {"actual_date": "Дата не может быть в будущем"}})

    animals = db.query(Animal).filter(Animal.group_id == group_id, Animal.status == AnimalStatus.ACTIVE).all()
    animal_ids = [a.id for a in animals]

    if not animal_ids:
        raise HTTPException(status_code=400, detail={"message": "Ошибка", "errors": {"group_id": "В группе нет активных животных"}})

    vaccines = db.query(Vaccine).filter(Vaccine.disease == data.disease).all()
    vaccine_ids = [v.id for v in vaccines]

    if not vaccine_ids:
        raise HTTPException(status_code=400, detail={"message": "Ошибка", "errors": {"disease": f"Вакцина от «{data.disease}» не найдена"}})

    vacs = db.query(Vaccination).filter(Vaccination.animal_id.in_(animal_ids), Vaccination.vaccine_id.in_(vaccine_ids), Vaccination.is_done == False).all()

    updated = 0
    for v in vacs:
        v.is_done = True
        v.actual_date = data.actual_date
        v.vet_name = data.vet_name
        v.dose_used = data.dose_used
        updated += 1

    db.commit()
    return {"updated": updated, "animals_count": len(set(v.animal_id for v in vacs)), "disease": data.disease}


# ==================== СОСТАВ ГУРТА ====================

@app.get("/api/groups/{group_id}/animals", response_model=list[AnimalResponse])
def get_group_animals(group_id: int, db: Session = Depends(get_db)):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")
    return db.query(Animal).filter(Animal.group_id == group_id, Animal.status == AnimalStatus.ACTIVE).order_by(Animal.tag_number).all()


@app.get("/api/animals-without-group", response_model=list[AnimalResponse])
def animals_without_group(db: Session = Depends(get_db)):
    return db.query(Animal).filter(Animal.status == AnimalStatus.ACTIVE).order_by(Animal.tag_number).all()


@app.post("/api/groups/{group_id}/assign")
def assign_animals_to_group(group_id: int, data: GroupAssignRequest, db: Session = Depends(get_db)):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")

    if data.action not in ("add", "remove"):
        raise HTTPException(status_code=400, detail={"message": "Ошибка", "errors": {"action": "Должно быть 'add' или 'remove'"}})

    animals = db.query(Animal).filter(Animal.id.in_(data.animal_ids)).all()

    if not animals:
        raise HTTPException(status_code=400, detail={"message": "Ошибка", "errors": {"animal_ids": "Животные не найдены"}})

    changed = 0
    for a in animals:
        if data.action == "add":
            if a.group_id != group_id:
                a.group_id = group_id
                changed += 1
        else:
            if a.group_id == group_id:
                a.group_id = None
                changed += 1

    db.commit()
    return {"action": data.action, "changed": changed, "total_in_group": db.query(Animal).filter(Animal.group_id == group_id, Animal.status == AnimalStatus.ACTIVE).count()}


# ==================== ФИНАНСЫ: РАСХОДЫ ====================

@app.get("/api/expenses", response_model=list[ExpenseResponse])
def list_expenses(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    category: Optional[str] = None,
    group_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Expense)
    if date_from:
        q = q.filter(Expense.expense_date >= date_from)
    if date_to:
        q = q.filter(Expense.expense_date <= date_to)
    if category:
        q = q.filter(Expense.category == category)
    if group_id:
        q = q.filter(Expense.group_id == group_id)
    return q.order_by(Expense.expense_date.desc(), Expense.id.desc()).all()


@app.post("/api/expenses", response_model=ExpenseResponse, status_code=201)
def create_expense(data: ExpenseCreate, db: Session = Depends(get_db)):
    errors = {}

    if data.category not in [c.value for c in ExpenseCategory]:
        errors["category"] = "Неверная категория расхода"
    if data.amount <= 0:
        errors["amount"] = "Сумма должна быть больше нуля"
    if data.amount > 100_000_000:
        errors["amount"] = "Слишком большая сумма (макс. 100 млн)"
    if data.expense_date > date.today():
        errors["expense_date"] = "Дата не может быть в будущем"
    if data.group_id:
        group = db.query(Group).filter(Group.id == data.group_id).first()
        if not group:
            errors["group_id"] = f"Группа #{data.group_id} не найдена"

    if errors:
        raise HTTPException(status_code=400, detail={"message": "Проверьте поля формы", "errors": errors})

    exp = Expense(
        category=ExpenseCategory(data.category),
        amount=data.amount,
        expense_date=data.expense_date,
        description=data.description.strip() if data.description else None,
        quantity=data.quantity.strip() if data.quantity else None,
        group_id=data.group_id,
        animal_id=data.animal_id,
    )
    db.add(exp)
    db.commit()
    db.refresh(exp)
    return exp


@app.delete("/api/expenses/{expense_id}", status_code=204)
def delete_expense(expense_id: int, db: Session = Depends(get_db)):
    exp = db.query(Expense).filter(Expense.id == expense_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Расход не найден")
    db.delete(exp)
    db.commit()


# ==================== ФИНАНСЫ: ДОХОДЫ ====================

@app.get("/api/incomes", response_model=list[IncomeResponse])
def list_incomes(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    category: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Income)
    if date_from:
        q = q.filter(Income.income_date >= date_from)
    if date_to:
        q = q.filter(Income.income_date <= date_to)
    if category:
        q = q.filter(Income.category == category)
    return q.order_by(Income.income_date.desc(), Income.id.desc()).all()


@app.post("/api/incomes", response_model=IncomeResponse, status_code=201)
def create_income(data: IncomeCreate, db: Session = Depends(get_db)):
    errors = {}

    if data.category not in [c.value for c in IncomeCategory]:
        errors["category"] = "Неверная категория дохода"
    if data.amount <= 0:
        errors["amount"] = "Сумма должна быть больше нуля"
    if data.amount > 100_000_000:
        errors["amount"] = "Слишком большая сумма (макс. 100 млн)"
    if data.income_date > date.today():
        errors["income_date"] = "Дата не может быть в будущем"
    if data.weight_kg is not None and data.weight_kg < 0:
        errors["weight_kg"] = "Вес не может быть отрицательным"

    animal = None
    if data.animal_id:
        animal = db.query(Animal).filter(Animal.id == data.animal_id).first()
        if not animal:
            errors["animal_id"] = f"Животное #{data.animal_id} не найдено"
        else:
            if animal.status.value in ("sold", "slaughtered"):
                errors["animal_id"] = f"Животное {animal.tag_number} уже {('продано' if animal.status.value == 'sold' else 'забито')}"

    if errors:
        raise HTTPException(status_code=400, detail={"message": "Проверьте поля формы", "errors": errors})

    auto_status_changed = None
    if animal and data.category in ("livestock", "meat"):
        if data.category == "livestock":
            animal.status = AnimalStatus.SOLD
            auto_status_changed = "sold"
        elif data.category == "meat":
            animal.status = AnimalStatus.SLAUGHTERED
            auto_status_changed = "slaughtered"

        event = AnimalEvent(
            animal_id=animal.id,
            event_type=auto_status_changed,
            event_date=data.income_date,
            description=(data.description or f"Продажа ({data.category})") + f" — {data.amount:.0f} ₽",
        )
        db.add(event)

    inc = Income(
        category=IncomeCategory(data.category),
        amount=data.amount,
        income_date=data.income_date,
        description=data.description.strip() if data.description else None,
        weight_kg=data.weight_kg,
        animal_id=data.animal_id,
    )
    db.add(inc)
    db.commit()
    db.refresh(inc)
    return inc


@app.delete("/api/incomes/{income_id}", status_code=204)
def delete_income(income_id: int, db: Session = Depends(get_db)):
    inc = db.query(Income).filter(Income.id == income_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Доход не найден")
    db.delete(inc)
    db.commit()


# ==================== ФИНАНСЫ: СВОДКА ====================

@app.get("/api/finance/summary")
def finance_summary(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
):
    eq = db.query(Expense)
    iq = db.query(Income)
    if date_from:
        eq = eq.filter(Expense.expense_date >= date_from)
        iq = iq.filter(Income.income_date >= date_from)
    if date_to:
        eq = eq.filter(Expense.expense_date <= date_to)
        iq = iq.filter(Income.income_date <= date_to)

    expenses = eq.all()
    incomes = iq.all()

    total_expense = sum(e.amount for e in expenses)
    total_income = sum(i.amount for i in incomes)
    profit = total_income - total_expense

    exp_by_cat: dict = {}
    for e in expenses:
        key = e.category.value if hasattr(e.category, "value") else str(e.category)
        if key not in exp_by_cat:
            exp_by_cat[key] = {"amount": 0.0, "count": 0}
        exp_by_cat[key]["amount"] += e.amount
        exp_by_cat[key]["count"] += 1

    inc_by_cat: dict = {}
    for i in incomes:
        key = i.category.value if hasattr(i.category, "value") else str(i.category)
        if key not in inc_by_cat:
            inc_by_cat[key] = {"amount": 0.0, "count": 0}
        inc_by_cat[key]["amount"] += i.amount
        inc_by_cat[key]["count"] += 1

    meat_weight = sum(i.weight_kg or 0 for i in incomes if i.category == IncomeCategory.MEAT)
    meat_income = sum(i.amount for i in incomes if i.category == IncomeCategory.MEAT)

    cost_per_kg = None
    avg_price_per_kg = None
    if meat_weight > 0:
        avg_price_per_kg = round(meat_income / meat_weight, 2)
        cost_per_kg = round(total_expense / meat_weight, 2)

    active_count = db.query(Animal).filter(Animal.status == AnimalStatus.ACTIVE).count()
    profit_per_animal = round(profit / active_count, 2) if active_count > 0 else None

    return {
        "period": {
            "from": date_from.isoformat() if date_from else None,
            "to": date_to.isoformat() if date_to else None,
        },
        "total_expense": round(total_expense, 2),
        "total_income": round(total_income, 2),
        "profit": round(profit, 2),
        "expense_count": len(expenses),
        "income_count": len(incomes),
        "expense_by_category": exp_by_cat,
        "income_by_category": inc_by_cat,
        "meat": {
            "total_weight_kg": round(meat_weight, 2),
            "total_income": round(meat_income, 2),
            "avg_price_per_kg": avg_price_per_kg,
            "cost_per_kg": cost_per_kg,
        },
        "active_animals": active_count,
        "profit_per_animal": profit_per_animal,
    }


# ==================== DASHBOARD ====================

@app.get("/api/dashboard")
def dashboard(db: Session = Depends(get_db)):
    total = db.query(Animal).filter(Animal.status == AnimalStatus.ACTIVE).count()
    today = date.today()
    week_later = today + timedelta(days=7)

    upcoming = (
        db.query(Vaccination)
        .join(Animal, Vaccination.animal_id == Animal.id)
        .filter(
            Animal.status == AnimalStatus.ACTIVE,
            Vaccination.is_done == False,
            Vaccination.planned_date >= today,
            Vaccination.planned_date <= week_later,
        )
        .count()
    )

    overdue = (
        db.query(Vaccination)
        .join(Animal, Vaccination.animal_id == Animal.id)
        .filter(
            Animal.status == AnimalStatus.ACTIVE,
            Vaccination.is_done == False,
            Vaccination.planned_date < today,
        )
        .count()
    )

    return {"total_active": total, "upcoming_7_days": upcoming, "overdue": overdue}


@app.get("/api/dashboard/full")
def dashboard_full(db: Session = Depends(get_db)):
    """Расширенная сводка: поголовье, вакцинация, финансы, события."""
    today = date.today()
    week_later = today + timedelta(days=7)
    month_ago = today - timedelta(days=30)
    year_ago = today - timedelta(days=365)

    # Вакцинация (только активные)
    upcoming_7 = (
        db.query(Vaccination)
        .join(Animal, Vaccination.animal_id == Animal.id)
        .filter(
            Animal.status == AnimalStatus.ACTIVE,
            Vaccination.is_done == False,
            Vaccination.planned_date >= today,
            Vaccination.planned_date <= week_later,
        )
        .count()
    )
    overdue = (
        db.query(Vaccination)
        .join(Animal, Vaccination.animal_id == Animal.id)
        .filter(
            Animal.status == AnimalStatus.ACTIVE,
            Vaccination.is_done == False,
            Vaccination.planned_date < today,
        )
        .count()
    )

    # Поголовье
    active_q = db.query(Animal).filter(Animal.status == AnimalStatus.ACTIVE)
    total_active = active_q.count()
    cows = active_q.filter(Animal.sex == Sex.FEMALE).count()
    bulls = active_q.filter(Animal.sex == Sex.MALE).count()
    young = active_q.filter(
        Animal.birth_date.isnot(None),
        Animal.birth_date >= year_ago,
    ).count()
    groups_count = db.query(Group).count()

    # Финансы за 30 дней
    incomes_30 = db.query(Income).filter(Income.income_date >= month_ago).all()
    expenses_30 = db.query(Expense).filter(Expense.expense_date >= month_ago).all()
    income_30 = sum(i.amount for i in incomes_30)
    expense_30 = sum(e.amount for e in expenses_30)
    profit_30 = income_30 - expense_30

    # События за 30 дней
    events_30 = (
        db.query(AnimalEvent)
        .filter(AnimalEvent.event_date >= month_ago)
        .count()
    )

    return {
        "vaccination": {
            "active": total_active,
            "upcoming_7": upcoming_7,
            "overdue": overdue,
        },
        "animals": {
            "total": total_active,
            "cows": cows,
            "bulls": bulls,
            "young": young,
            "groups": groups_count,
        },
        "finance_30d": {
            "income": round(income_30, 2),
            "expense": round(expense_30, 2),
            "profit": round(profit_30, 2),
        },
        "events_30d": events_30,
    }