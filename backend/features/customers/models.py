"""Reviewed customer fields shared by record maintenance and form extraction."""

import re
from datetime import date

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CustomerFields(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fullName: str = Field(default="", max_length=150)
    dateOfBirth: str = Field(default="", max_length=10)
    email: str = Field(default="", max_length=200)
    phone: str = Field(default="", max_length=20)
    address: str = Field(default="", max_length=500)
    city: str = Field(default="", max_length=80)
    state: str = Field(default="", max_length=80)
    postalCode: str = Field(default="", max_length=10)

    @field_validator("dateOfBirth")
    @classmethod
    def birth_date(cls, value):
        if value and (
            date.fromisoformat(value) > date.today()
            or date.fromisoformat(value).year < 1900
        ):
            raise ValueError("Enter a valid date of birth.")
        return value

    @field_validator("email")
    @classmethod
    def email_value(cls, value):
        if value and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Check the email address.")
        return value

    @field_validator("phone")
    @classmethod
    def phone_value(cls, value):
        if value and not re.fullmatch(r"\+?[\d ()-]{7,20}", value):
            raise ValueError("Check the phone number.")
        return value
