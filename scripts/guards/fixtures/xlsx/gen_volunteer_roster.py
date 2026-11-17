"""Builds hlya-volunteer-roster.xlsx (S4, 2026-11-16): a synthetic workbook for the fictional rehearsal
nonprofit — never a client document — that exercises every S4 rule at once:
  Volunteers  name, email, date of birth (date-formatted serial), SSN, an oddly named contact column
              ("Contacto", phone numbers), plus kept columns (Volunteer ID, Age, Program, hours, a formula, a date-formatted Joined)
  Totals      a formula with a cached value, and a formula with NO cached value
  Lookups     a HIDDEN sheet
    python3 -I gen_volunteer_roster.py <out.xlsx>
"""
import sys, zipfile
from xml.sax.saxutils import escape

NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"

def col(i):
    s = ""
    i += 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s

def cell(r, c, v):
    ref = f"{col(c)}{r}"
    if isinstance(v, dict):                      # {"f": formula, "v": cached or None, "s": style}
        cached = "" if v.get("v") is None else f"<v>{v['v']}</v>"
        style = f' s="{v["s"]}"' if "s" in v else ""
        return f'<c r="{ref}"{style}><f>{escape(v["f"])}</f>{cached}</c>'
    if isinstance(v, tuple):                     # (serial, "date") — a date-formatted number
        return f'<c r="{ref}" s="1"><v>{v[0]}</v></c>'
    if isinstance(v, (int, float)):
        return f'<c r="{ref}"><v>{v}</v></c>'
    return f'<c r="{ref}" t="inlineStr"><is><t>{escape(str(v))}</t></is></c>'

def sheet(rows):
    body = "".join(f'<row r="{r}">' + "".join(cell(r, c, v) for c, v in enumerate(row) if v is not None) + "</row>"
                   for r, row in enumerate(rows, 1))
    return f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet {NS}><sheetData>{body}</sheetData></worksheet>'

VOLUNTEERS = [
    ["Volunteer ID", "Volunteer name", "Email", "Date of birth", "SSN", "Contacto", "Age", "Program", "Hours FY25", "Hours FY26", "Total hours", "Joined"],
    ["V-101", "Marisol Quintero-Vega", "mq.volunteer@example.org", (31120, "date"), "123-45-6789", "(555) 201-3344", 41, "Mentor Match", 64, 72, {"f": "I2+J2", "v": 136}, (45200, "date")],
    ["V-102", "Dashiell Okonkwo-Reyes", "dashiell.or@example.net", (35420, "date"), "234-56-7890", "+1 555 202 4455", 29, "Crisis Respite Beds", 40, 55, {"f": "I3+J3", "v": 95}, (45351, "date")],
    ["V-103", "Ingrid Paloma Sørensen", "ingrid.ps@example.com", (28650, "date"), "345-67-8901", "555.203.5566", 48, "Teen Drop-in Center", 120, 98, {"f": "I4+J4", "v": 218}, (44927, "date")],
    ["V-104", "Teodoro Nakamura-Blythe", "teo.nb@example.org", (37800, "date"), "456-78-9012", "(555) 204-6677", 23, "Mentor Match", 18, 30, {"f": "I5+J5", "v": 48}, (45566, "date")],
]
TOTALS = [
    ["Measure", "Value"],
    ["All volunteer hours FY26", {"f": "SUM(Volunteers!J2:J5)", "v": 255}],
    ["Hours per volunteer FY26", {"f": "B2/4"}],                      # NO cached value
]
LOOKUPS = [["Program code", "Program"], ["MM", "Mentor Match"], ["CRB", "Crisis Respite Beds"], ["TDC", "Teen Drop-in Center"]]

def main(out):
    sheets = [("Volunteers", VOLUNTEERS, None), ("Totals", TOTALS, None), ("Lookups", LOOKUPS, "hidden")]
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        ct = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
              '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>',
              '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
              '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>']
        ct += [f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' for i in range(1, len(sheets) + 1)]
        z.writestr("[Content_Types].xml", "".join(ct) + "</Types>")
        z.writestr("_rels/.rels", f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="{REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        sh = "".join(f'<sheet name="{n}" sheetId="{i}"' + (f' state="{st}"' if st else "") + f' r:id="rId{i}"/>' for i, (n, _, st) in enumerate(sheets, 1))
        z.writestr("xl/workbook.xml", f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook {NS}><sheets>{sh}</sheets></workbook>')
        rels = "".join(f'<Relationship Id="rId{i}" Type="{REL}/worksheet" Target="worksheets/sheet{i}.xml"/>' for i in range(1, len(sheets) + 1))
        rels += f'<Relationship Id="rId{len(sheets) + 1}" Type="{REL}/styles" Target="styles.xml"/>'
        z.writestr("xl/_rels/workbook.xml.rels", f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{rels}</Relationships>')
        z.writestr("xl/styles.xml", f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet {NS}><fonts count="1"><font/></fonts><fills count="1"><fill/></fills><borders count="1"><border/></borders>'
                   '<cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/></cellXfs></styleSheet>')
        for i, (_, rows, _) in enumerate(sheets, 1):
            z.writestr(f"xl/worksheets/sheet{i}.xml", sheet(rows))

if __name__ == "__main__":
    main(sys.argv[1])
