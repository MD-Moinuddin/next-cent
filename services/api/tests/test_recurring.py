import asyncio
import json
import logging
import uuid
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from nextcent_api.clock import utcnow
from nextcent_api.models import RecurringRule, Transaction
from nextcent_api.services.recurring import (
    add_months,
    advance_past,
    generate_due_transactions,
    occurrence_date,
)


def test_add_months_clamps_to_month_end():
    assert add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)
    assert add_months(date(2028, 1, 31), 1) == date(2028, 2, 29)
    assert add_months(date(2026, 1, 31), 2) == date(2026, 3, 31)
    assert add_months(date(2026, 11, 15), 3) == date(2027, 2, 15)


def test_occurrence_dates_do_not_drift():
    anchor = date(2026, 1, 31)
    assert [occurrence_date(anchor, "monthly", n) for n in range(4)] == [
        date(2026, 1, 31), date(2026, 2, 28), date(2026, 3, 31), date(2026, 4, 30),
    ]  # fmt: skip
    assert occurrence_date(date(2026, 11, 2), "weekly", 2) == date(2026, 11, 16)
    assert occurrence_date(date(2028, 2, 29), "yearly", 1) == date(2029, 2, 28)


async def new_rule(client, db, **over):
    """Create a rule through the API, then move its anchor to `anchor_on` (default 2026-08-31).

    The API only accepts anchors near today (tested separately below), so generation tests that need
    a fixed historical anchor create the rule with today's date and rewrite the anchor in the
    database, as data created before the bound existed would look.
    """
    anchor = date.fromisoformat(over.pop("anchor_on", "2026-08-31"))
    cat = (await client.get("/v1/categories")).json()[0]["id"]
    body = {"kind": "expense", "amount_minor": 55000, "currency": "EUR", "category_id": cat,
            "merchant": "Rent", "cadence": "monthly",
            "anchor_on": utcnow().date().isoformat()}  # fmt: skip
    body.update(over)
    r = await client.post("/v1/recurring", json=body)
    if r.status_code == 201:
        rule = await db.get(RecurringRule, uuid.UUID(r.json()["id"]))
        rule.anchor_on = rule.next_due_on = anchor
        await db.commit()
    return r


async def test_create_list_patch_and_validation(client_a, db_session):
    r = await new_rule(client_a, db_session)
    assert r.status_code == 201
    rule = r.json()
    today = utcnow().date().isoformat()
    assert rule["anchor_on"] == rule["next_due_on"] == today and rule["active"] is True
    assert rule["is_primary_income"] is False
    assert len((await client_a.get("/v1/recurring")).json()) == 1
    patched = await client_a.patch(
        f"/v1/recurring/{rule['id']}", json={"amount_minor": 60000, "active": False}
    )
    assert patched.json()["amount_minor"] == 60000 and patched.json()["active"] is False
    assert (await new_rule(client_a, db_session, category_id=None)).status_code == 422
    assert (await new_rule(client_a, db_session, cadence="daily")).status_code == 422
    assert (await new_rule(client_a, db_session, amount_minor=0)).status_code == 422


async def test_other_users_rule_is_404(client_a, client_b, db_session):
    rule = (await new_rule(client_a, db_session)).json()
    await client_b.get("/v1/me")
    r = await client_b.patch(f"/v1/recurring/{rule['id']}", json={"active": False})
    assert r.status_code == 404


async def test_generation_catches_up_and_clamps(client_a, db_session):
    await new_rule(client_a, db_session)
    created = (await generate_due_transactions(db_session, date(2026, 11, 30))).created
    assert created == 4
    dates = (
        await db_session.scalars(select(Transaction.occurred_on).order_by(Transaction.occurred_on))
    ).all()
    assert dates == [date(2026, 8, 31), date(2026, 9, 30), date(2026, 10, 31), date(2026, 11, 30)]
    rule = await db_session.scalar(select(RecurringRule))
    assert rule.next_due_on == date(2026, 12, 31) and rule.occurrences == 4
    tx = await db_session.scalar(select(Transaction))
    assert tx.recurring_id == rule.id and tx.amount_minor == 55000 and tx.version == 1


