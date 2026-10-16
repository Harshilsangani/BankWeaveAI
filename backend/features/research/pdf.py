"""Paginated research document with vector charts, real tables and call receipts."""

import math
import re
from pathlib import Path

import fitz

INK = (0.10, 0.14, 0.21)
MUTED = (0.35, 0.40, 0.48)
BLUE = (0.10, 0.36, 0.77)
LINE = (0.85, 0.89, 0.94)
PALETTE = (
    BLUE,
    (0.04, 0.59, 0.52),
    (0.88, 0.56, 0.05),
    (0.51, 0.36, 0.76),
    (0.78, 0.29, 0.32),
    (0.31, 0.54, 0.72),
)


def short_paragraphs(text, target=75):
    """Add reading breaks at sentence boundaries without changing any words."""
    sentences = re.split(r"(?<=[.!?])\s+(?=[A-Z\d“\"(])", text.strip())
    groups = []
    current = []
    words = 0
    for sentence in sentences:
        length = len(sentence.split())
        if current and words + length > target:
            groups.append(" ".join(current))
            current = []
            words = 0
        current.append(sentence)
        words += length
    if current:
        groups.append(" ".join(current))
    return groups


def markdown_blocks(text):
    """Keep block structure instead of flattening Markdown into one paragraph."""
    lines = str(text).replace("\r\n", "\n").splitlines()
    pending = []
    listing = None

    def flush():
        nonlocal pending, listing
        if not pending:
            return []
        result = (
            [("list", listing, " ".join(pending))]
            if listing
            else [
                ("paragraph", "", part) for part in short_paragraphs(" ".join(pending))
            ]
        )
        pending = []
        listing = None
        return result

    for line in lines:
        stripped = line.strip()
        heading = re.match(r"^(#{1,6})\s+(.+?)\s*#*$", stripped)
        item = re.match(r"^([-*+•]|\d+[.)])\s+(.+)$", stripped)
        if not stripped:
            yield from flush()
        elif heading:
            yield from flush()
            yield ("heading", len(heading[1]), heading[2])
        elif item:
            yield from flush()
            listing = "•" if item[1] in ("-", "*", "+", "•") else item[1]
            pending = [item[2]]
        elif re.fullmatch(r"(?:-{3,}|\*{3,}|_{3,})", stripped):
            yield from flush()
        else:
            pending.append(stripped.removeprefix("> "))
    yield from flush()


