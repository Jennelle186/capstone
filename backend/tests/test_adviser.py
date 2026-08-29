from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api import app
from app.auth import get_current_user
from app.database import get_db_session
from app.models import DocumentSubmission, DocumentSubmissionHistory, Student, UserRole


TEST_ADVISER_CLAIMS = {
    "role": "adviser",
}


@pytest.fixture
def client():
    async def override_get_current_user():
        return TEST_ADVISER_CLAIMS

    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        yield session

    @asynccontextmanager
    async def noop_lifespan(app):
        yield

    app.dependency_overrides[get_current_user] = override_get_current_user
    app.dependency_overrides[get_db_session] = override_get_db_session
    original_lifespan = app.router.lifespan_context
    app.router.lifespan_context = noop_lifespan

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
    app.router.lifespan_context = original_lifespan


@pytest.fixture
def adviser():
    return SimpleNamespace(id=uuid4(), user_id=uuid4())


@pytest.fixture
def submission_id():
    return uuid4()


@pytest.fixture
def student_id():
    return uuid4()


@pytest.fixture
def mock_student(student_id):
    return SimpleNamespace(
        id=student_id,
        user_id=uuid4(),
        school_year_id=uuid4(),
        program_id=uuid4(),
    )


@pytest.fixture
def mock_history_entry():
    return SimpleNamespace(
        id=uuid4(),
        action="UPLOADED",
        previous_status=None,
        new_status="uploaded",
        reason=None,
        reference_submission_id=None,
        created_at=datetime.now(timezone.utc),
    )


def _make_db_get_side_effect(submission, student, student_id, submission_id):
    async def _get(model, id):
        if model is DocumentSubmission and id == submission_id:
            return submission
        if model is Student and id == student_id:
            return student
        return None
    return _get


def _make_history_execute_result(history_entry, user_obj):
    result = MagicMock()
    result.all = MagicMock(return_value=[(history_entry, user_obj)])
    return result


class TestGetAdviserSubmissionHistory:
    def test_happy_path_returns_history(
        self, client, adviser, submission_id, student_id, mock_student, mock_history_entry
    ):
        submission = SimpleNamespace(
            id=submission_id,
            student_id=student_id,
        )

        async def override_get_db_session():
            session = AsyncMock()
            session.add = MagicMock()
            session.get = AsyncMock(
                side_effect=_make_db_get_side_effect(submission, mock_student, student_id, submission_id)
            )
            user_obj = SimpleNamespace(first_name="John", last_name="Doe")
            session.execute = AsyncMock(
                return_value=_make_history_execute_result(mock_history_entry, user_obj)
            )
            yield session

        app.dependency_overrides[get_db_session] = override_get_db_session

        with patch("app.routers.adviser.resolve_adviser", new_callable=AsyncMock, return_value=adviser):
            with patch("app.routers.adviser.get_department_ids_for_adviser", new_callable=AsyncMock) as mock_depts:
                mock_depts.return_value = {mock_student.program_id}
                response = client.get(f"/api/adviser/submissions/{submission_id}/history")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["action"] == "UPLOADED"
        assert data[0]["actor_name"] == "John Doe"

    def test_forbidden_when_department_mismatch(
        self, client, adviser, submission_id, student_id, mock_student
    ):
        submission = SimpleNamespace(
            id=submission_id,
            student_id=student_id,
        )

        async def override_get_db_session():
            session = AsyncMock()
            session.add = MagicMock()
            session.get = AsyncMock(
                side_effect=_make_db_get_side_effect(submission, mock_student, student_id, submission_id)
            )
            yield session

        app.dependency_overrides[get_db_session] = override_get_db_session

        with patch("app.routers.adviser.resolve_adviser", new_callable=AsyncMock, return_value=adviser):
            with patch("app.routers.adviser.get_department_ids_for_adviser", new_callable=AsyncMock) as mock_depts:
                mock_depts.return_value = {uuid4()}
                response = client.get(f"/api/adviser/submissions/{submission_id}/history")

        assert response.status_code == 403

    def test_student_not_found_returns_404(
        self, client, adviser, submission_id, student_id, mock_student
    ):
        submission = SimpleNamespace(
            id=submission_id,
            student_id=student_id,
        )
        async def override_get_db_session():
            session = AsyncMock()
            session.add = MagicMock()
            session.get = AsyncMock(
                side_effect=_make_db_get_side_effect(submission, None, student_id, submission_id)
            )
            yield session

        app.dependency_overrides[get_db_session] = override_get_db_session

        with patch("app.routers.adviser.resolve_adviser", new_callable=AsyncMock, return_value=adviser):
            response = client.get(f"/api/adviser/submissions/{submission_id}/history")

        assert response.status_code == 404

    def test_no_school_year_returns_404(
        self, client, adviser, submission_id, student_id, mock_student
    ):
        student_no_sy = SimpleNamespace(
            id=student_id,
            user_id=uuid4(),
            school_year_id=None,
            program_id=uuid4(),
        )
        submission = SimpleNamespace(
            id=submission_id,
            student_id=student_id,
        )
        async def override_get_db_session():
            session = AsyncMock()
            session.add = MagicMock()
            session.get = AsyncMock(
                side_effect=_make_db_get_side_effect(submission, student_no_sy, student_id, submission_id)
            )
            yield session

        app.dependency_overrides[get_db_session] = override_get_db_session

        with patch("app.routers.adviser.resolve_adviser", new_callable=AsyncMock, return_value=adviser):
            response = client.get(f"/api/adviser/submissions/{submission_id}/history")

        assert response.status_code == 404


