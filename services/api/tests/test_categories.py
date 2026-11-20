import asyncio

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select

from nextcent_api.models import Category
from nextcent_api.routers import categories as categories_router


async def _all(client: AsyncClient) -> list[dict]:
    r = await client.get("/v1/categories?include_archived=true")
    assert r.status_code == 200, r.text
    return r.json()


async def _active(client: AsyncClient) -> list[dict]:
    r = await client.get("/v1/categories")
    assert r.status_code == 200, r.text
    return r.json()


async def _find(client: AsyncClient, name: str) -> dict:
    match = [c for c in await _all(client) if c["name"] == name]
    assert len(match) == 1, f"expected exactly one category named {name!r}"
    return match[0]


async def _create(client: AsyncClient, name: str) -> dict:
    r = await client.post("/v1/categories", json={"name": name})
    assert r.status_code == 201, r.text
    return r.json()


async def _archive(client: AsyncClient, category_id: str) -> None:
    r = await client.patch(f"/v1/categories/{category_id}", json={"archived": True})
    assert r.status_code == 200, r.text


async def test_list_returns_twelve_defaults(client_a):
    r = await client_a.get("/v1/categories")
    assert r.status_code == 200
    assert len(r.json()) == 12


async def test_create_and_duplicate_name_is_case_insensitive(client_a):
    ok = await client_a.post(
        "/v1/categories", json={"name": "Pets", "icon": "🐶", "color": "#ff8800"}
    )
    assert ok.status_code == 201 and ok.json()["name"] == "Pets"
    dup = await client_a.post("/v1/categories", json={"name": "pets"})
    assert dup.status_code == 409 and dup.json()["code"] == "category_exists"


@pytest.mark.parametrize("duplicate", ["PETS", "pEtS", " Pets "])
async def test_duplicate_name_is_case_and_space_insensitive(client_a, duplicate):
    await _create(client_a, "Pets")
    dup = await client_a.post("/v1/categories", json={"name": duplicate})
    assert dup.status_code == 409, duplicate
    assert dup.json()["code"] == "category_exists"


async def test_concurrent_creates_of_same_name_yield_one_201_and_one_409(
    client_a, db_session, monkeypatch
):
    await _active(client_a)  # provision user before the race
    # Hold both requests after the real pre-check so both see "free" and both reach the INSERT.
    real_name_taken = categories_router._name_taken
    barrier = asyncio.Barrier(2)

    async def gated_name_taken(*args: object) -> bool:
        result = await real_name_taken(*args)
        await asyncio.wait_for(barrier.wait(), timeout=5)
        return result

    monkeypatch.setattr(categories_router, "_name_taken", gated_name_taken)
    first, second = await asyncio.gather(
        client_a.post("/v1/categories", json={"name": "Racy"}),
        client_a.post("/v1/categories", json={"name": "Racy"}),
    )
    assert sorted([first.status_code, second.status_code]) == [201, 409], (
        first.text,
        second.text,
    )
    conflict = first if first.status_code == 409 else second
    assert conflict.json()["code"] == "category_exists"
    active_racy = await db_session.scalar(
        select(func.count())
        .select_from(Category)
        .where(func.lower(Category.name) == "racy", Category.archived_at.is_(None))
    )
    assert active_racy == 1


async def test_insert_race_after_precheck_maps_to_409(client_a, monkeypatch):
    # Force the pre-check to miss, so only the unique index can reject the write.
    await _active(client_a)

    async def never_taken(*_: object) -> bool:
        return False

    monkeypatch.setattr(categories_router, "_name_taken", never_taken)
    create = await client_a.post("/v1/categories", json={"name": "Groceries"})
    assert create.status_code == 409 and create.json()["code"] == "category_exists"

    dining = await _find(client_a, "Dining")
    rename = await client_a.patch(f"/v1/categories/{dining['id']}", json={"name": "Groceries"})
    assert rename.status_code == 409 and rename.json()["code"] == "category_exists"
    assert (await _find(client_a, "Dining"))["name"] == "Dining"


