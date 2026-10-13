#!/usr/bin/env python3
"""Static sanity checks for the Android sources, runnable without a JDK.

The sandbox we develop in has no Java toolchain, so before burning a CI run we
verify the things a compiler would catch first:

  1. every XML resource is well-formed
  2. every @type/name and R.type.name reference resolves to a real resource
  3. every Art.x(...) / sound.x(...) call matches a definition by arity
  4. required SurfaceView / Activity hooks are present
  5. balanced braces and parens per Java file
  6. hex literals that overflow int (the 0xFFRRGGBB ARGB colour trap)
  7. obviously unused imports

Usage:  python3 tools/verify_sources.py
Exit code 0 = all good.
"""
import glob
import os
import re
import sys
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "app", "src", "main", "java", "com", "pushparaj", "rickshawrush")
RES = os.path.join(ROOT, "app", "src", "main", "res")
MANIFEST = os.path.join(ROOT, "app", "src", "main", "AndroidManifest.xml")

PRIMITIVE = r"void|boolean|int|long|float|double|char|byte|short"
DEF_RE = re.compile(
    r"^[ \t]*(?:(?:public|private|protected|static|final|synchronized)[ \t]+)*"
    r"(?:" + PRIMITIVE + r"|[A-Z][\w.]*(?:<[^;]*?>)?(?:\[\])?)"
    r"[ \t]+(\w+)[ \t]*\(([^;{]*?)\)[ \t]*(?:throws [\w., ]+)?\{",
    re.M | re.S,
)


def split_top(s):
    """Split a parameter list on commas that are not nested inside () or [].

    Angle brackets are deliberately NOT tracked: a bare `>` (comparison) or a
    cast such as `(float)` would otherwise corrupt the nesting depth.
    """
    parts, par, brk, cur = [], 0, 0, ""
    for ch in s:
        if ch == "(":
            par += 1
        elif ch == ")":
            par -= 1
        elif ch == "[":
            brk += 1
        elif ch == "]":
            brk -= 1
        if ch == "," and par == 0 and brk == 0:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    parts.append(cur)
    return parts


def call_args(s, start):
    """start is the index of the call's '('; returns its top-level arguments.

    Depth is tracked only for () and []. Angle brackets are ignored on purpose:
    `(float) x` casts and `a > b` comparisons would otherwise desync the depth
    and make the parser stop early.

    Known limitation: an array initializer inside an argument list
    (`f(new int[]{1, 2}, k)`) counts as two arguments, because the comma inside
    the braces is indistinguishable from a separator at this depth. No call
    checked by this script does that, so it is safe here - if you add one,
    hoist the array into a local variable.
    """
    par, brk, i, args, cur = 0, 0, start, [], ""
    instr = inchr = False
    while i < len(s):
        ch = s[i]
        if instr:
            if ch == "\\":
                cur += ch + (s[i + 1] if i + 1 < len(s) else "")
                i += 2
                continue
            if ch == '"':
                instr = False
            cur += ch
            i += 1
            continue
        if inchr:
            if ch == "\\":
                cur += ch + (s[i + 1] if i + 1 < len(s) else "")
                i += 2
                continue
            if ch == "'":
                inchr = False
            cur += ch
            i += 1
            continue
        if ch == '"':
            instr = True
            cur += ch
            i += 1
            continue
        if ch == "'":
            inchr = True
            cur += ch
            i += 1
            continue
        if ch == "(":
            par += 1
            if par == 1:            # the call's own paren: skip, don't record
                i += 1
                continue
        elif ch == ")":
            par -= 1
            if par == 0:            # end of the argument list
                args.append(cur)
                break
        elif ch == "[":
            brk += 1
        elif ch == "]":
            brk -= 1
        elif ch == "," and par == 1 and brk == 0:
            args.append(cur)
            cur = ""
            i += 1
            continue
        cur += ch
        i += 1
    return [a for a in args if a.strip()]


def strip_comments_strings(s):
    """Blank out comments and string/char literals so brace counting is honest."""
    out, i, n = [], 0, len(s)
    while i < n:
        if s.startswith("//", i):
            j = s.find("\n", i)
            i = n if j < 0 else j
            continue
        if s.startswith("/*", i):
            j = s.find("*/", i + 2)
            i = n if j < 0 else j + 2
            out.append(" ")
            continue
        if s[i] == '"':
            i += 1
            while i < n and s[i] != '"':
                i += 2 if s[i] == "\\" else 1
            i += 1
            out.append('""')
            continue
        if s[i] == "'":
            i += 1
            while i < n and s[i] != "'":
                i += 2 if s[i] == "\\" else 1
            i += 1
            out.append("''")
            continue
        out.append(s[i])
        i += 1
    return "".join(out)


def defs(path):
    s = open(path, encoding="utf-8").read()
    out = {}
    for m in DEF_RE.finditer(s):
        name, params = m.group(1), m.group(2).strip()
        n = 0 if not params else len([a for a in split_top(params) if a.strip()])
        out.setdefault(name, set()).add(n)
    return out