class TestReassignStudentProgram:
    def _make_student(self, student_id):
        return SimpleNamespace(
            id=student_id,
            user_id=uuid4(),
            school_year_id=uuid4(),
            program_id=uuid4(),
            program_mismatch_pending=True,
            program_mismatch_extracted="BSIT",
        )

    def test_reassign_program_succeeds(self, client, adviser, student_id):
        from app.models import Department

        student = self._make_student(student_id)
        new_dept = SimpleNamespace(id=uuid4(), name="Bachelor of Science in IT", is_active=True)
        previous_program_id = student.program_id

        async def _get(model, id):
            if model is Student and id == student_id:
                return student
            if model is Department and id == new_dept.id:
                return new_dept
            return None

        async def override_get_db_session():
            session = AsyncMock()
            session.add = MagicMock()
            session.get = AsyncMock(side_effect=_get)
            yield session

        app.dependency_overrides[get_db_session] = override_get_db_session

        with patch("app.routers.adviser.resolve_adviser", new_callable=AsyncMock, return_value=adviser):
            with patch("app.routers.adviser.get_department_ids_for_adviser", new_callable=AsyncMock) as mock_depts:
                mock_depts.return_value = {student.program_id}
                response = client.post(
                    f"/api/adviser/students/{student_id}/reassign-program",
                    json={"program_id": str(new_dept.id), "reason": "Wrong program selected"},
                )

        assert response.status_code == 200
        body = response.json()
        assert body["new_program_id"] == str(new_dept.id)
        assert body["previous_program_id"] == str(previous_program_id)
        assert student.program_id == new_dept.id
        assert student.program_mismatch_pending is False
        assert student.program_mismatch_extracted is None

    def test_reassign_program_forbidden_when_no_access(self, client, adviser, student_id):
        from app.models import Department

        student = self._make_student(student_id)

        async def _get(model, id):
            if model is Student and id == student_id:
                return student
            return None

        async def override_get_db_session():
            session = AsyncMock()
            session.add = MagicMock()
            session.get = AsyncMock(side_effect=_get)
            yield session

        app.dependency_overrides[get_db_session] = override_get_db_session

        with patch("app.routers.adviser.resolve_adviser", new_callable=AsyncMock, return_value=adviser):
            with patch("app.routers.adviser.get_department_ids_for_adviser", new_callable=AsyncMock) as mock_depts:
                mock_depts.return_value = {uuid4()}
                response = client.post(
                    f"/api/adviser/students/{student_id}/reassign-program",
                    json={"program_id": str(uuid4())},
                )

        assert response.status_code == 404

    def test_reassign_program_400_inactive_department(self, client, adviser, student_id):
        from app.models import Department

        student = self._make_student(student_id)
        new_dept = SimpleNamespace(id=uuid4(), name="Inactive Program", is_active=False)

        async def _get(model, id):
            if model is Student and id == student_id:
                return student
            if model is Department and id == new_dept.id:
                return new_dept
            return None

        async def override_get_db_session():
            session = AsyncMock()
            session.add = MagicMock()
            session.get = AsyncMock(side_effect=_get)
            yield session

        app.dependency_overrides[get_db_session] = override_get_db_session

        with patch("app.routers.adviser.resolve_adviser", new_callable=AsyncMock, return_value=adviser):
            with patch("app.routers.adviser.get_department_ids_for_adviser", new_callable=AsyncMock) as mock_depts:
                mock_depts.return_value = {student.program_id}
                response = client.post(
                    f"/api/adviser/students/{student_id}/reassign-program",
                    json={"program_id": str(new_dept.id)},
                )

        assert response.status_code == 400
