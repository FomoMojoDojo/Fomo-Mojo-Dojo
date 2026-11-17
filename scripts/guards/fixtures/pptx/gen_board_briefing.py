"""Builds hlya-board-briefing.pptx (S6, 2026-11-16): a synthetic four-slide board briefing for the
fictional rehearsal nonprofit — never a client document. Slide 3 is HIDDEN (show="0"); slides 1, 2 and 3
carry speaker notes. A minimal but complete OOXML package (master, layout, theme), written as a zip.
    python3 -I gen_board_briefing.py <out.pptx>
"""
import sys, zipfile
from xml.sax.saxutils import escape

SLIDES = [
    {"title": "Board Briefing: Spring 2026", "body": ["Harbor Lights Youth Alliance"],
     "notes": ["Open with thanks to the finance committee."], "hidden": False},
    {"title": "Teen drop-in center: first quarter",
     "body": ["212 young people visited", "Evening hours added on Thursdays", "Bilingual counselor started in February"],
     "notes": ["Board asked for monthly visit counts."], "hidden": False},
    {"title": "Draft budget detail (not for presentation)",
     "body": ["Transport vouchers: $18,400 of $25,000 spent", "Counselor contract renews in June"],
     "notes": ["Keep hidden until the audit closes."], "hidden": True},
    {"title": "Next steps", "body": ["Open a second site in Eastvale by September", "Report to donors each spring"],
     "notes": [], "hidden": False},
]
NS = ('xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"')
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"

def paras(lines):
    return "".join(f'<a:p><a:r><a:rPr lang="en-US"/><a:t>{escape(l)}</a:t></a:r></a:p>' for l in lines)

def sp(i, name, ph, lines):
    return (f'<p:sp><p:nvSpPr><p:cNvPr id="{i}" name="{name}"/><p:cNvSpPr/><p:nvPr><p:ph {ph}/></p:nvPr></p:nvSpPr>'
            f'<p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>{paras(lines)}</p:txBody></p:sp>')

def tree(shapes):
    return ('<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
            f'<p:grpSpPr/>{shapes}</p:spTree></p:cSld>')

def main(out):
    n = len(SLIDES)
    ct = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
          '<Default Extension="xml" ContentType="application/xml"/>',
          '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>',
          '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>',
          '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>',
          '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>']
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for i, s in enumerate(SLIDES, 1):
            ct.append(f'<Override PartName="/ppt/slides/slide{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>')
            show = ' show="0"' if s["hidden"] else ""
            z.writestr(f"ppt/slides/slide{i}.xml", f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld {NS}{show}>'
                       + tree(sp(2, "Title", 'type="title"', [s["title"]]) + sp(3, "Body", 'idx="1"', s["body"])) + '</p:sld>')
            rels = [f'<Relationship Id="rId1" Type="{REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>']
            if s["notes"]:
                ct.append(f'<Override PartName="/ppt/notesSlides/notesSlide{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>')
                rels.append(f'<Relationship Id="rId2" Type="{REL}/notesSlide" Target="../notesSlides/notesSlide{i}.xml"/>')
                z.writestr(f"ppt/notesSlides/notesSlide{i}.xml", f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:notes {NS}>'
                           + tree(sp(2, "Slide Image", 'type="sldImg"', []) + sp(3, "Notes", 'type="body" idx="1"', s["notes"])
                                  + sp(4, "Slide Number", 'type="sldNum" idx="5"', [str(i)])) + '</p:notes>')
                z.writestr(f"ppt/notesSlides/_rels/notesSlide{i}.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                           f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="{REL}/slide" Target="../slides/slide{i}.xml"/></Relationships>')
            z.writestr(f"ppt/slides/_rels/slide{i}.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                       '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + "".join(rels) + '</Relationships>')
        ct.append('</Types>')
        z.writestr("[Content_Types].xml", "".join(ct))
        z.writestr("_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                   f'<Relationship Id="rId1" Type="{REL}/officeDocument" Target="ppt/presentation.xml"/></Relationships>')
        sld = "".join(f'<p:sldId id="{255 + i}" r:id="rId{i + 1}"/>' for i in range(1, n + 1))
        z.writestr("ppt/presentation.xml", f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation {NS}>'
                   f'<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>{sld}</p:sldIdLst>'
                   '<p:sldSz cx="9144000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>')
        prels = [f'<Relationship Id="rId1" Type="{REL}/slideMaster" Target="slideMasters/slideMaster1.xml"/>']
        prels += [f'<Relationship Id="rId{i + 1}" Type="{REL}/slide" Target="slides/slide{i}.xml"/>' for i in range(1, n + 1)]
        prels.append(f'<Relationship Id="rId{n + 2}" Type="{REL}/theme" Target="theme/theme1.xml"/>')
        z.writestr("ppt/_rels/presentation.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + "".join(prels) + '</Relationships>')
        z.writestr("ppt/slideMasters/slideMaster1.xml", f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster {NS}>' + tree("")
                   + '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
                   '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>')
        z.writestr("ppt/slideMasters/_rels/slideMaster1.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                   f'<Relationship Id="rId1" Type="{REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="{REL}/theme" Target="../theme/theme1.xml"/></Relationships>')
        z.writestr("ppt/slideLayouts/slideLayout1.xml", f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout {NS}>' + tree("") + '</p:sldLayout>')
        z.writestr("ppt/slideLayouts/_rels/slideLayout1.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                   f'<Relationship Id="rId1" Type="{REL}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>')
        z.writestr("ppt/theme/theme1.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Plain"><a:themeElements>'
                   '<a:clrScheme name="Plain"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F1F1F"/></a:dk2><a:lt2><a:srgbClr val="EEEEEE"/></a:lt2>'
                   + "".join(f'<a:accent{k}><a:srgbClr val="4472C4"/></a:accent{k}>' for k in range(1, 7))
                   + '<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>'
                   '<a:fontScheme name="Plain"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>'
                   '<a:fmtScheme name="Plain"><a:fillStyleLst><a:noFill/><a:noFill/><a:noFill/></a:fillStyleLst><a:lnStyleLst><a:ln/><a:ln/><a:ln/></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:noFill/><a:noFill/><a:noFill/></a:bgFillStyleLst></a:fmtScheme>'
                   '</a:themeElements></a:theme>')

if __name__ == "__main__":
    main(sys.argv[1])
