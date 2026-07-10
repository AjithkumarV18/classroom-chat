from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

UserRole = Literal["Student", "Teacher", "Employer", "Employee", "Admin"]


class RegisterRequest(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=80)
    last_name: str = Field(..., min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(..., min_length=8)
    role: UserRole = "Student"

    @field_validator("password")
    @classmethod
    def password_is_strong(cls, password: str) -> str:
        if not any(char.isupper() for char in password):
            raise ValueError("Password must include at least one uppercase letter.")
        if not any(char.islower() for char in password):
            raise ValueError("Password must include at least one lowercase letter.")
        if not any(char.isdigit() for char in password):
            raise ValueError("Password must include at least one number.")
        if not any(not char.isalnum() for char in password):
            raise ValueError("Password must include at least one special character.")
        return password


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)


class DemoLoginRequest(BaseModel):
    role: UserRole


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    reset_code: str = Field(..., min_length=4)
    password: str = Field(..., min_length=8)

    @field_validator("password")
    @classmethod
    def password_is_strong(cls, password: str) -> str:
        return RegisterRequest.password_is_strong(password)


class UserResponse(BaseModel):
    id: str
    first_name: str
    last_name: str
    email: EmailStr
    role: UserRole


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class MessageResponse(BaseModel):
    message: str


class ForgotPasswordResponse(MessageResponse):
    reset_code: str | None = None
