"""Saving a requirement slot that has no items.

A slot can be left without items, for example after the document types it
pointed at were removed. Saving the requirements must not fail on it.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.models import RequirementSlot, RequirementSlotItem
from app.services.requirements import replace_requirement_slots


def _empty_result():
    result = MagicMock()
    result.scalars.return_value.all.return_value = []
    result.all.return_value = []
    return result


@pytest.mark.asyncio
async def test_slot_with_empty_items_saves_without_error():
    db = AsyncMock()
    db.add = MagicMock()
    db.execute = AsyncMock(return_value=_empty_result())

    await replace_requirement_slots(
        db,
        uuid4(),
        [{"slot_type": "solo", "items": []}],
    )

    slots = [c.args[0] for c in db.add.call_args_list if isinstance(c.args[0], RequirementSlot)]
    items = [c.args[0] for c in db.add.call_args_list if isinstance(c.args[0], RequirementSlotItem)]
    assert len(slots) == 1
    assert slots[0].snapshot_fields_json is None
    assert items == []


@pytest.mark.asyncio
async def test_slot_with_no_items_key_saves_without_error():
    db = AsyncMock()
    db.add = MagicMock()
    db.execute = AsyncMock(return_value=_empty_result())

    await replace_requirement_slots(
        db,
        uuid4(),
        [{"slot_type": "solo"}],
    )

    slots = [c.args[0] for c in db.add.call_args_list if isinstance(c.args[0], RequirementSlot)]
    assert len(slots) == 1
    assert slots[0].snapshot_fields_json is None
