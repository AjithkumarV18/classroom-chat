from datetime import datetime, timedelta, timezone
import secrets

from fastapi import APIRouter, HTTPException, status
from pymongo.errors import DuplicateKeyError

from app.config import settings
from app.database import password_resets_collection, users_collection
from app.schemas import (
    DemoLoginRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserResponse,
)
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


def serialize_user(user: dict) -> UserResponse:
    return UserResponse(
        id=str(user["_id"]),
        first_name=user["first_name"],
        last_name=user["last_name"],
        email=user["email"],
        role=user.get("role", "Student"),
    )


def create_user_token(user: dict) -> str:
    return create_access_token(
        str(user["_id"]),
        {"email": user["email"], "role": user.get("role", "Student")},
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest) -> TokenResponse:
    normalized_email = payload.email.lower()
    user_document = {
        "first_name": payload.first_name.strip(),
        "last_name": payload.last_name.strip(),
        "email": normalized_email,
        "role": payload.role,
        "password_hash": hash_password(payload.password),
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }

    try:
        result = await users_collection.insert_one(user_document)
    except DuplicateKeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        ) from exc

    created_user = await users_collection.find_one({"_id": result.inserted_id})
    token = create_user_token(created_user)

    return TokenResponse(access_token=token, user=serialize_user(created_user))


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest) -> TokenResponse:
    normalized_email = payload.email.lower()
    user = await users_collection.find_one({"email": normalized_email})

    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    if "role" not in user:
        await users_collection.update_one(
            {"_id": user["_id"]},
            {"$set": {"role": "Student", "updated_at": datetime.now(timezone.utc)}},
        )
        user["role"] = "Student"

    token = create_user_token(user)
    return TokenResponse(access_token=token, user=serialize_user(user))


@router.post("/demo-login", response_model=TokenResponse)
async def demo_login(payload: DemoLoginRequest) -> TokenResponse:
    role = payload.role
    demo_user = {
        "_id": f"demo-{role.lower()}",
        "first_name": role,
        "last_name": "Demo",
        "email": f"{role.lower()}@demo.local",
        "role": role,
    }
    token = create_access_token(
        demo_user["_id"],
        {"email": demo_user["email"], "role": role},
    )
    return TokenResponse(access_token=token, user=serialize_user(demo_user))


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
async def forgot_password(payload: ForgotPasswordRequest) -> ForgotPasswordResponse:
    normalized_email = payload.email.lower()
    user = await users_collection.find_one({"email": normalized_email})

    if not user:
        return ForgotPasswordResponse(
            message="If this email exists, a password reset code has been sent.",
            reset_code=None,
        )

    reset_code = f"{secrets.randbelow(1_000_000):06d}"
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.reset_code_expire_minutes
    )

    await password_resets_collection.delete_many({"email": normalized_email})
    await password_resets_collection.insert_one(
        {
            "email": normalized_email,
            "reset_code_hash": hash_password(reset_code),
            "expires_at": expires_at,
            "created_at": datetime.now(timezone.utc),
        }
    )

    return ForgotPasswordResponse(
        message="Password reset code generated successfully.",
        reset_code=reset_code,
    )


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(payload: ResetPasswordRequest) -> MessageResponse:
    normalized_email = payload.email.lower()
    reset_record = await password_resets_collection.find_one({"email": normalized_email})

    if not reset_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset code.",
        )

    expires_at = reset_record["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at < datetime.now(timezone.utc) or not verify_password(
        payload.reset_code, reset_record["reset_code_hash"]
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset code.",
        )

    result = await users_collection.update_one(
        {"email": normalized_email},
        {
            "$set": {
                "password_hash": hash_password(payload.password),
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )

    if result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    await password_resets_collection.delete_many({"email": normalized_email})
    return MessageResponse(message="Password reset successfully.")
