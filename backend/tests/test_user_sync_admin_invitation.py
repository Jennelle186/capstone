from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.models import AdviserInvitationStatus, UserRole
from app.services.user_sync import _promote_and_finalize_admin_invitation


def _make_admin_invitation():
    return SimpleNamespace(
        email="admin@example.com",
        first_name="Alice",
        middle_name=None,
        last_name="Smith",
        status=AdviserInvitationStatus.PENDING,
    )


def _make_user(role: UserRole = UserRole.STUDENT):
    return SimpleNamespace(
        id=uuid4(),
        clerk_user_id="clerk_1",
        email="admin@example.com",
        role=role,
        first_name=None,
        middle_name=None,
        last_name=None,
    )


class TestPromoteAndFinalizeAdminInvitation:
    @pytest.mark.asyncio
    async def test_promotes_matching_user_to_admin(self):
        user = _make_user(UserRole.STUDENT)
        invitation = _make_admin_invitation()

        async def _execute(stmt):
            if "admin_invitations" in str(stmt):
                result = MagicMock()
                result.scalars.return_value = MagicMock(first=MagicMock(return_value=invitation))
                return result
            return MagicMock()

        db = MagicMock()
        db.execute = AsyncMock(side_effect=_execute)
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        db.rollback = AsyncMock()

        with patch(
            "app.services.user_sync.update_user_personal_names",
            new_callable=AsyncMock,
            return_value=("Alice", "Smith"),
        ):
            await _promote_and_finalize_admin_invitation(db, user)

        assert user.role == UserRole.ADMIN
        assert invitation.status == AdviserInvitationStatus.ACCEPTED
        assert invitation.accepted_user_id == user.id
        assert invitation.accepted_at is not None

    @pytest.mark.asyncio
    async def test_syncs_clerk_role_metadata_to_admin(self):
        user = _make_user(UserRole.STUDENT)
        invitation = _make_admin_invitation()

        async def _execute(stmt):
            if "admin_invitations" in str(stmt):
                result = MagicMock()
                result.scalars.return_value = MagicMock(first=MagicMock(return_value=invitation))
                return result
            return MagicMock()

        db = MagicMock()
        db.execute = AsyncMock(side_effect=_execute)
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        db.rollback = AsyncMock()

        with (
            patch(
                "app.services.user_sync.update_user_personal_names",
                new_callable=AsyncMock,
                return_value=("Alice", "Smith"),
            ),
            patch(
                "app.services.user_sync.update_user_public_metadata",
                new_callable=AsyncMock,
            ) as mock_metadata,
        ):
            await _promote_and_finalize_admin_invitation(db, user)

        mock_metadata.assert_awaited_once_with(user.clerk_user_id, {"role": UserRole.ADMIN.value})

    @pytest.mark.asyncio
    async def test_does_nothing_when_no_matching_invitation(self):
        user = _make_user(UserRole.STUDENT)

        async def _execute(stmt):
            if "admin_invitations" in str(stmt):
                result = MagicMock()
                result.scalars.return_value = MagicMock(first=MagicMock(return_value=None))
                return result
            return MagicMock()

        db = MagicMock()
        db.execute = AsyncMock(side_effect=_execute)
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        db.rollback = AsyncMock()

        await _promote_and_finalize_admin_invitation(db, user)

        assert user.role == UserRole.STUDENT
