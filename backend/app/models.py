import uuid
import enum

from sqlalchemy import Boolean, Column, Date, DateTime, Enum, ForeignKey, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .database import Base


class UserRole(str, enum.Enum):
    STUDENT = "student"
    ADVISER = "adviser"
    ADMIN = "admin"


class SchoolYearStatus(str, enum.Enum):
    UPCOMING = "upcoming"
    ACTIVE = "active"
    CLOSED = "closed"


class StudentClassification(str, enum.Enum):
    REGULAR = "regular"
    TRANSFEREE = "transferee"
    SHIFTEE = "shiftee"


class AdviserInvitationStatus(str, enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REVOKED = "revoked"
    EXPIRED = "expired"


class DocumentTypeStatus(str, enum.Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class User(Base):
    __tablename__ = "users"

    # Internal DB primary key (UUID).
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)

    # Clerk user id from the JWT `sub` claim. This is the "auth id" / external identity key.
    clerk_user_id = Column(String(255), unique=True, nullable=False, index=True)

    # Basic profile fields (can be hydrated from Clerk).
    email = Column(String(255), unique=True, nullable=True, index=True)
    first_name = Column(String(255), nullable=True)
    middle_name = Column(String(255), nullable=True)
    last_name = Column(String(255), nullable=True)

    # Entire publicMetadata snapshot (useful for debugging/syncing without extra Clerk calls).
    public_metadata = Column(JSONB, nullable=True)

    # Role-based access control (RBAC)
    role = Column(Enum(UserRole, name="user_role"), nullable=False, default=UserRole.STUDENT)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # One-to-one: a user can have a student profile (only for `role=student`).
    student = relationship("Student", back_populates="user", uselist=False, cascade="all, delete-orphan")

    # One-to-one: a user can have an adviser profile (only for `role=adviser`).
    adviser = relationship("Adviser", back_populates="user", uselist=False, cascade="all, delete-orphan")


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
    classification = Column(
        Enum(StudentClassification, name="student_classification"),
        nullable=True,
        default=StudentClassification.REGULAR,
    )

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="student")


class Adviser(Base):
    """Adviser profile - one-to-one with User for role=adviser"""
    __tablename__ = "advisers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)

    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True
    )

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="adviser")
    program_adviser_assignments = relationship(
        "ProgramAdviserAssignment",
        back_populates="adviser",
        cascade="all, delete-orphan",
    )


class Program(Base):
    __tablename__ = "programs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    program_adviser_assignments = relationship(
        "ProgramAdviserAssignment",
        back_populates="program",
        cascade="all, delete-orphan",
    )


class Department(Base):
    __tablename__ = "departments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String(100), nullable=False)
    code = Column(String(30), unique=True, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True, server_default=text("true"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class SchoolYear(Base):
    __tablename__ = "school_years"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String(64), nullable=False, unique=True, index=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    auto_closure_date = Column(Date, nullable=True)
    status = Column(
        Enum(SchoolYearStatus, name="school_year_status"),
        nullable=False,
        default=SchoolYearStatus.UPCOMING,
    )
    is_active = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    program_adviser_assignments = relationship(
        "ProgramAdviserAssignment",
        back_populates="school_year",
        cascade="all, delete-orphan",
    )
    school_year_requirements = relationship(
        "SchoolYearRequirement",
        back_populates="school_year",
        cascade="all, delete-orphan",
    )
    audit_logs = relationship(
        "SchoolYearAuditLog",
        back_populates="school_year",
        cascade="all, delete-orphan",
    )


class SchoolYearAuditLog(Base):
    __tablename__ = "school_year_audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    school_year_id = Column(
        UUID(as_uuid=True),
        ForeignKey("school_years.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    action = Column(String(40), nullable=False, index=True)
    actor_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    actor_clerk_user_id = Column(String(255), nullable=True)
    previous_values = Column(JSONB, nullable=True)
    new_values = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    school_year = relationship("SchoolYear", back_populates="audit_logs")
    actor_user = relationship("User")


class ProgramAdviserAssignment(Base):
    __tablename__ = "program_adviser_assignments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    adviser_id = Column(
        UUID(as_uuid=True),
        ForeignKey("advisers.id", ondelete="CASCADE"),
        nullable=False,
    )
    program_id = Column(
        UUID(as_uuid=True),
        ForeignKey("programs.id", ondelete="CASCADE"),
        nullable=False,
    )
    school_year_id = Column(
        UUID(as_uuid=True),
        ForeignKey("school_years.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    adviser = relationship("Adviser", back_populates="program_adviser_assignments")
    program = relationship("Program", back_populates="program_adviser_assignments")
    school_year = relationship("SchoolYear", back_populates="program_adviser_assignments")


class DocumentType(Base):
    __tablename__ = "document_types"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String(120), nullable=False)
    code = Column(String(64), nullable=False, unique=True, index=True)
    description = Column(Text, nullable=False)
    classifier_description = Column(Text, nullable=True)
    keywords = Column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    applicable_classifications = Column(
        JSONB,
        nullable=False,
        default=list,
        server_default=text("'[]'::jsonb")
    )
    status = Column(
        Enum(
            DocumentTypeStatus,
            name="document_type_status",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        default=DocumentTypeStatus.ACTIVE,
        server_default=DocumentTypeStatus.ACTIVE.value,
        index=True,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    school_year_requirements = relationship("SchoolYearRequirement", back_populates="document_type")


class SchoolYearRequirement(Base):
    __tablename__ = "school_year_requirements"
    __table_args__ = (
        UniqueConstraint(
            "school_year_id",
            "document_type_id",
            name="uq_school_year_requirements_school_year_document_type",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    school_year_id = Column(
        UUID(as_uuid=True),
        ForeignKey("school_years.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_type_id = Column(
        UUID(as_uuid=True),
        ForeignKey("document_types.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    school_year = relationship("SchoolYear", back_populates="school_year_requirements")
    document_type = relationship("DocumentType", back_populates="school_year_requirements")


class AdviserInvitation(Base):
    __tablename__ = "adviser_invitations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    clerk_invitation_id = Column(String(255), unique=True, nullable=False, index=True)
    email = Column(String(255), nullable=False, index=True)
    first_name = Column(String(255), nullable=True)
    middle_name = Column(String(255), nullable=True)
    last_name = Column(String(255), nullable=True)
    department_code = Column(String(30), nullable=True)
    school_year_id = Column(
        UUID(as_uuid=True),
        ForeignKey("school_years.id", ondelete="SET NULL"),
        nullable=True,
    )
    invited_by_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    accepted_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    accepted_adviser_id = Column(
        UUID(as_uuid=True),
        ForeignKey("advisers.id", ondelete="SET NULL"),
        nullable=True,
    )
    status = Column(
        Enum(
            AdviserInvitationStatus,
            name="adviser_invitation_status",
            # Persist enum `.value` strings (pending/accepted/...) to match the Postgres enum labels.
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        default=AdviserInvitationStatus.PENDING,
        server_default=AdviserInvitationStatus.PENDING.value,
    )
    expires_at = Column(DateTime(timezone=True), nullable=True)
    accepted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
