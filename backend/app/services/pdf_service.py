"""Unified PDF generation service.

Provides a base PDF builder with CJK + IPA font support,
and specific builders for word tables, articles, and review exports.
"""

import io
import os
import re
from urllib.parse import quote

from fastapi.responses import StreamingResponse
from fpdf import FPDF


FONT_CJK = "/app/fonts/NotoSansTC-Regular.otf"
FONT_LATIN = "/app/fonts/NotoSans-Regular.ttf"


def _get_font_name() -> str:
    return "NotoSans" if os.path.exists(FONT_CJK) else "Helvetica"


def _create_pdf(orientation: str = "P") -> FPDF:
    """Create a PDF with CJK + IPA font support. Falls back to Helvetica if fonts missing."""
    pdf = FPDF(orientation=orientation, unit="mm", format="A4")
    if os.path.exists(FONT_CJK):
        pdf.add_font("NotoSans", "", FONT_CJK, uni=True)
        if os.path.exists(FONT_LATIN):
            pdf.add_font("NotoSansLatin", "", FONT_LATIN, uni=True)
            pdf.set_fallback_fonts(["NotoSansLatin"])
    pdf.set_auto_page_break(auto=True, margin=15)
    return pdf


def _streaming_response(pdf: FPDF, filename: str) -> tuple[StreamingResponse, bytes]:
    """Return a StreamingResponse and the raw PDF bytes."""
    pdf_bytes = pdf.output()
    encoded = quote(filename)
    response = StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"},
    )
    return response, pdf_bytes


# --- Shared Table Renderer ---

def _render_table(
    pdf: FPDF,
    headers: list[str],
    col_keys: list[str],
    rows: list[dict],
) -> None:
    """Render a table with dynamic column widths, proper wrapping, and alignment.

    Used by both word group PDF and review export PDF for consistent formatting.
    """
    page_width = 210 - 20
    pdf.set_font(_get_font_name(), size=9)
    line_h = 5
    pad = 1
    min_col_w = 18

    # Dynamic column widths based on content
    max_widths: list[float] = []
    for i, col in enumerate(col_keys):
        header_w = pdf.get_string_width(headers[i]) + 4
        data_max = 0
        for r in rows:
            val = str(r.get(col, "") or "")
            w = pdf.get_string_width(val) + 4
            data_max = max(data_max, w)
        max_w = min(max(header_w, data_max), page_width * 0.4)
        max_widths.append(max(max_w, min_col_w))

    total = sum(max_widths)
    if total > page_width:
        scale = page_width / total
        col_widths = [w * scale for w in max_widths]
    else:
        extra = page_width - total
        col_widths = [w + extra * (w / total) for w in max_widths]

    # Header row
    pdf.set_fill_color(24, 144, 255)
    pdf.set_text_color(255, 255, 255)
    for i, h in enumerate(headers):
        pdf.cell(col_widths[i], line_h * 1.4, h, border=1, fill=True, align="C")
    pdf.ln()

    # Data rows
    pdf.set_text_color(0, 0, 0)
    for row_idx, r in enumerate(rows):
        if row_idx % 2 == 1:
            pdf.set_fill_color(245, 245, 245)
        else:
            pdf.set_fill_color(255, 255, 255)

        vals = [str(r.get(col, "") or "") for col in col_keys]

        # Calculate row height
        max_h = line_h
        for i, v in enumerate(vals):
            inner_w = max(col_widths[i] - 2 * pad, 5)
            result = pdf.multi_cell(inner_w, line_h, v, dry_run=True, output="HEIGHT")
            max_h = max(max_h, result)
        row_h = max_h

        x0, y0 = pdf.get_x(), pdf.get_y()
        if y0 + row_h > pdf.h - 15:
            pdf.add_page()
            x0, y0 = pdf.get_x(), pdf.get_y()

        # Background fills
        for i in range(len(vals)):
            cx = x0 + sum(col_widths[:i])
            pdf.rect(cx, y0, col_widths[i], row_h, style="DF")

        # Text (clipped within cell)
        for i, v in enumerate(vals):
            cx = x0 + sum(col_widths[:i])
            inner_w = max(col_widths[i] - 2 * pad, 5)
            with pdf.local_context():
                pdf.set_xy(cx + pad, y0)
                with pdf.rect_clip(cx, y0, col_widths[i], row_h):
                    pdf.multi_cell(inner_w, line_h, v, border=0, align="L")

        # Borders
        for i in range(len(vals)):
            cx = x0 + sum(col_widths[:i])
            pdf.rect(cx, y0, col_widths[i], row_h)

        pdf.set_xy(x0, y0 + row_h)


