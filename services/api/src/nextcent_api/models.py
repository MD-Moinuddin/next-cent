import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    Text,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from nextcent_api.clock import utcnow


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    auth_subject: Mapped[str] = mapped_column(String(255), unique=True)
    home_currency: Mapped[str] = mapped_column(String(3), default="USD")
    onboarded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Category(Base):
    __tablename__ = "categories"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(60))
    icon: Mapped[str] = mapped_column(String(16), default="🗂️")
    color: Mapped[str | None] = mapped_column(String(7))
    parent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id"))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        Index(
            "uq_category_active_name",
            "user_id",
            text("lower(name)"),
            unique=True,
            postgresql_where=text("archived_at IS NULL"),
        ),
    )


class Tag(Base):
    __tablename__ = "tags"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(30))
    __table_args__ = (Index("uq_tag_name", "user_id", text("lower(name)"), unique=True),)


transaction_tags = Table(
    "transaction_tags",
    Base.metadata,
    Column("transaction_id", ForeignKey("transactions.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class RecurringRule(Base):
    __tablename__ = "recurring_rules"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(10))
    amount_minor: Mapped[int] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(String(3))
    category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id"))
    merchant: Mapped[str | None] = mapped_column(String(120))
    cadence: Mapped[str] = mapped_column(String(10))
    anchor_on: Mapped[date] = mapped_column(Date)
    next_due_on: Mapped[date] = mapped_column(Date)
    occurrences: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    system_key: Mapped[str | None] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (
        CheckConstraint("kind IN ('expense','income')", name="ck_rule_kind"),
        CheckConstraint("cadence IN ('weekly','monthly','yearly')", name="ck_rule_cadence"),
        CheckConstraint(
            "amount_minor > 0 AND amount_minor <= 1000000000000", name="ck_rule_amount"
        ),
        CheckConstraint("currency ~ '^[A-Z]{3}$'", name="ck_rule_currency"),
        CheckConstraint(
            "kind <> 'expense' OR category_id IS NOT NULL", name="ck_rule_expense_category"
        ),
        Index(
            "uq_recurring_system_key",
            "user_id",
            "system_key",
            unique=True,
            postgresql_where=text("system_key IS NOT NULL"),
        ),
        Index("ix_rule_due", "active", "next_due_on"),
    )


class Transaction(Base):
    __tablename__ = "transactions"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)  # client-generated
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(16))
    amount_minor: Mapped[int] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(String(3))
    occurred_on: Mapped[date] = mapped_column(Date)
    category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id"))
    merchant: Mapped[str | None] = mapped_column(String(120))
    note: Mapped[str | None] = mapped_column(Text)
    recurring_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("recurring_rules.id"))
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    tags: Mapped[list[Tag]] = relationship(secondary=transaction_tags, lazy="selectin")
    __table_args__ = (
        CheckConstraint("kind IN ('expense','income','opening_balance')", name="ck_tx_kind"),
        CheckConstraint(
            "(kind = 'opening_balance' AND amount_minor >= 0) OR amount_minor > 0",
            name="ck_tx_amount",
        ),
        CheckConstraint("amount_minor <= 1000000000000", name="ck_tx_amount_max"),
        CheckConstraint("currency ~ '^[A-Z]{3}$'", name="ck_tx_currency"),
        CheckConstraint(
            "kind <> 'expense' OR category_id IS NOT NULL", name="ck_tx_expense_category"
        ),
        Index(
            "uq_one_opening_balance",
            "user_id",
            unique=True,
            postgresql_where=text("kind = 'opening_balance' AND deleted_at IS NULL"),
        ),
        Index(
            "uq_recurring_occurrence",
            "recurring_id",
            "occurred_on",
            unique=True,
            postgresql_where=text("recurring_id IS NOT NULL"),
        ),
        Index("ix_tx_user_date", "user_id", "occurred_on"),
        Index("ix_tx_user_category", "user_id", "category_id"),
        Index("ix_tx_user_updated", "user_id", "updated_at"),
    )