async def test_generation_is_idempotent_even_if_rule_state_is_rewound(client_a, db_session):
    await new_rule(client_a, db_session)
    await generate_due_transactions(db_session, date(2026, 11, 30))
    assert (await generate_due_transactions(db_session, date(2026, 11, 30))).created == 0
    rule = await db_session.scalar(select(RecurringRule))
    rule.next_due_on, rule.occurrences = date(2026, 11, 30), 3  # simulate a crashed run
    await db_session.commit()
    assert (await generate_due_transactions(db_session, date(2026, 11, 30))).created == 0
    assert await db_session.scalar(select(func.count()).select_from(Transaction)) == 4


async def test_inactive_rules_are_ignored_and_future_rules_wait(client_a, db_session):
    rule = (await new_rule(client_a, db_session)).json()
    await client_a.patch(f"/v1/recurring/{rule['id']}", json={"active": False})
    await new_rule(client_a, db_session, anchor_on="2027-01-01")
    assert (await generate_due_transactions(db_session, date(2026, 11, 30))).created == 0


async def test_catch_up_is_capped_per_run(client_a, db_session):
    await new_rule(client_a, db_session, cadence="weekly", anchor_on="2000-01-03")
    assert (await generate_due_transactions(db_session, date(2026, 11, 30))).created == 366


async def test_internal_endpoint_requires_secret(anon_client, client_a, db_session):
    await new_rule(client_a, db_session, anchor_on="2000-01-31", cadence="yearly")
    denied = await anon_client.post("/internal/tasks/generate-recurring")
    wrong = await anon_client.post(
        "/internal/tasks/generate-recurring", headers={"X-Internal-Secret": "nope"}
    )
    assert denied.status_code == 403 and wrong.status_code == 403
    ok = await anon_client.post(
        "/internal/tasks/generate-recurring", headers={"X-Internal-Secret": "test-secret"}
    )
    assert ok.status_code == 200 and ok.json()["created"] >= 1 and ok.json()["failed"] == 0


async def test_internal_route_is_hidden_from_openapi(anon_client):
    spec = (await anon_client.get("/openapi.json")).json()
    assert not any(p.startswith("/internal") for p in spec["paths"])


def test_advance_past_monthly_clamps():
    # anchor on the 31st: occurrences are Jan31, Feb28, Mar31, Apr30 ...
    assert advance_past(date(2026, 1, 31), "monthly", 0, date(2026, 2, 28)) == (
        2,
        date(2026, 3, 31),
    )
    assert advance_past(date(2026, 1, 31), "monthly", 1, date(2026, 4, 29)) == (
        3,
        date(2026, 4, 30),
    )


def test_advance_past_weekly_and_yearly():
    assert advance_past(date(2026, 11, 2), "weekly", 0, date(2026, 11, 16)) == (
        3,
        date(2026, 11, 23),
    )
    assert advance_past(date(2028, 2, 29), "yearly", 0, date(2029, 2, 28)) == (2, date(2030, 2, 28))


def test_advance_past_leaves_future_rules_alone():
    assert advance_past(date(2026, 1, 31), "monthly", 2, date(2026, 3, 30)) == (
        2,
        date(2026, 3, 31),
    )


async def _paused_rule(client, db_session):
    rule = (await new_rule(client, db_session, anchor_on="2025-01-31")).json()
    await client.patch(f"/v1/recurring/{rule['id']}", json={"active": False})
    return rule["id"]


def _assert_first_after_today(rule: RecurringRule, today: date) -> None:
    assert rule.next_due_on > today
    assert rule.next_due_on == occurrence_date(rule.anchor_on, rule.cadence, rule.occurrences)
    assert occurrence_date(rule.anchor_on, rule.cadence, rule.occurrences - 1) <= today