async def test_rename_icon_color(client_a):
    cat = (await _active(client_a))[0]
    r = await client_a.patch(
        f"/v1/categories/{cat['id']}", json={"name": "Renamed", "icon": "⭐", "color": "#112233"}
    )
    assert r.status_code == 200
    assert (r.json()["name"], r.json()["icon"], r.json()["color"]) == ("Renamed", "⭐", "#112233")


async def test_archive_hides_and_restore_shows(client_a):
    cat = (await _active(client_a))[0]
    await _archive(client_a, cat["id"])
    assert cat["id"] not in [c["id"] for c in (await _active(client_a))]
    archived = await _find(client_a, cat["name"])
    assert archived["archived_at"] is not None
    restore = await client_a.patch(f"/v1/categories/{cat['id']}", json={"archived": False})
    assert restore.status_code == 200, restore.text
    assert cat["id"] in [c["id"] for c in (await _active(client_a))]


async def test_restore_conflicts_with_active_same_name(client_a):
    cat = (await _active(client_a))[0]
    await _archive(client_a, cat["id"])
    await _create(client_a, cat["name"])
    r = await client_a.patch(f"/v1/categories/{cat['id']}", json={"archived": False})
    assert r.status_code == 409 and r.json()["code"] == "category_exists"


async def test_renaming_archived_to_active_name_is_allowed_but_restore_conflicts(client_a):
    await _archive(client_a, (await _find(client_a, "Groceries"))["id"])
    snacks = await _create(client_a, "Snacks")
    groceries = await _find(client_a, "Groceries")
    renamed = await client_a.patch(f"/v1/categories/{groceries['id']}", json={"name": "Snacks"})
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["archived_at"] is not None
    restore = await client_a.patch(f"/v1/categories/{groceries['id']}", json={"archived": False})
    assert restore.status_code == 409 and restore.json()["code"] == "category_exists"
    active_ids = {c["id"] for c in (await _active(client_a))}
    assert snacks["id"] in active_ids and groceries["id"] not in active_ids


async def test_restore_with_rename_to_taken_name_returns_409_and_stays_archived(client_a):
    travel = await _find(client_a, "Travel")
    await _archive(client_a, travel["id"])
    r = await client_a.patch(
        f"/v1/categories/{travel['id']}", json={"archived": False, "name": "Dining"}
    )
    assert r.status_code == 409 and r.json()["code"] == "category_exists"
    still = await _find(client_a, "Travel")
    assert still["archived_at"] is not None and still["name"] == "Travel"


async def test_restore_with_rename_to_free_name_restores_and_renames(client_a):
    travel = await _find(client_a, "Travel")
    await _archive(client_a, travel["id"])
    r = await client_a.patch(
        f"/v1/categories/{travel['id']}", json={"archived": False, "name": "Trips"}
    )
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "Trips" and r.json()["archived_at"] is None


async def test_validation(client_a):
    for bad in ({"name": ""}, {"name": "x" * 61}, {"name": "ok", "color": "red"}, {"name": "  "}):
        assert (await client_a.post("/v1/categories", json=bad)).status_code == 422, bad


async def test_other_users_category_is_untouched_and_404(client_a, client_b):
    before = await _all(client_a)
    target = before[0]
    await _active(client_b)  # provision user b
    attempts = (
        {"name": "Hacked"},
        {"icon": "💀"},
        {"color": "#000000"},
        {"archived": True},
    )
    for body in attempts:
        r = await client_b.patch(f"/v1/categories/{target['id']}", json=body)
        assert r.status_code == 404 and r.json()["code"] == "category_not_found", body
    assert await _all(client_a) == before
    b_ids = {c["id"] for c in await _all(client_b)}
    assert target["id"] not in b_ids
    assert b_ids.isdisjoint({c["id"] for c in before})