class Document:
    def __init__(self, response):
        self.response = response
        self.doc = fitz.open()
        self.page = None
        self.y = 0
        self.outline = []
        self.contents_slots = []
        roots = [
            Path("/usr/share/fonts/truetype/dejavu"),
            Path.home()
            / ".local/share/bankweave/system-packages/usr/share/fonts/truetype/dejavu",
            Path("C:/Windows/Fonts"),
        ]
        self.regular = next(
            (
                p / name
                for p in roots
                for name in ("DejaVuSans.ttf", "arial.ttf")
                if (p / name).is_file()
            ),
            None,
        )
        self.bold = next(
            (
                p / name
                for p in roots
                for name in ("DejaVuSans-Bold.ttf", "arialbd.ttf")
                if (p / name).is_file()
            ),
            self.regular,
        )
        self.font = (
            fitz.Font(fontfile=str(self.regular)) if self.regular else fitz.Font("helv")
        )
        self.bold_font = (
            fitz.Font(fontfile=str(self.bold)) if self.bold else fitz.Font("hebo")
        )
        self.new_page()

    def new_page(self):
        self.page = self.doc.new_page(width=595, height=842)
        if self.regular:
            self.page.insert_font(fontname="regular", fontfile=str(self.regular))
            self.page.insert_font(fontname="bold", fontfile=str(self.bold))
        self.page.draw_rect(fitz.Rect(0, 0, 595, 6), fill=BLUE, color=None)
        self.put("BANKWEAVE AI  /  RESEARCH", 44, 26, 8, BLUE, True)
        self.page.draw_line(
            fitz.Point(44, 41), fitz.Point(551, 41), color=LINE, width=0.6
        )
        self.y = 57

    def put(self, text, x, y, size=10, color=INK, bold=False):
        value = str(text).replace("**", "").replace("`", "")
        if not self.regular:
            value = (
                value.replace("₹", "INR ")
                .replace("→", "to")
                .replace("·", " / ")
                .replace("—", "-")
                .replace("•", "-")
            )
        self.page.insert_text(
            fitz.Point(x, y),
            value,
            fontsize=size,
            color=color,
            fontname=("bold" if bold else "regular")
            if self.regular
            else ("hebo" if bold else "helv"),
        )

    def ensure(self, height):
        if self.y + height > 786:
            self.new_page()

    def wrap(self, text, width=507, size=10, bold=False):
        font = self.bold_font if bold else self.font
        lines = []
        line = ""
        for word in str(text).replace("**", "").replace("`", "").split():
            while font.text_length(word, fontsize=size) > width:
                n = 1
                while (
                    n < len(word)
                    and font.text_length(word[: n + 1], fontsize=size) <= width
                ):
                    n += 1
                if line:
                    lines.append(line)
                    line = ""
                lines.append(word[:n])
                word = word[n:]
            candidate = (line + " " + word).strip()
            if line and font.text_length(candidate, fontsize=size) > width:
                lines.append(line)
                line = word
            else:
                line = candidate
        if line:
            lines.append(line)
        return lines

    def paragraph(self, text, size=10, color=INK):
        blocks = list(markdown_blocks(text))
        for position, (kind, marker, body) in enumerate(blocks):
            if kind == "heading":
                if position + 1 < len(blocks) and blocks[position + 1][0] != "heading":
                    next_kind, _, next_body = blocks[position + 1]
                    following = (
                        len(
                            self.wrap(
                                next_body,
                                width=487 if next_kind == "list" else 507,
                                size=size,
                            )
                        )
                        * size
                        * 1.55
                        + 10
                    )
                    heading_size = 17 if marker <= 2 else 12
                    heading_height = (
                        len(self.wrap(body, size=heading_size, bold=True))
                        * heading_size
                        * 1.4
                        + 17
                    )
                    self.ensure(heading_height + min(following, 600))
                self.heading(body, 1 if marker <= 2 else 2)
                continue
            indent = 20 if kind == "list" else 0
            lines = self.wrap(body, width=507 - indent, size=size)
            if not lines:
                continue
            leading = size * 1.55
            height = len(lines) * leading + 10
            # Keep normal paragraphs together, and leave at least two lines on a page.
            self.ensure(min(height, leading * 3) if height > 650 else height)
            for index, line in enumerate(lines):
                self.ensure(leading)
                if marker and index == 0:
                    self.put(marker, 44, self.y + size, size, BLUE)
                self.put(line, 44 + indent, self.y + size, size, color)
                self.y += leading
            self.y += 10 if kind == "paragraph" else 7

    def heading(self, title, level=1, bookmark=True):
        size = 17 if level == 1 else 12
        lines = self.wrap(title, size=size, bold=True)
        self.ensure(len(lines) * size * 1.4 + 62)
        self.y += 9
        if bookmark:
            self.outline.append(
                (level, str(title).replace("**", ""), self.page.number, self.y)
            )
        for line in lines:
            self.put(line, 44, self.y + size, size, BLUE if level == 1 else INK, True)
            self.y += size * 1.4
        self.y += 8

    def reserve_contents(self, count):
        self.ensure(min(count * 18 + 65, 600))
        self.heading("In this report", 2, bookmark=False)
        for _ in range(count):
            if self.y + 18 > 786:
                self.new_page()
                self.heading("In this report — continued", 2, bookmark=False)
            self.contents_slots.append((self.page.number, self.y))
            self.y += 18
        self.y += 12

    def table(self, title, columns, rows):
        if not columns:
            return
        count = len(columns)
        widths = [507 / count] * count
        if count >= 4:
            widths = [76] + [(507 - 76) / (count - 1)] * (count - 1)

        def wrapped(values):
            return [
                self.wrap(
                    str(values[i]) if i < len(values) else "",
                    width=widths[i] - 12,
                    size=8.1,
                )
                for i in range(count)
            ]

        def height(lines):
            return max(25, 14 + max([len(value) for value in lines] or [1]) * 11)

        def draw_row(lines, header=False, index=0):
            row_height = height(lines)
            self.page.draw_rect(
                fitz.Rect(44, self.y, 551, self.y + row_height),
                color=LINE,
                fill=BLUE
                if header
                else ((0.96, 0.97, 0.99) if index % 2 == 0 else (1, 1, 1)),
                width=0.5,
            )
            x = 44
            for i, value in enumerate(lines):
                for j, line in enumerate(value):
                    self.put(
                        line,
                        x + 6,
                        self.y + 13 + j * 11,
                        8.1,
                        (1, 1, 1) if header else INK,
                        header,
                    )
                x += widths[i]
            self.y += row_height

        header = wrapped(columns)
        self.ensure(height(header) + 95)
        self.heading(title, 2)
        draw_row(header, True)

        def continued():
            self.new_page()
            self.heading(title + " — continued", 2, bookmark=False)
            draw_row(header, True)

        for index, row in enumerate(rows):
            lines = wrapped(row)
            if self.y + height(lines) > 786:
                continued()
            while any(lines):
                limit = int((786 - self.y - 14) // 11)
                if limit < 1:
                    continued()
                    continue
                chunk = [value[:limit] for value in lines]
                draw_row(chunk, index=index)
                lines = [value[limit:] for value in lines]
                if any(lines):
                    continued()
            if not any(wrapped(row)):
                draw_row([[] for _ in columns], index=index)
        self.y += 13

    def finish(self):
        # Fill the reserved contents after pagination; links and bookmarks use actual destinations.
        entries = [entry for entry in self.outline[1:] if entry[0] == 1]
        for (source, y), (_, title, target, top) in zip(self.contents_slots, entries):
            self.page = self.doc[source]
            label = self.wrap(title, width=465, size=8.5)[0]
            self.put(label, 44, y + 9, 8.5, INK)
            self.put(str(target + 1), 533, y + 9, 8.5, BLUE)
            self.page.draw_line(
                fitz.Point(44, y + 15), fitz.Point(551, y + 15), color=LINE, width=0.35
            )
            self.page.insert_link(
                {
                    "kind": fitz.LINK_GOTO,
                    "from": fitz.Rect(44, y - 2, 551, y + 16),
                    "page": target,
                    "to": fitz.Point(44, top),
                }
            )
        self.doc.set_toc(
            [[level, title, page + 1] for level, title, page, _ in self.outline]
        )
        total = len(self.doc)
        for index, page in enumerate(self.doc):
            self.page = page
            chapters = [
                entry for entry in self.outline if entry[0] == 1 and entry[2] <= index
            ]
            on_page = [entry for entry in chapters if entry[2] == index]
            if index and chapters:
                title = (on_page[0] if on_page else chapters[-1])[1]
                self.put(self.wrap(title, width=230, size=7.3)[0], 321, 26, 7.3, MUTED)
            page.draw_line(
                fitz.Point(44, 801), fitz.Point(551, 801), color=LINE, width=0.6
            )
            self.put(
                "SYNTHETIC HISTORICAL OBSERVATIONS  /  HUMAN REVIEW REQUIRED",
                44,
                818,
                7,
                MUTED,
            )
            self.put(f"{index + 1} / {total}", 515, 818, 8, MUTED)
        self.doc.set_metadata(
            dict(
                title="BankWeave research report",
                author="BankWeave AI",
                subject=self.response.get("question", ""),
                creator="BankWeave structured research export",
            )
        )
        self.doc.subset_fonts()
        data = self.doc.tobytes(garbage=4, deflate=True)
        self.doc.close()
        return data


def compact(value):
    magnitude = abs(value)
    for divisor, label in ((1e9, "bn"), (1e6, "m"), (1e3, "k")):
        if magnitude >= divisor:
            return f"{value / divisor:.1f}{label}"
    return f"{value:,.0f}"


def chart(pdf, block):
    points = block.get("points") or []
    if not points:
        return
    pdf.ensure(295)
    pdf.heading(block.get("title", "Research chart"), 2)
    pdf.paragraph(block.get("subtitle", ""), size=8, color=MUTED)
    top = pdf.y
    bottom = top + 170
    left = 94
    right = 530
    kind = block.get("kind", "area")
    values = [float(p["value"]) for p in points]
    low = min(0, min(values))
    high = max(0, max(values))
    if high == low:
        high = low + 1
    if kind == "donut" and low >= 0:
        cx, cy = 133, top + 80
        total = sum(values) or 1
        angle = -90
        for index, point in enumerate(points):
            sweep = 360 * point["value"] / total
            if sweep <= 0:
                continue
            shape = pdf.page.new_shape()
            start = fitz.Point(
                cx + 58 * math.cos(math.radians(angle)),
                cy + 58 * math.sin(math.radians(angle)),
            )
            shape.draw_sector(fitz.Point(cx, cy), start, sweep, fullSector=True)
            shape.finish(fill=PALETTE[index % 6], color=None, closePath=True)
            shape.commit()
            angle += sweep
        pdf.page.draw_circle(fitz.Point(cx, cy), 35, color=None, fill=(1, 1, 1))
        for index, point in enumerate(points[:8]):
            y = top + 14 + index * 19
            pdf.page.draw_rect(
                fitz.Rect(228, y - 7, 236, y + 1), color=None, fill=PALETTE[index % 6]
            )
            pdf.put(str(point["name"])[:35], 244, y + 1, 8)
            pdf.put(compact(point["value"]), 493, y + 1, 8)
    elif kind == "bar":
        band = 170 / max(len(points), 1)
        plot_left = 182
        zero = plot_left + (0 - low) / (high - low) * (right - plot_left)
        for index, point in enumerate(points):
            y = top + index * band
            end = plot_left + (point["value"] - low) / (high - low) * (
                right - plot_left
            )
            pdf.put(str(point["name"])[:25], 44, y + band * 0.55, 8)
            pdf.page.draw_rect(
                fitz.Rect(min(zero, end), y + 3, max(zero, end) + 0.2, y + band * 0.7),
                color=None,
                fill=PALETTE[index % 6],
            )
        pdf.page.draw_line(fitz.Point(zero, top), fitz.Point(zero, bottom), color=LINE)
    else:

        def y(value):
            return bottom - (value - low) / (high - low) * 157

        zero = y(0)
        for index in range(5):
            value = low + (high - low) * index / 4
            yy = y(value)
            pdf.page.draw_line(
                fitz.Point(left, yy), fitz.Point(right, yy), color=LINE, width=0.5
            )
            pdf.put(compact(value), 44, yy + 3, 8, MUTED)
        if kind == "column":
            band = (right - left) / len(points)
            for index, point in enumerate(points):
                x = left + index * band + band * 0.25
                yy = y(point["value"])
                pdf.page.draw_rect(
                    fitz.Rect(x, min(yy, zero), x + band * 0.5, max(yy, zero) + 0.2),
                    color=None,
                    fill=PALETTE[index % 6],
                )
                pdf.put(str(point["name"])[-7:], x - 5, bottom + 17, 7, MUTED)
        else:
            coords = [
                fitz.Point(
                    left + i * (right - left) / max(len(points) - 1, 1), y(p["value"])
                )
                for i, p in enumerate(points)
            ]
            shape = pdf.page.new_shape()
            shape.draw_polyline(
                [fitz.Point(left, zero), *coords, fitz.Point(right, zero)]
            )
            shape.finish(color=None, fill=BLUE, fill_opacity=0.12, closePath=True)
            shape.commit()
            if len(coords) > 1:
                pdf.page.draw_polyline(coords, color=BLUE, width=2)
            else:
                pdf.page.draw_circle(coords[0], 3, color=BLUE, fill=BLUE)
            for index, point in enumerate(points):
                if len(points) <= 8 or index in (0, len(points) - 1):
                    pdf.put(
                        str(point["name"])[-7:],
                        coords[index].x - 12,
                        bottom + 17,
                        7,
                        MUTED,
                    )
    pdf.y = bottom + 30
    pdf.table(
        "Chart values — " + block.get("title", ""),
        ["Period / category", "Calculated value"],
        [
            [
                p["name"],
                f"{p['value']:,.2f}"
                if isinstance(p["value"], float)
                else f"{p['value']:,}",
            ]
            for p in points
        ],
    )


def render(response):
    pdf = Document(response)
    analysis = response.get("analysis") or {}
    report = response.get("researchReport") or {}
    execution = analysis.get("researchExecution") or report.get("execution") or {}
    focus = report.get("focus", "research")
    titles = {
        "cashflow": "Transaction and Cashflow Research",
        "transactions": "Transaction Research",
        "loans": "Loan Portfolio Research",
        "fraud": "Fraud Pattern Research",
        "portfolio": "Banking Portfolio Research",
    }
    pdf.heading(titles.get(focus, "Research brief"))
    pdf.paragraph("Research brief / " + response.get("id", ""), 8, MUTED)
    pdf.paragraph(response.get("question", ""), 11)
    pdf.table(
        "Report scope",
        ["Dataset", "Reporting window", "Currency"],
        [
            [
                analysis.get("datasetName", ""),
                analysis.get("period", ""),
                analysis.get("currency", ""),
            ]
        ],
    )
    model = execution.get("model") or analysis.get("model")
    if execution:
        label = (
            "MODEL-WRITTEN RESEARCH"
            if execution.get("mode") == "model"
            else "VERIFIED DATA / LOCAL REPORT"
            if execution.get("mode") == "local"
            else "VERIFIED DATA / MODEL FALLBACK"
        )
        pdf.paragraph(
            label
            + f" · {model or 'Local deterministic provider'} · {execution.get('successfulModelCalls', 0)} successful model calls · {execution.get('durationMs', 0) / 1000:.1f}s",
            9,
            BLUE,
        )
        for warning in execution.get("warnings", []):
            pdf.paragraph(warning, 9, MUTED)
    elif model:
        pdf.paragraph(
            f"Configured provider: {model} via {analysis.get('provider', 'unknown')}. Legacy answer has no per-call timing/token receipts.",
            9,
            MUTED,
        )
    metrics = [b for b in response.get("blocks", []) if b.get("type") == "KPI"]
    cover_metrics = bool(len(metrics) == 1 and len(metrics[0].get("metrics", [])) <= 6)
    if cover_metrics:
        pdf.table(
            "Verified indicators",
            ["Indicator", "Calculated value", "Scope / interpretation"],
            [
                [
                    m.get("label", ""),
                    m.get("value", ""),
                    m.get("detail") or m.get("change", ""),
                ]
                for m in metrics[0].get("metrics", [])
            ],
        )
    # One slot per main chapter; nested headings remain available in PDF bookmarks.
    chapters = 1 + sum(
        1
        for b in response.get("blocks", [])
        if b.get("type") == "TEXT" and report
        for k, l, t in markdown_blocks(b.get("text", ""))
        if k == "heading" and l <= 2 and t != "Executive summary"
    )
    chapters += int(
        any(
            b.get("type") == "CHART" and b.get("points")
            for b in response.get("blocks", [])
        )
    )
    chapters += int(
        any(
            b.get("type") == "TABLE" and b.get("data", {}).get("columns")
            for b in response.get("blocks", [])
        )
    )
    chapters += (
        sum(b.get("type") == "EVIDENCE" for b in response.get("blocks", []))
        + int(bool(execution))
        + 1
    )
    pdf.reserve_contents(chapters)
    pdf.new_page()
    pdf.heading("Executive summary")
    summary = report.get("executiveSummary")
    if not summary:
        summary = "\n\n".join(
            b.get("text", "")
            for b in response.get("blocks", [])
            if b.get("type") == "TEXT"
        )
    pdf.paragraph(summary)
    if report.get("objectives"):
        pdf.heading("Research objectives", 2)
        for objective in report["objectives"]:
            pdf.paragraph("• " + objective, 9)
    charts_started = False
    tables_started = False
    for block in response.get("blocks") or []:
        kind = block.get("type")
        if kind == "TEXT":
            text = block.get("text", "")
            if report and (
                text.startswith("Research scope:")
                or text.startswith("## Executive summary")
            ):
                continue
            if not report:
                continue
            pdf.paragraph(text)
        elif kind == "KPI" and not cover_metrics:
            pdf.table(
                "Verified indicators",
                ["Indicator", "Calculated value", "Scope / interpretation"],
                [
                    [
                        m.get("label", ""),
                        m.get("value", ""),
                        m.get("detail") or m.get("change", ""),
                    ]
                    for m in block.get("metrics", [])
                ],
            )
        elif kind == "CHART":
            if not charts_started and block.get("points"):
                pdf.new_page()
                pdf.heading("Charts and verified values")
                charts_started = True
            chart(pdf, block)
        elif kind == "TABLE":
            if not tables_started and block.get("data", {}).get("columns"):
                pdf.heading("Detailed data tables")
                tables_started = True
            pdf.table(
                block.get("title", "Breakdown"),
                block.get("data", {}).get("columns", []),
                block.get("data", {}).get("rows", []),
            )
        elif kind == "INSIGHT":
            pdf.heading(block.get("title", "Research note"), 2)
            pdf.paragraph(block.get("text", ""))
        elif kind == "EVIDENCE":
            pdf.heading("Source evidence and methodology")
            for item in block.get("evidence", []):
                pdf.heading(item.get("title", "Source"), 2)
                pdf.paragraph(
                    item.get("source", "") + " / " + item.get("id", ""), 8, MUTED
                )
                pdf.paragraph(item.get("detail", ""), 9)
                for record in item.get("records", []):
                    if record:
                        pdf.paragraph("• " + record, 9)
    if execution:
        pdf.new_page()
        pdf.heading("Agent and tool execution receipts")
        pdf.paragraph(
            "This appendix records actual external call outcomes and allowlisted database tools. Timings reflect completed work; no delay is added to simulate research.",
            9,
        )
        pdf.table(
            "Model calls",
            ["Agent", "Outcome", "Time (s)", "Tokens"],
            [
                [
                    c["agent"],
                    c["status"],
                    f"{c.get('durationMs', 0) / 1000:.2f}",
                    str(c.get("totalTokens", 0)),
                ]
                for c in execution.get("calls", [])
            ],
        )
        if not execution.get("calls"):
            pdf.paragraph(
                "No external model call receipt was captured. This report uses locally assembled verified data.",
                9,
                MUTED,
            )
        pdf.table(
            "Database tools",
            ["Tool", "Outcome", "Rows", "Time (ms)"],
            [
                [t["tool"], t["status"], str(t["rowCount"]), str(t["durationMs"])]
                for t in execution.get("tools", [])
            ],
        )
        pdf.paragraph(
            "Transmitted fields: " + ", ".join(analysis.get("outboundFields", [])),
            8,
            MUTED,
        )
    pdf.heading("Source version and limitations")
    pdf.paragraph(
        "Source version: " + analysis.get("datasetVersion", "Unknown"), 8, MUTED
    )
    for limitation in analysis.get("limitations", []):
        pdf.paragraph("• " + limitation, 9)
    return pdf.finish()