# --- Word Group Table PDF ---

def build_word_group_pdf(title: str, saved_date: str, words: list[dict]) -> tuple[StreamingResponse, bytes, str]:
    """Build a PDF table for a word group."""
    pdf = _create_pdf()
    pdf.add_page()

    pdf.set_font(_get_font_name(), size=16)
    pdf.cell(0, 10, f"{title} ({saved_date})", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    headers = ["日文", "中文", "讀音", "記憶法", "例句"]
    col_keys = ["term", "definition", "reading", "mnemonic", "example_sentence"]
    _render_table(pdf, headers, col_keys, words)

    filename = f"{title}_{saved_date}.pdf"
    response, pdf_bytes = _streaming_response(pdf, filename)
    return response, pdf_bytes, filename


# --- Article PDF ---

def build_article_pdf(
    title: str,
    sentences: list[dict],
    used_words: list[str] | None = None,
) -> tuple[StreamingResponse, bytes, str]:
    """Build a PDF for an article/dialogue with optional keyword highlighting."""
    from datetime import datetime

    pdf = _create_pdf()
    pdf.add_page()

    today_str = datetime.now().strftime("%Y-%m-%d")
    pdf.set_font(_get_font_name(), size=16)
    pdf.cell(0, 10, f"{today_str} {title}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    # Keyword highlighting pattern
    kw_pattern = None
    if used_words:
        kw_pattern = re.compile(
            '(' + '|'.join(re.escape(w) for w in sorted(used_words, key=len, reverse=True)) + ')',
        )

    def write_highlighted(text: str):
        pdf.set_font(_get_font_name(), size=11)
        if not kw_pattern:
            pdf.write(7, text)
            return
        parts = kw_pattern.split(text)
        for part in parts:
            if kw_pattern.match(part):
                pdf.set_text_color(24, 144, 255)
                pdf.write(7, part)
                pdf.set_text_color(0, 0, 0)
            else:
                pdf.write(7, part)

    pdf.set_font(_get_font_name(), size=11)
    for s in sentences:
        speaker = s.get("speaker")
        text = s.get("text", "")
        chinese = s.get("definition")

        if speaker:
            pdf.set_text_color(100, 100, 100)
            pdf.set_font(_get_font_name(), size=11)
            pdf.write(7, f"{speaker}: ")
            pdf.set_text_color(0, 0, 0)
        write_highlighted(text)
        pdf.ln()

        if chinese:
            pdf.set_x(pdf.l_margin)
            pdf.set_text_color(100, 100, 100)
            pdf.set_font(_get_font_name(), size=10)
            pdf.multi_cell(0, 6, chinese)
            pdf.set_text_color(0, 0, 0)
        pdf.ln(2)

    filename = f"{today_str}_{title}.pdf"
    response, pdf_bytes = _streaming_response(pdf, filename)
    return response, pdf_bytes, filename


# --- Review Export PDF ---

def build_review_export_pdf(
    title: str,
    field_list: list[str],
    field_labels: dict[str, str],
    rows: list[dict],
    filename: str,
) -> tuple[StreamingResponse, bytes]:
    """Build a PDF table for review export with dynamic column widths."""
    pdf = _create_pdf()
    pdf.add_page()

    pdf.set_font(_get_font_name(), size=14)
    pdf.cell(0, 10, title, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    headers = [field_labels.get(f, f) for f in field_list] + ["次數"]
    col_keys = field_list + ["count"]
    _render_table(pdf, headers, col_keys, rows)

    response, pdf_bytes = _streaming_response(pdf, filename)
    return response, pdf_bytes
