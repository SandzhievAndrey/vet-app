"""Календарь вакцинаций для КРС калмыцкой породы в Республике Калмыкия.

Схемы основаны на:
- Ветеринарных правилах РФ
- Региональных планах Управления ветеринарии РК
- Наставлениях по применению вакцин
"""

from datetime import date, timedelta
from typing import Optional
from dateutil.relativedelta import relativedelta


# Схемы по болезням: {disease: {vaccine_name, schedules}}
VACCINATION_SCHEMES = {
    "Сибирская язва": {
        "vaccine": "Вакцина против сибирской язвы (СТИ)",
        "schedules": [
            {"age_days": 90, "repeat_after_days": 180, "annual": True},
        ],
    },
    "Ящур": {
        "vaccine": "Вакцина против ящура",
        "schedules": [
            {"age_days": 90, "repeat_interval_days": 90, "until_age_days": 540, "annual": True},
        ],
    },
    "Бруцеллёз": {
        "vaccine": "Вакцина против бруцеллёза",
        "schedules": [
            {"age_days": 120, "repeat_after_days": 300, "annual": True},
        ],
    },
    "Бешенство": {
        "vaccine": "Вакцина против бешенства",
        "schedules": [
            {"age_days": 90, "annual": True},
        ],
    },
    "Нодулярный дерматит": {
        "vaccine": "Вакцина против нодулярного дерматита",
        "schedules": [
            {"age_days": 90, "repeat_after_days": 180, "annual": True},
        ],
    },
    "ИРТ, ВД, ПГ-3": {
        "vaccine": "Комбинированная вакцина ИРТ+ВД+ПГ-3",
        "schedules": [
            {"age_days": 20, "repeat_after_days": 0, "annual": True},
        ],
    },
    "Клостридиозы": {
        "vaccine": "Коглавакс (клостридиозы)",
        "schedules": [
            {"age_days": 60, "repeat_after_days": 30, "annual": True},
        ],
    },
    "Пастереллёз": {
        "vaccine": "Вакцина против пастереллёза",
        "schedules": [
            {"age_days": 45, "repeat_after_days": 21, "annual": True},
        ],
    },
    "Лептоспироз": {
        "vaccine": "Вакцина против лептоспироза",
        "schedules": [
            {"age_days": 30, "repeat_after_days": 180, "annual": True},
        ],
    },
    "Туберкулёз (диагностика)": {
        "vaccine": "Туберкулин (аллергическое исследование)",
        "schedules": [
            {"age_days": 182, "annual": True, "is_diagnostic": True},
        ],
    },
}


# Особые события для стельных коров
PREGNANCY_SCHEMES = {
    "Rotavec Corona": {
        "vaccine": "Rotavec Corona",
        "days_before_calving": 214,  # за 214-220 дней до отёла
    },
    "Коглавакс (стельные)": {
        "vaccine": "Коглавакс",
        "days_before_calving": 30,   # за 45-30 дней до отёла
    },
}


def generate_schedule_for_animal(
    birth_date: date,
    sex: str = "female",
    reference_date: Optional[date] = None,
) -> list[dict]:
    """Генерирует календарь вакцинаций для животного.

    Возвращает список: [{"disease", "vaccine", "planned_date"}, ...]
    """
    if reference_date is None:
        reference_date = date.today()

    schedule = []

    for disease, scheme in VACCINATION_SCHEMES.items():
        vaccine = scheme["vaccine"]
        for rule in scheme["schedules"]:
            age_days = rule.get("age_days", 0)
            planned = birth_date + timedelta(days=age_days)

            # Если дата в прошлом — пропускаем первую (уже неактуальна)
            if planned < reference_date:
                # Но если ревакцинация ежегодная — считаем следующую
                if rule.get("annual"):
                    next_date = planned
                    while next_date < reference_date:
                        next_date += relativedelta(years=1)
                    schedule.append({
                        "disease": disease,
                        "vaccine": vaccine,
                        "planned_date": next_date,
                        "notes": "Ежегодная ревакцинация",
                    })
                continue

            schedule.append({
                "disease": disease,
                "vaccine": vaccine,
                "planned_date": planned,
                "notes": rule.get("notes", ""),
            })

            # Промежуточные ревакцинации
            repeat_interval = rule.get("repeat_interval_days")
            if repeat_interval:
                until_age = rule.get("until_age_days", age_days + 365 * 2)
                d = planned + timedelta(days=repeat_interval)
                while (d - birth_date).days <= until_age:
                    if d >= reference_date:
                        schedule.append({
                            "disease": disease,
                            "vaccine": vaccine,
                            "planned_date": d,
                            "notes": "Промежуточная ревакцинация",
                        })
                    d += timedelta(days=repeat_interval)

            # Повтор через N дней
            repeat_after = rule.get("repeat_after_days")
            if repeat_after:
                d2 = planned + timedelta(days=repeat_after)
                if d2 >= reference_date:
                    schedule.append({
                        "disease": disease,
                        "vaccine": vaccine,
                        "planned_date": d2,
                        "notes": "Ревакцинация",
                    })

    schedule.sort(key=lambda x: x["planned_date"])
    return schedule


def generate_schedule_for_pregnant(
    animal_birth_date: date,
    calving_date: date,
    reference_date: Optional[date] = None,
) -> list[dict]:
    """Календарь вакцинаций для стельной коровы."""
    if reference_date is None:
        reference_date = date.today()

    schedule = []

    for name, scheme in PREGNANCY_SCHEMES.items():
        planned = calving_date - timedelta(days=scheme["days_before_calving"])
        if planned >= reference_date:
            schedule.append({
                "disease": name,
                "vaccine": scheme["vaccine"],
                "planned_date": planned,
                "notes": f"За {scheme['days_before_calving']} дней до отёла",
            })

    return schedule