async def test_patch_reactivation_does_not_backfill(client_a, db_session):
    rule_id = await _paused_rule(client_a, db_session)
    today = utcnow().date()
    r = await client_a.patch(f"/v1/recurring/{rule_id}", json={"active": True})
    assert r.json()["active"] is True
    rule = await db_session.scalar(select(RecurringRule))
    _assert_first_after_today(rule, today)
    assert r.json()["next_due_on"] == rule.next_due_on.isoformat()
    assert (await generate_due_transactions(db_session, today)).created == 0
    assert await db_session.scalar(select(func.count()).select_from(Transaction)) == 0


async def test_reactivating_an_active_rule_changes_nothing(client_a, db_session):
    rule = (await new_rule(client_a, db_session, anchor_on="2025-01-31")).json()
    r = await client_a.patch(f"/v1/recurring/{rule['id']}", json={"active": True})
    assert r.json()["next_due_on"] == "2025-01-31"
    stored = await db_session.scalar(select(RecurringRule))
    assert stored.occurrences == 0


async def test_me_reenabling_income_does_not_backfill(client_a, db_session):
    await client_a.patch("/v1/me", json={"monthly_income_minor": 5000})
    await client_a.patch("/v1/me", json={"monthly_income_minor": None})
    rule = await db_session.scalar(select(RecurringRule))
    rule.anchor_on = rule.next_due_on = date(2025, 1, 1)
    rule.occurrences = 0
    await db_session.commit()
    today = utcnow().date()
    await client_a.patch("/v1/me", json={"monthly_income_minor": 7000})
    await db_session.refresh(rule)
    assert rule.active is True and rule.amount_minor == 7000
    _assert_first_after_today(rule, today)
    assert (await generate_due_transactions(db_session, today)).created == 0


async def test_concurrent_generation_creates_each_occurrence_once(client_a, db_session, app):
    for _ in range(6):
        await new_rule(client_a, db_session)  # 4 occurrences each by 2026-11-30
    sessionmaker: async_sessionmaker = app.state.sessionmaker

    async def run() -> int:
        async with sessionmaker() as session:
            return (await generate_due_transactions(session, date(2026, 11, 30))).created

    results = await asyncio.gather(run(), run())
    assert sum(results) == 24
    total = await db_session.scalar(select(func.count()).select_from(Transaction))
    distinct = await db_session.scalar(
        select(func.count()).select_from(
            select(Transaction.recurring_id, Transaction.occurred_on).distinct().subquery()
        )
    )
    assert total == distinct == 24


async def _post_rule(client, anchor: date):
    cat = (await client.get("/v1/categories")).json()[0]["id"]
    body = {"kind": "expense", "amount_minor": 1000, "currency": "EUR", "category_id": cat,
            "cadence": "weekly", "anchor_on": anchor.isoformat()}  # fmt: skip
    return await client.post("/v1/recurring", json=body)


async def test_anchor_on_must_be_within_the_allowed_window(client_a):
    today = utcnow().date()
    assert (await _post_rule(client_a, today - timedelta(days=366))).status_code == 201
    assert (await _post_rule(client_a, today + timedelta(days=3660))).status_code == 201
    for bad in (today - timedelta(days=367), today + timedelta(days=3661), date(1, 1, 1)):
        r = await _post_rule(client_a, bad)
        assert r.status_code == 422, bad
        assert r.headers["content-type"].startswith("application/problem+json")
        assert r.json()["code"] == "anchor_out_of_range"
    assert len((await client_a.get("/v1/recurring")).json()) == 2


