from motor.motor_asyncio import AsyncIOMotorClient

from app.config import settings

client = AsyncIOMotorClient(settings.mongodb_uri)
database = client[settings.mongodb_db]
users_collection = database["users"]
password_resets_collection = database["password_resets"]
trainer_sessions_collection = database["trainer_sessions"]
recordings_collection = database["recordings"]
session_recordings_collection = database["session_recordings"]
managed_sessions_collection = database["managed_sessions"]
attendance_collection = database["attendance"]
chat_messages_collection = database["chat_messages"]
whiteboard_entries_collection = database["whiteboard_entries"]


async def create_indexes() -> None:
    await users_collection.create_index("email", unique=True)
    await password_resets_collection.create_index("email")
    await password_resets_collection.create_index("expires_at", expireAfterSeconds=0)
    await trainer_sessions_collection.create_index("room_id")
    await trainer_sessions_collection.create_index("created_at")
    await recordings_collection.create_index("recording_id")
    await recordings_collection.create_index("uploaded_at")
    await session_recordings_collection.create_index("recording_id")
    await session_recordings_collection.create_index("uploaded_date")
    await managed_sessions_collection.create_index("session_id")
    await managed_sessions_collection.create_index("session_name")
    await managed_sessions_collection.create_index("date")
    await managed_sessions_collection.create_index("status")
    await attendance_collection.create_index([("user_id", 1), ("session_id", 1)], unique=True)
    await attendance_collection.create_index("session_id")
    await attendance_collection.create_index("user_id")
    await attendance_collection.create_index("join_time")
    await chat_messages_collection.create_index("message_id", unique=True)
    await chat_messages_collection.create_index([("session_id", 1), ("timestamp", 1)])
    await chat_messages_collection.create_index("sender_id")
    await chat_messages_collection.create_index("date_created")
    await whiteboard_entries_collection.create_index("whiteboard_id", unique=True)
    await whiteboard_entries_collection.create_index([("session_id", 1), ("timestamp", 1)])
    await whiteboard_entries_collection.create_index("user_id")




