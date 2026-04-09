"""Rename English-specific columns to language-agnostic names.

Revision ID: 0002
Revises: 01b468e40294
Create Date: 2026-04-08
"""

from alembic import op

revision = "0002"
down_revision = "01b468e40294"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("words", "english", new_column_name="term")
    op.alter_column("words", "chinese", new_column_name="definition")
    op.alter_column("words", "kk_phonetic", new_column_name="reading")


def downgrade() -> None:
    op.alter_column("words", "term", new_column_name="english")
    op.alter_column("words", "definition", new_column_name="chinese")
    op.alter_column("words", "reading", new_column_name="kk_phonetic")