def main():
    fails, notes = [], []

    java_files = sorted(glob.glob(os.path.join(SRC, "*.java")))
    xml_files = sorted(glob.glob(os.path.join(RES, "**", "*.xml"), recursive=True)) + [MANIFEST]

    # 1. XML well-formed
    for f in xml_files:
        try:
            ET.parse(f)
        except Exception as e:
            fails.append("XML %s -> %s" % (os.path.relpath(f, ROOT), e))

    # 2. resource references resolve
    defined = {"string": set(), "color": set(), "drawable": set(), "mipmap": set(), "style": set()}
    for f in glob.glob(os.path.join(RES, "values*", "*.xml")):
        t = open(f, encoding="utf-8").read()
        for kind in ("string", "color"):
            defined[kind] |= set(re.findall(r'<%s name="([^"]+)"' % kind, t))
        defined["style"] |= set(re.findall(r'<style name="([^"]+)"', t))
    for f in glob.glob(os.path.join(RES, "drawable*", "*")):
        defined["drawable"].add(re.sub(r"\.(xml|png|webp)$", "", os.path.basename(f)))
    for f in glob.glob(os.path.join(RES, "mipmap*", "*")):
        defined["mipmap"].add(re.sub(r"\.(xml|png|webp)$", "", os.path.basename(f)))

    refs = set()
    for f in xml_files:
        for kind, name in re.findall(r"@(string|color|drawable|mipmap|style)/([\w.]+)",
                                     open(f, encoding="utf-8").read()):
            refs.add((kind, name))
    for f in java_files:
        for kind, name in re.findall(r"\bR\.(string|color|drawable|mipmap|style)\.(\w+)",
                                     open(f, encoding="utf-8").read()):
            refs.add((kind, name))
    for kind, name in sorted(refs):
        if name not in defined.get(kind, ()):
            fails.append("missing resource @%s/%s" % (kind, name))

    # 3. cross-class call arity
    tables = {
        "Art": defs(os.path.join(SRC, "Art.java")),
        "sound": defs(os.path.join(SRC, "SoundEngine.java")),
        "Config": defs(os.path.join(SRC, "Config.java")),
    }
    for f in java_files:
        s = open(f, encoding="utf-8").read()
        for m in re.finditer(r"\b(Art|sound|Config)\s*\.\s*(\w+)\s*\(", s):
            owner, name = m.group(1), m.group(2)
            table = tables[owner]
            if name not in table:
                # field access, not a call - only complain for Art/sound helpers
                continue
            n = len(call_args(s, m.end() - 1))
            if n not in table[name]:
                fails.append("%s: %s.%s(%d args) but defined with %s"
                             % (os.path.basename(f), owner, name, n, sorted(table[name])))

    # 4. required hooks
    gv = open(os.path.join(SRC, "GameView.java"), encoding="utf-8").read()
    for meth in ("surfaceCreated", "surfaceChanged", "surfaceDestroyed",
                 "onTouchEvent", "onWindowFocusChanged"):
        if not re.search(r"public (?:void|boolean) " + meth + r"\s*\(", gv):
            fails.append("GameView missing override: " + meth)
    if "implements SurfaceHolder.Callback" not in gv:
        fails.append("GameView must implement SurfaceHolder.Callback")
    ma = open(os.path.join(SRC, "MainActivity.java"), encoding="utf-8").read()
    for meth in re.findall(r"gameView\.(\w+)\s*\(", ma):
        if not re.search(r"(?:public |)void " + meth + r"\s*\(", gv):
            fails.append("MainActivity calls gameView.%s() but GameView has no such method" % meth)

    # 5. balanced delimiters
    for f in java_files:
        s = strip_comments_strings(open(f, encoding="utf-8").read())
        for op, cl in (("{", "}"), ("(", ")"), ("[", "]")):
            if s.count(op) != s.count(cl):
                fails.append("%s: unbalanced %s%s (%d vs %d)"
                             % (os.path.basename(f), op, cl, s.count(op), s.count(cl)))

    # 6. int literals that overflow Java's 32-bit signed range.
    #    This is the classic ARGB colour bug: 0xFF14331F is 4279513887, which
    #    javac rejects with "integer number too large" unless written as a long
    #    (0xFF14331FL). A long constant in range 0x80000000..0xFFFFFFFF still
    #    narrows implicitly when assigned to an int or passed to setColor(int).
    INT_MAX = 0x7FFFFFFF
    for f in java_files:
        for m in re.finditer(r"\b0[xX]([0-9a-fA-F]+)(?![0-9a-fA-FlL])",
                             open(f, encoding="utf-8").read()):
            if int(m.group(1), 16) > INT_MAX:
                line = open(f, encoding="utf-8").read()[: m.start()].count("\n") + 1
                fails.append("%s:%d hex literal 0x%s exceeds Integer.MAX_VALUE - "
                             "needs a trailing L"
                             % (os.path.basename(f), line, m.group(1)))

    # 7. unused imports
    for f in java_files:
        s = open(f, encoding="utf-8").read()
        body = re.sub(r"^import .*$", "", s, flags=re.M)
        for imp in re.findall(r"^import (?:static )?([\w.]+);", s, re.M):
            simple = imp.split(".")[-1]
            if not re.search(r"\b" + re.escape(simple) + r"\b", body):
                notes.append("%s: unused import %s" % (os.path.basename(f), imp))

    print("java files : %d" % len(java_files))
    print("xml files  : %d" % len(xml_files))
    print("resources  : %s" % {k: len(v) for k, v in defined.items()})
    print("refs       : %d" % len(refs))
    if notes:
        print("\n--- notes (non-fatal) ---")
        for n in notes:
            print("   . " + n)
    print("\n--- failures: %d ---" % len(fails))
    for x in fails:
        print("  !! " + x)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
