import uuid
import enum

from sqlalchemy import Column, DateTime, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .database import Base


class UserRole(str, enum.Enum):
    STUDENT = "student"
    TEACHER = "teacher"
    ADMIN = "admin"

class User(Base):
    __tablename__ = "users"

    # Internal DB primary key (UUID).
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)

    # Clerk user id from the JWT `sub` claim. This is the "auth id" / external identity key.
    clerk_user_id = Column(String(255), unique=True, nullable=False, index=True)

    # Basic profile fields (can be hydrated from Clerk).
    email = Column(String(255), unique=True, nullable=True, index=True)
    first_name = Column(String(255), nullable=True)
    last_name = Column(String(255), nullable=True)

    # Entire publicMetadata snapshot (useful for debugging/syncing without extra Clerk calls).
    public_metadata = Column(JSONB, nullable=True)

    # Role-based access control (RBAC)
    role = Column(Enum(UserRole, name="user_role"), nullable=False, default=UserRole.STUDENT)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # One-to-one: a user can have a student profile (only for `role=student`).
    student = relationship("Student", back_populates="user", uselist=False, cascade="all, delete-orphan")


class Student(Base):
    __tablename__ = "students"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)

    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True
    )

    # These can be null at first sign-up; you can fill them later during onboarding.
    student_number = Column(String, unique=True, nullable=True)
    program = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="student")
