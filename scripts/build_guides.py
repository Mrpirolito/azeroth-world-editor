"""Build the AWE guide .docx files from the small markup files in scripts/guides-src/.

Usage: python scripts/build_guides.py            (builds everything listed in JOBS)
Needs python-docx. Uses docs/guias/04-Crear-items-AWE.docx as the style template
(Title, Heading 1-3, List Paragraph + bullet/decimal numbering, blue table headers).

Markup: "# " H1, "## " H2, "- " bullet, "1. " numbered list (a new run restarts at 1),
"| a | b |" table (first row = header), ``` fenced code, "TITLE: x" title, plain line = paragraph.
Inline: **bold**, `code`.
"""
import copy
import re
import sys
from pathlib import Path

import docx
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(__file__).resolve().parent / "guides-src"
DOCS = ROOT / "docs"
TEMPLATE = DOCS / "guias" / "04-Crear-items-AWE.docx"
BULLET_NUM = 2  # numId of the bullet list in the template

JOBS = [
    ("g15_es.md", "guias/15-Monturas-mascotas-y-NPCs-con-modelo-propio-AWE.docx"),
    ("g15_en.md", "guides-en/15-Mounts-pets-and-NPCs-custom-models-AWE.docx"),
    ("g14_es.md", "guias/14-World-bosses-AWE.docx"),
    ("g14_en.md", "guides-en/14-World-bosses-AWE.docx"),
]

INLINE = re.compile(r"(\*\*.+?\*\*|`.+?`)")


def mono(run, size):
    run.font.name = "Consolas"
    run.font.size = Pt(size)
    fonts = run._r.get_or_add_rPr().find(qn("w:rFonts"))
    for a in ("w:ascii", "w:cs", "w:eastAsia", "w:hAnsi"):
        fonts.set(qn(a), "Consolas")


def styled(doc, text, style_id):
    par = doc.add_paragraph(text)
    ppr = par._p.get_or_add_pPr()
    ps = OxmlElement("w:pStyle")
    ps.set(qn("w:val"), style_id)
    ppr.insert(0, ps)
    return par


def add_runs(par, text):
    for part in INLINE.split(text):
        if not part:
            continue
        if part.startswith("**"):
            par.add_run(part[2:-2]).bold = True
        elif part.startswith("`"):
            mono(par.add_run(part[1:-1]), 10)
        else:
            par.add_run(part)


def set_num(par, num_id):
    ppr = par._p.get_or_add_pPr()
    num = OxmlElement("w:numPr")
    il = OxmlElement("w:ilvl")
    il.set(qn("w:val"), "0")
    ni = OxmlElement("w:numId")
    ni.set(qn("w:val"), str(num_id))
    num.append(il)
    num.append(ni)
    ppr.append(num)
    sp = OxmlElement("w:spacing")
    sp.set(qn("w:after"), "60")
    ppr.append(sp)


def new_decimal_list(doc):
    """Append a w:num pointing at the decimal abstractNum (id 3) so numbering restarts at 1."""
    numbering = doc.part.numbering_part.element
    ids = [int(n.get(qn("w:numId"))) for n in numbering.findall(qn("w:num"))]
    nid = max(ids) + 1
    num = OxmlElement("w:num")
    num.set(qn("w:numId"), str(nid))
    ab = OxmlElement("w:abstractNumId")
    ab.set(qn("w:val"), "3")
    num.append(ab)
    ov = OxmlElement("w:lvlOverride")
    ov.set(qn("w:ilvl"), "0")
    so = OxmlElement("w:startOverride")
    so.set(qn("w:val"), "1")
    ov.append(so)
    num.append(ov)
    numbering.append(num)
    return nid


