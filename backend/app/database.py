from motor.motor_asyncio import AsyncIOMotorClient

from app.config import settings

client = AsyncIOMotorClient(settings.mongodb_uri)
database = client[settings.mongodb_db]
users_collection = database["users"]
password_resets_collection = database["password_resets"]


async def create_indexes() -> None:
    await users_collection.create_index("email", unique=True)
    await password_resets_collection.create_index("email")
    await password_resets_collection.create_index("expires_at", expireAfterSeconds=0)
