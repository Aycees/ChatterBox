from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


from app.models.user import User
from app.models.room import Room
from app.models.room_member import RoomMember
from app.models.message import Message