def add_table(doc, rows):
    ncol = len(rows[0])
    tbl = doc.add_table(rows=len(rows), cols=ncol)
    borders = OxmlElement("w:tblBorders")
    for side in ("top", "left", "bottom", "right", "insideH", "insideV"):
        b = OxmlElement(f"w:{side}")
        b.set(qn("w:val"), "single")
        b.set(qn("w:sz"), "4")
        b.set(qn("w:color"), "auto")
        borders.append(b)
    tbl._tbl.tblPr.append(borders)
    for ri, row in enumerate(rows):
        for ci in range(ncol):
            text = row[ci] if ci < len(row) else ""
            cell = tbl.cell(ri, ci)
            tcpr = cell._tc.get_or_add_tcPr()
            w = tcpr.find(qn("w:tcW"))
            if w is None:
                w = OxmlElement("w:tcW")
                tcpr.append(w)
            w.set(qn("w:type"), "dxa")
            w.set(qn("w:w"), str(9026 // ncol))
            par = cell.paragraphs[0]
            if ri == 0:
                shd = OxmlElement("w:shd")
                shd.set(qn("w:val"), "clear")
                shd.set(qn("w:fill"), "3B6EA8")
                tcpr.append(shd)
                r = par.add_run(text)
                r.bold = True
                r.font.color.rgb = docx.shared.RGBColor(255, 255, 255)
            else:
                add_runs(par, text)
    tbl.rows[0]._tr.get_or_add_trPr().append(OxmlElement("w:tblHeader"))


def build(src: Path, out: Path):
    doc = docx.Document(str(TEMPLATE))
    body = doc.element.body
    for el in list(body):
        if el.tag != qn("w:sectPr"):
            body.remove(el)
    lines = src.read_text(encoding="utf-8").splitlines()
    i = 0
    num_id = None
    prev = None
    while i < len(lines):
        ln = lines[i]
        kind = None
        if ln.startswith("```"):
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                p = doc.add_paragraph()
                mono(p.add_run(lines[i]), 9)
                p.paragraph_format.space_after = Pt(0)
                i += 1
            i += 1
            doc.add_paragraph()
            prev = "code"
            continue
        if ln.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            add_table(doc, rows)
            doc.add_paragraph()
            prev = "table"
            continue
        if ln.startswith("TITLE:"):
            styled(doc, ln[6:].strip(), "Title")
        elif ln.startswith("# "):
            styled(doc, ln[2:], "Heading1")
        elif ln.startswith("## "):
            styled(doc, ln[3:], "Heading2")
        elif ln.startswith("- "):
            p = styled(doc, "", "ListParagraph")
            add_runs(p, ln[2:])
            set_num(p, BULLET_NUM)
            kind = "bullet"
        elif re.match(r"\d+\. ", ln):
            if prev != "num":
                num_id = new_decimal_list(doc)
            p = styled(doc, "", "ListParagraph")
            add_runs(p, re.sub(r"^\d+\. ", "", ln))
            set_num(p, num_id)
            kind = "num"
        elif ln.strip():
            p = doc.add_paragraph()
            add_runs(p, ln)
            p.paragraph_format.space_after = Pt(5)
        prev = kind
        i += 1
    out.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(out))
    print("wrote", out)


def patch_guide01():
    """Add one paragraph about the CoA content hub to guide 01 (ES + EN), idempotent."""
    jobs = [
        ("guias/01-Primeros-pasos-AWE.docx", "En Conquest of Azeroth hay además",
         "Conquest of Azeroth tiene además un centro propio, **CoA content**, en la barra superior: reúne los "
         "asistentes para crear contenido del servidor, como el **Model wizard** (monturas, mascotas y NPCs con "
         "modelo propio, guía 15) y los world bosses (guía 14)."),
        ("guides-en/01-Getting-started-AWE.docx", "Conquest of Azeroth also has a sync",
         "Conquest of Azeroth also has its own hub, **CoA content**, in the top bar: it gathers the wizards for "
         "creating server content, such as the **Model wizard** (mounts, pets and NPCs with a custom model, "
         "guide 15) and world bosses (guide 14)."),
    ]
    for rel, start, text in jobs:
        path = DOCS / rel
        d = docx.Document(str(path))
        if any("CoA content" in p.text for p in d.paragraphs):
            print("already patched", rel)
            continue
        target = next((p for p in d.paragraphs if p.text.startswith(start)), None)
        if target is None:
            print("anchor not found in", rel)
            continue
        new = copy.deepcopy(target._p)
        target._p.addnext(new)
        par = docx.text.paragraph.Paragraph(new, target._parent)
        for r in list(par.runs):
            r._r.getparent().remove(r._r)
        add_runs(par, text)
        d.save(str(path))
        print("patched", rel)


if __name__ == "__main__":
    for s, o in JOBS:
        if (SRC / s).exists():
            build(SRC / s, DOCS / o)
    if "--no-01" not in sys.argv:
        patch_guide01()
