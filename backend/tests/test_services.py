"""Tests for service layer functions."""

import pytest

from app.services.export_service import build_csv_response
from app.services.review_service import get_since, TYPE_LABELS, PERIOD_LABELS


class TestExportService:
    def test_build_csv_response(self):
        headers = ["英文", "中文"]
        rows = [["apple", "蘋果"], ["banana", "香蕉"]]
        response, csv_bytes = build_csv_response(headers, rows, "test.csv")

        content = csv_bytes.decode("utf-8-sig")
        assert '"英文"' in content
        assert '"apple"' in content
        assert '"香蕉"' in content

    def test_build_csv_with_title(self):
        headers = ["英文"]
        rows = [["hello"]]
        response, csv_bytes = build_csv_response(headers, rows, "test.csv", title_line="My Title")

        content = csv_bytes.decode("utf-8-sig")
        assert '"My Title"' in content

    def test_csv_escapes_quotes(self):
        headers = ["text"]
        rows = [['He said "hello"']]
        _, csv_bytes = build_csv_response(headers, rows, "test.csv")

        content = csv_bytes.decode("utf-8-sig")
        assert '""hello""' in content


class TestReviewService:
    def test_get_since_today(self):
        result = get_since("today")
        assert result is not None
        assert result.hour == 0 and result.minute == 0

    def test_get_since_all(self):
        assert get_since("all") is None

    def test_get_since_week(self):
        result = get_since("week")
        assert result is not None

    def test_labels_complete(self):
        assert "forget" in TYPE_LABELS
        assert "unsure" in TYPE_LABELS
        assert "remember" in TYPE_LABELS
        assert "today" in PERIOD_LABELS
        assert "all" in PERIOD_LABELS
