from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.models import ProgramAdviserAssignment, UserRole
from app.services.helpers import program_uuid_for_department_code
from app.services.user_sync import _promote_and_finalize_adviser_invitation


def _make_invitation(department_code, school_year_id):
    """Build a mock invitation with no name fields so Clerk name sync is skipped."""
    return SimpleNamespace(
        department_code=department_code,
        school_year_id=school_year_id,
        first_name=None,
        last_name=None,
        middle_name=None,
        status="pending",
    )


def _make_user():
    """Build a mock user that is already an adviser."""
    return SimpleNamespace(
        id=uuid4(),
        clerk_user_id="clerk_1",
        email="adviser@example.com",
        role=UserRole.ADVISER,
        first_name="Jane",
        last_name="Doe",
        middle_name=None,
    )


class TestPromoteAndFinalizeAdviserInvitation:
    @pytest.mark.asyncio
    async def test_appends_new_assignment_for_second_program(self):
        """Accepting an invitation to a second program adds a row without deleting others."""
        user = _make_user()
        adviser = SimpleNamespace(id=uuid4(), user_id=user.id)
        school_year_id = uuid4()
        invitation = _make_invitation("BSCS", school_year_id)

        async def _execute(stmt):
            if "adviser_invitations" in str(stmt):
                result = MagicMock()
                result.scalars.return_value = MagicMock(first=MagicMock(return_value=invitation))
                return result
            if "program_adviser_assignments" in str(stmt):
                result = MagicMock()
                # No existing assignment row -> adviser is being added to BSCS fresh.
                result.scalar_one_or_none = MagicMock(return_value=None)
                return result
            if "advisers" in str(stmt):
                result = MagicMock()
                result.scalar_one_or_none = MagicMock(return_value=adviser)
                return result
            return MagicMock()

        db = MagicMock()
        db.add = MagicMock()
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        db.rollback = AsyncMock()
        db.refresh = AsyncMock()
        db.execute = AsyncMock(side_effect=_execute)
        db.get = AsyncMock(return_value=None)

        with patch("app.services.user_sync.update_user_personal_names", new_callable=AsyncMock, return_value=None):
            await _promote_and_finalize_adviser_invitation(db, user)

        assignment_adds = [
            call.args[0] for call in db.add.call_args_list
            if isinstance(call.args[0], ProgramAdviserAssignment)
        ]
        # A new assignment row must be appended (not a delete-and-replace).
        assert len(assignment_adds) == 1
        assert assignment_adds[0].program_id == program_uuid_for_department_code("BSCS")
        assert assignment_adds[0].school_year_id == school_year_id
        assert assignment_adds[0].adviser_id == adviser.id
        # Nothing is deleted: existing assignments for other programs stay intact.
        assert not any(call[0] is not None for call in db.delete.call_args_list if call)

    @pytest.mark.asyncio
    async def test_does_not_duplicate_existing_assignment(self):
        """Accepting an invitation for an already-assigned program adds nothing."""
        user = _make_user()
        adviser = SimpleNamespace(id=uuid4(), user_id=user.id)
        school_year_id = uuid4()
        invitation = _make_invitation("BSCS", school_year_id)
        existing_assignment_id = uuid4()

        async def _execute(stmt):
            if "adviser_invitations" in str(stmt):
                result = MagicMock()
                result.scalars.return_value = MagicMock(first=MagicMock(return_value=invitation))
                return result
            if "program_adviser_assignments" in str(stmt):
                result = MagicMock()
                result.scalar_one_or_none = MagicMock(return_value=existing_assignment_id)
                return result
            if "advisers" in str(stmt):
                result = MagicMock()
                result.scalar_one_or_none = MagicMock(return_value=adviser)
                return result
            return MagicMock()

        db = MagicMock()
        db.add = MagicMock()
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        db.rollback = AsyncMock()
        db.refresh = AsyncMock()
        db.execute = AsyncMock(side_effect=_execute)
        db.get = AsyncMock(return_value=None)

        with patch("app.services.user_sync.update_user_personal_names", new_callable=AsyncMock, return_value=None):
            await _promote_and_finalize_adviser_invitation(db, user)

        assignment_adds = [
            call.args[0] for call in db.add.call_args_list
            if isinstance(call.args[0], ProgramAdviserAssignment)
        ]
        assert assignment_adds == []

    @pytest.mark.asyncio
    async def test_skips_assignment_when_invitation_lacks_program_metadata(self):
        """No assignment work happens when the invitation has no department/school year."""
        user = _make_user()
        adviser = SimpleNamespace(id=uuid4(), user_id=user.id)
        invitation = _make_invitation(None, None)

        async def _execute(stmt):
            if "adviser_invitations" in str(stmt):
                result = MagicMock()
                result.scalars.return_value = MagicMock(first=MagicMock(return_value=invitation))
                return result
            if "advisers" in str(stmt):
                result = MagicMock()
                result.scalar_one_or_none = MagicMock(return_value=adviser)
                return result
            return MagicMock()

        db = MagicMock()
        db.add = MagicMock()
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        db.rollback = AsyncMock()
        db.refresh = AsyncMock()
        db.execute = AsyncMock(side_effect=_execute)
        db.get = AsyncMock(return_value=None)

        with patch("app.services.user_sync.update_user_personal_names", new_callable=AsyncMock, return_value=None):
            await _promote_and_finalize_adviser_invitation(db, user)

        assignment_adds = [
            call.args[0] for call in db.add.call_args_list
            if isinstance(call.args[0], ProgramAdviserAssignment)
        ]
        assert assignment_adds == []