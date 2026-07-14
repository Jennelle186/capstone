"""
Resolve a program_id through the UUID v5 bridge to find which department it maps to.
"""
import asyncio

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import Department
from app.services.helpers import get_program_id_to_department_code_map


async def main():
    target = "bb6a37be-c418-5fec-95a5-be3f98185c16"
    async with AsyncSessionLocal() as db:
        mapping = await get_program_id_to_department_code_map(db)
        print(f"Bridge has {len(mapping)} entries\n")

        for pid, code in mapping.items():
            if str(pid) == target:
                print(f"Program ID resolves to department code: '{code}'")
                dept = (
                    await db.execute(
                        select(Department).where(Department.code.ilike(code))
                    )
                ).scalar_one_or_none()
                if dept:
                    print(f"Department found: {dept.name}  (id={dept.id})")
                else:
                    print(f"NO department with code '{code}' exists!")
                break
        else:
            print(f"Program ID NOT found in bridge mapping.")
            print(f"(Bridge has {len(mapping)} entries — the programme was likely deleted or never existed)")


if __name__ == "__main__":
    asyncio.run(main())
