"""Add adviser table and update user roles

Revision ID: 003_add_adviser
Revises: 3727170527d7
Create Date: 2026-04-12
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "003_add_adviser"
down_revision = "3727170527d7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Step 1: Add ADVISER to the existing user_role enum
    # Create new enum type with both TEACHER and ADVISER
    op.execute(
        """
        CREATE TYPE user_role_new AS ENUM ('STUDENT', 'TEACHER', 'ADVISER', 'ADMIN');
        """
    )
    
    # Convert the users.role column to the new enum type
    op.execute(
        """
        ALTER TABLE users 
        ALTER COLUMN role TYPE user_role_new USING role::text::user_role_new;
        """
    )
    
    # Drop the old enum type
    op.execute(
        """
        DROP TYPE user_role;
        """
    )
    
    # Rename the new enum type to the original name
    op.execute(
        """
        ALTER TYPE user_role_new RENAME TO user_role;
        """
    )
    
    # Step 2: Update all TEACHER values to ADVISER
    op.execute(
        """
        UPDATE users 
        SET role = 'ADVISER'::user_role
        WHERE role = 'TEACHER'::user_role;
        """
    )
    
    # Step 3: Create the final enum without TEACHER
    op.execute(
        """
        CREATE TYPE user_role_final AS ENUM ('STUDENT', 'ADVISER', 'ADMIN');
        """
    )
    
    # Convert to the final enum (without TEACHER)
    op.execute(
        """
        ALTER TABLE users 
        ALTER COLUMN role TYPE user_role_final USING role::text::user_role_final;
        """
    )
    
    # Drop the intermediate enum
    op.execute(
        """
        DROP TYPE user_role;
        """
    )
    
    # Rename the final enum to the original name
    op.execute(
        """
        ALTER TYPE user_role_final RENAME TO user_role;
        """
    )
    
    # Step 4: Create the advisers table
    op.create_table(
        "advisers",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("department", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )


def downgrade() -> None:
    # Drop the advisers table
    op.drop_table("advisers")
    
    # Revert the enum change (not recommended in production)
    op.execute(
        """
        CREATE TYPE user_role_old AS ENUM ('STUDENT', 'TEACHER', 'ADMIN');
        """
    )
    
    op.execute(
        """
        ALTER TABLE users 
        ALTER COLUMN role TYPE user_role_old USING role::text::user_role_old;
        """
    )
    
    op.execute(
        """
        DROP TYPE user_role;
        """
    )
    
    op.execute(
        """
        ALTER TYPE user_role_old RENAME TO user_role;
        """
    )