async def test_at_most_100_rules_per_user(client_a, client_b, db_session):
    me = (await client_a.get("/v1/me")).json()
    cat = (await client_a.get("/v1/categories")).json()[0]["id"]
    today = utcnow().date()
    for _ in range(99):
        db_session.add(
            RecurringRule(
                user_id=uuid.UUID(me["id"]),
                kind="expense",
                amount_minor=100,
                currency="EUR",
                category_id=uuid.UUID(cat),
                cadence="weekly",
                anchor_on=today,
                next_due_on=today,
            )  # fmt: skip
        )
    await db_session.commit()
    assert (await _post_rule(client_a, today)).status_code == 201  # the 100th
    r = await _post_rule(client_a, today)
    assert r.status_code == 409 and r.json()["code"] == "too_many_rules"
    count = select(func.count()).select_from(RecurringRule)
    assert await db_session.scalar(count) == 100
    assert (await _post_rule(client_b, today)).status_code == 201  # the cap is per user


async def test_a_poison_rule_does_not_block_other_rules(client_a, db_session, engine):
    """A rule whose insert fails is skipped and counted; every other rule still generates."""
    good_1 = (await new_rule(client_a, db_session)).json()["id"]
    poison = (await new_rule(client_a, db_session, merchant="POISON-7f3a")).json()["id"]
    good_2 = (await new_rule(client_a, db_session)).json()["id"]
    async with engine.begin() as conn:
        await conn.exec_driver_sql(
            "CREATE FUNCTION test_poison() RETURNS trigger AS $$ BEGIN "
            "IF NEW.merchant = 'POISON-7f3a' THEN RAISE EXCEPTION 'poisoned row'; END IF; "
            "RETURN NEW; END $$ LANGUAGE plpgsql"
        )
        await conn.exec_driver_sql(
            "CREATE TRIGGER test_poison BEFORE INSERT ON transactions "
            "FOR EACH ROW EXECUTE FUNCTION test_poison()"
        )
    root = logging.getLogger()
    records: list[logging.LogRecord] = []

    class Capture(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            records.append(record)

    capture = Capture()
    root.addHandler(capture)
    try:
        result = await generate_due_transactions(db_session, date(2026, 11, 30))
    finally:
        root.removeHandler(capture)
        async with engine.begin() as conn:
            await conn.exec_driver_sql("DROP TRIGGER test_poison ON transactions")
            await conn.exec_driver_sql("DROP FUNCTION test_poison()")
    assert (result.created, result.failed) == (8, 1)
    per_rule = dict(
        (
            await db_session.execute(
                select(Transaction.recurring_id, func.count()).group_by(Transaction.recurring_id)
            )
        ).all()
    )
    assert per_rule == {uuid.UUID(good_1): 4, uuid.UUID(good_2): 4}
    db_session.expire_all()
    stuck = await db_session.get(RecurringRule, uuid.UUID(poison))
    assert stuck.next_due_on == date(2026, 8, 31) and stuck.occurrences == 0  # rolled back
    logged = "\n".join(
        json.dumps({"m": r.getMessage(), "e": str(r.exc_info[1]) if r.exc_info else ""})
        for r in records
    )
    assert poison in logged  # the failure is visible for operators...
    assert "POISON-7f3a" not in logged and "55000" not in logged  # ...without row data


async def test_a_rule_whose_commit_fails_is_counted_only_as_failed(
    client_a, db_session, monkeypatch
):
    await new_rule(client_a, db_session)  # 4 occurrences by 2026-11-30
    await new_rule(client_a, db_session)
    real_commit = db_session.commit
    commits = 0

    async def flaky_commit() -> None:
        nonlocal commits
        commits += 1
        if commits == 2:  # the first rule's commit (the first commit ends the id snapshot)
            raise RuntimeError("commit failed")
        await real_commit()

    monkeypatch.setattr(db_session, "commit", flaky_commit)
    result = await generate_due_transactions(db_session, date(2026, 11, 30))
    monkeypatch.setattr(db_session, "commit", real_commit)
    assert (result.created, result.failed) == (4, 1)
    total = await db_session.scalar(select(func.count()).select_from(Transaction))
    assert total == 4  # the failed rule's rows were rolled back, so they are not "created"
