"""Acceptance for readable exports with complete source content and real navigation."""

import struct
import unittest
from unittest.mock import patch

import fitz

from backend.features.research.pdf import Document, render


def text(pdf):
    return " ".join(" ".join(page.get_text().split()) for page in pdf)


def report(
    blocks, summary="Review the recorded observations before reaching a conclusion."
):
    return dict(
        id="MSG-layout-test",
        question="Review the selected historical records.",
        researchReport=dict(focus="transactions", executiveSummary=summary),
        blocks=blocks,
        analysis=dict(
            datasetName="Test source",
            period="2026-07 to 2026-09",
            currency="INR",
            datasetVersion="VERSION-KEPT",
            limitations=["LIMITATION-KEPT"],
        ),
    )


class ResearchPdfLayoutTests(unittest.TestCase):
    def test_shared_font_glyphs_do_not_turn_ascii_into_nbsp_or_soft_hyphen(self):
        document = Document({})
        font = document.font
        raw = bytearray(font.buffer)
        if raw[:4] != b"\x00\x01\x00\x00":
            document.doc.close()
            self.skipTest("A TrueType system font is needed for the alias-font probe")
        # Reproduce Arial-like aliases in a disposable font buffer, without
        # requiring Windows or changing any installed font files.
        mapping = {p: font.has_glyph(p) for p in font.valid_codepoints()}
        mapping[0xA0] = mapping[0x20]
        mapping[0xAD] = mapping[0x2D]
        groups = b"".join(
            struct.pack(">III", codepoint, codepoint, glyph)
            for codepoint, glyph in sorted(mapping.items())
        )
        subtable = struct.pack(">HHIII", 12, 0, 16 + len(groups), 0, len(mapping)) + groups
        cmap = struct.pack(">HHHHI", 0, 1, 3, 10, 12) + subtable
        raw.extend(b"\0" * (-len(raw) % 4))
        offset = len(raw)
        raw.extend(cmap)
        for index in range(struct.unpack_from(">H", raw, 4)[0]):
            entry = 12 + 16 * index
            if raw[entry : entry + 4] == b"cmap":
                struct.pack_into(">II", raw, entry + 8, offset, len(cmap))
                break
        document.font = fitz.Font(fontbuffer=bytes(raw))
        value = "ASCII spaces - HYPHEN-MARKER"
        document.put(value, 44, 100)
        self.assertIn("ASCII\u00a0spaces\u00a0\u00ad", document.page.get_text())
        with fitz.open(stream=document.finish(), filetype="pdf") as pdf:
            self.assertIn(value, pdf[0].get_text())

    def test_unicode_round_trip_with_system_fonts_and_missing_glyph_fallback(self):
        value = "ASCII spaces - HYPHEN-MARKER / INR ₹1,234.56 → •"
        for system_fonts in (True, False):
            with self.subTest(system_fonts=system_fonts):
                if system_fonts:
                    document = Document({})
                else:
                    with patch(
                        "backend.features.research.pdf.Path.is_file", return_value=False
                    ):
                        document = Document({})
                document.put(value, 44, 100)
                document.put(value, 44, 130, bold=True)
                with fitz.open(stream=document.finish(), filetype="pdf") as pdf:
                    output = "\n".join(page.get_text() for page in pdf)
                self.assertEqual(output.count(value), 2)
                for unexpected in ("\u00a0", "\u00ad", "\ufffd", "\x00"):
                    self.assertNotIn(unexpected, output)

    def test_dense_saved_prose_gets_reading_breaks_without_losing_words_or_figures(
        self,
    ):
        prose = " ".join(
            f"Observation {i} retains the source amount INR 1,234.56 and the full context of its recorded comparison."
            for i in range(20)
        )
        with fitz.open(stream=render(report([], prose)), filetype="pdf") as pdf:
            self.assertIn(prose, text(pdf))
            page = next(page for page in pdf if "Observation 0" in page.get_text())
            baselines = [
                span["origin"][1]
                for block in page.get_text("dict")["blocks"]
                if "lines" in block
                for line in block["lines"]
                for span in line["spans"]
                if span["size"] == 10
            ]
            self.assertGreaterEqual(
                sum(b - a > 22 for a, b in zip(baselines, baselines[1:])), 3
            )

    def test_markdown_subheadings_and_wrapped_lists_have_distinct_hanging_indents(self):
        bullet = (
            "Check the original source reference and preserve its recorded values. " * 9
            + "BULLET-END"
        )
        blocks = [
            dict(
                type="TEXT",
                text="## Evidence review\n\n### Source checks\n\n- "
                + bullet
                + "\n\n1. Record the value INR -1,275,147,304.78.\n2. Keep the final evidence marker LIST-END.\n\nConclude after checking the source.",
            )
        ]
        with fitz.open(stream=render(report(blocks)), filetype="pdf") as pdf:
            output = text(pdf)
            for value in (
                "Source checks",
                "BULLET-END",
                "INR -1,275,147,304.78",
                "LIST-END",
            ):
                self.assertIn(value, output)
            self.assertNotIn("###", output)
            page = next(page for page in pdf if "BULLET-END" in page.get_text())
            spans = [
                s
                for b in page.get_text("dict")["blocks"]
                if "lines" in b
                for line in b["lines"]
                for s in line["spans"]
            ]
            self.assertTrue(
                any(s["text"] == "•" and s["origin"][0] == 44 for s in spans)
            )
            self.assertTrue(
                any("BULLET-END" in s["text"] and s["origin"][0] == 64 for s in spans)
            )
            self.assertTrue(
                any(s["text"] == "Source checks" and s["flags"] & 16 for s in spans)
            )

    def test_contents_links_and_bookmarks_point_to_the_real_section_pages(self):
        blocks = [
            dict(type="TEXT", text="## Findings\n\nThe recorded source is retained."),
            dict(
                type="CHART",
                title="Recorded trend",
                kind="area",
                points=[dict(name="Jul", value=4), dict(name="Aug", value=-2)],
            ),
            dict(
                type="TABLE",
                title="Full source rows",
                data=dict(
                    columns=["Reference"], rows=[[f"RECORD-{i}"] for i in range(80)]
                ),
            ),
        ]
        with fitz.open(stream=render(report(blocks)), filetype="pdf") as pdf:
            toc = pdf.get_toc()
            links = [link for page in pdf for link in page.get_links()]
            chapters = [item for item in toc[1:] if item[0] == 1]
            self.assertEqual(len(links), len(chapters))
            self.assertIn("In this report", pdf[0].get_text())
            for (_, title, page_number), link in zip(chapters, links):
                self.assertEqual(link["page"], page_number - 1)
                self.assertIn(title, pdf[page_number - 1].get_text())
            for expected in ("RECORD-79", "VERSION-KEPT", "LIMITATION-KEPT"):
                self.assertIn(expected, text(pdf))

    def test_a_long_table_cell_continues_with_headers_and_stays_above_the_footer(self):
        cell = "Complete source details are retained for review. " * 250 + "CELL-END"
        blocks = [
            dict(
                type="TABLE",
                title="Source detail",
                data=dict(columns=["Evidence", "Value"], rows=[[cell, "INR 1,234.56"]]),
            )
        ]
        with fitz.open(stream=render(report(blocks)), filetype="pdf") as pdf:
            output = text(pdf)
            self.assertIn("CELL-END", output)
            self.assertIn("INR 1,234.56", output)
            cell_text = " ".join(
                span["text"]
                for page in pdf
                if "Source detail" in page.get_text()
                for block in page.get_text("dict")["blocks"]
                for line in block.get("lines", [])
                for span in line["spans"]
                if abs(span["size"] - 8.1) < 0.01
                and not span["flags"] & 16
                and span["origin"][0] == 50
            )
            self.assertEqual(" ".join(cell.split()), " ".join(cell_text.split()))
            continued = [p for p in pdf if "Source detail — continued" in p.get_text()]
            self.assertGreater(len(continued), 1)
            for page in continued:
                self.assertIn("Evidence", page.get_text())
            for page in pdf:
                for block in page.get_text("dict")["blocks"]:
                    for line in block.get("lines", []):
                        for span in line["spans"]:
                            if abs(span["size"] - 8.1) < 0.01:
                                self.assertLessEqual(span["bbox"][3], 790)

    def test_heading_keeps_following_text_on_the_same_page(self):
        blocks = [
            dict(
                type="TEXT",
                text="## Detailed findings\n\n"
                + ("Review the supplied observations before making a decision. " * 65)
                + "\n\n### Next check\n\nFOLLOWING-TEXT-KEPT",
            )
        ]
        with fitz.open(stream=render(report(blocks)), filetype="pdf") as pdf:
            page = next(p for p in pdf if "Next check" in p.get_text())
            self.assertIn("FOLLOWING-TEXT-KEPT", page.get_text())
