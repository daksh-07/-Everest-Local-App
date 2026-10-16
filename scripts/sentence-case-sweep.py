#!/usr/bin/env python3
"""Design-system sweep: convert ALL-CAPS display copy to sentence case and lift sub-legible text.

Only unambiguous display text is touched, so status enums and comparisons stay intact:
  * JSX text nodes:            >OPEN JOBS<            -> >Open jobs<
  * ternary-branch literals:   ?'OPENING…':'MESSAGE'  -> ?'Opening…':'Message'
    (only literals with a space or ellipsis, or a short whitelist of action words;
     enum values never contain spaces and are never the branch of a display ternary)
  * style objects with fontSize below 11 are raised to 12 (11 when they look like badges).
Usage: python3 scripts/sentence-case-sweep.py [--check] file...
"""
import re, sys

KEEP = {'ABN','ABR','ACN','CTP','VIN','CRM','AUD','GST','ETA','ID','DM','AI','PWA','URL','SMS','QR','FAQ','SKU','PDF','CSV','API','MFA','PIN','IOS','KM','NSW','VIC','QLD','WA','SA','TAS','ACT','NT','AU','OK','UK','USA'}
PROPER = {'everest':'Everest','local':'Local','live':'Live','stripe':'Stripe','apple':'Apple','google':'Google','android':'Android','iphone':'iPhone','pro':'Pro','studio':'Studio','connect':'Connect'}
# Single words can be enum values used in ternaries (e.g. 'CONFIRM', 'UPDATE'); only RETRY is safe.
ACTION_WORDS = {'RETRY'}

def sentence(text):
    words = re.split(r'(\s+|·|/|&|→|\+)', text)
    out = []
    first = True
    brand_run = False
    for w in words:
        if not w or re.fullmatch(r'\s+|·|/|&|→|\+', w):
            if w == '·': first = True  # '·' separates named sections: 'Business mode · Calendar'
            out.append(w); continue
        core = re.sub(r'[^A-Za-z]', '', w)
        if core.upper() in KEEP and len(core) > 1:
            out.append(w.upper()); first = False; brand_run = False; continue
        lw = w.lower()
        if core.lower() == 'everest':
            out.append(w[0] + lw[1:] if w[0].isalpha() else lw.replace('everest', 'Everest')); brand_run = True; first = False; continue
        if brand_run and core.lower() in ('local', 'live', 'pro', 'studio', 'connect'):
            out.append(lw.capitalize()); first = False; continue
        brand_run = False
        if core.lower() in ('stripe', 'apple', 'google', 'android'):
            out.append(lw.capitalize()); first = False; continue
        if core.lower() == 'iphone':
            out.append(lw.replace('iphone', 'iPhone')); first = False; continue
        if first:
            m = re.search(r'[a-z]', lw)
            out.append(lw[:m.start()] + lw[m.start()].upper() + lw[m.start()+1:] if m else lw)
            first = False
        else:
            out.append(lw)
    return ''.join(out)

CAPS = r"[A-Z][A-Z0-9 &·…'’/→+?!.,:%$()-]*[A-Z0-9…?!).%]"
# String literals must not span quotes, ternary colons or question marks.
LIT = r"[A-Z][A-Z0-9 &·…’/→+!.,%$()-]*[A-Z0-9…!).%]"
def is_caps(text):
    letters = re.sub(r'[^A-Za-z]', '', text)
    return len(letters) >= 2 and letters.isupper()

def sweep(src):
    changes = 0
    def jsx(m):
        nonlocal changes
        inner = m.group(1)
        if not is_caps(inner) or len(re.sub(r'[^A-Za-z]', '', inner)) < 3: return m.group(0)
        if re.fullmatch(r'[A-Z]{2,4}', inner.strip()) and inner.strip() in KEEP: return m.group(0)
        changes += 1
        return '>' + sentence(inner) + '<'
    src = re.sub(r'>(' + CAPS + r')<', jsx, src)
    def lit(m):
        nonlocal changes
        prefix, q, inner = m.group(1), m.group(2), m.group(3)
        if not is_caps(inner): return m.group(0)
        if ' ' not in inner and '…' not in inner and inner not in ACTION_WORDS: return m.group(0)
        changes += 1
        return prefix + q + sentence(inner) + q
    # then-branch: ?'X'   else-branch: 'Y':'X'  (the else must follow a closing quote)
    src = re.sub(r"(\?\s*)(['\"])(" + LIT + r")\2", lit, src)
    src = re.sub(r"(['\"]\s*:\s*)(['\"])(" + LIT + r")\2", lit, src)
    def font(m):
        nonlocal changes
        size = float(m.group(1))
        if size >= 11: return m.group(0)
        changes += 1
        return 'fontSize:12'
    src = re.sub(r'fontSize:\s*(\d+(?:\.\d+)?)(?=\s*[,}])', font, src)
    # letter-spaced eyebrows read as shouting once the copy is sentence case
    src2 = re.sub(r",\s*letterSpacing:\s*(?:[1-9](?:\.\d+)?|0?\.[4-9]\d*)(?=\s*[,}])", '', src)
    src2 = re.sub(r"(?<=[{,])\s*letterSpacing:\s*(?:[1-9](?:\.\d+)?|0?\.[4-9]\d*)\s*,", ' ', src2)
    if src2 != src: changes += 1
    return src2, changes

if __name__ == '__main__':
    check = '--check' in sys.argv
    total = 0
    for path in [a for a in sys.argv[1:] if a != '--check']:
        src = open(path, encoding='utf-8').read()
        out, n = sweep(src)
        if n and out != src:
            total += n
            print(f'{path}: {n}')
            if not check: open(path, 'w', encoding='utf-8').write(out)
    print('total', total)
