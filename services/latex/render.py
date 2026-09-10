"""One disposable, networkless container per render. Never run on the application host."""
import base64
import glob
import json
import os
import re
import subprocess
import sys


def run(args):
    process = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=15)
    if process.returncode:
        # Compiler output may contain user code, but the sandbox has no application secrets.
        log = process.stdout.decode("utf-8", errors="replace")
        errors = [line for line in log.splitlines() if line.startswith("!") or "Error" in line or "not found" in line]
        raise ValueError("\n".join(errors)[-1200:] or "Ошибка компиляции. Проверьте код и подключённые пакеты.")


def render(payload):
    source, mode, config = payload["source"], payload["mode"], payload["config"]
    if not isinstance(source, str) or not 0 < len(source) <= 16000 or mode not in ("math", "asy", "document"):
        raise ValueError("Некорректный исходный код.")
    packages = config["packages"]
    if len(packages) > 60 or any(not re.fullmatch(r"[a-zA-Z][a-zA-Z0-9-]{0,63}", p) for p in packages):
        raise ValueError("Некорректное имя пакета.")
    if len(config["preamble"]) > 16000 or len(config["libraries"]) > 8:
        raise ValueError("Слишком большие настройки.")
    names = set()
    for library in config["libraries"]:
        name = library["name"]
        if not re.fullmatch(r"[a-zA-Z][a-zA-Z0-9_-]{0,63}\.(sty|asy)", name) or name in names or len(library["source"]) > 16000:
            raise ValueError("Некорректная библиотека.")
        names.add(name)
        with open(name, "w", encoding="utf-8") as file:
            file.write(library["source"])
    # UTF-8, T2A and Babel provide Russian/English in the actual TeX engine.
    preamble = "\\documentclass[12pt]{article}\n\\usepackage[utf8]{inputenc}\n\\usepackage[T2A,T1]{fontenc}\n\\usepackage[english,russian]{babel}\n\\usepackage[margin=12mm,paperwidth=210mm,paperheight=297mm]{geometry}\n\\pagestyle{empty}\n"
    preamble += "\n".join("\\usepackage{" + p + "}" for p in dict.fromkeys(packages) if p not in ("inputenc", "fontenc", "babel", "geometry"))
    if mode == "math":
        source = "\\[" + source + "\\]"
    elif mode == "asy":
        source = "\\begin{asy}\n" + source + "\n\\end{asy}"
    source = source.replace("\r\n", "\n")
    source = re.sub(r"(\\begin\{asy\}(?:\[[^\]\n]*\])?)[ \t]*\n?", r"\1\n", source)
    source = re.sub(r"[ \t]*(\\end\{asy\})", r"\n\1\n", source)
    document = preamble + "\n" + config["preamble"] + "\n\\begin{document}\n" + source + "\n\\end{document}\n"
    with open("main.tex", "w", encoding="utf-8") as file:
        file.write(document)
    latex = ["pdflatex", "-no-shell-escape", "-interaction=nonstopmode", "-halt-on-error", "main.tex"]
    run(latex)
    for name in sorted(glob.glob("main-*.asy")):
        # Safe mode adds defence in depth; container isolation is the security boundary.
        run(["asy", "-safe", "-noV", "-config", "/dev/null", "-tex", "pdflatex", name])
    run(latex)
    # Crop whitespace without invoking TeX shell escape; raster output cannot execute scripts.
    info = subprocess.check_output(["pdfinfo", "main.pdf"], timeout=5).decode("utf-8", errors="replace")
    if not re.search(r"Pages:\s+1\s", info):
        raise ValueError("Результат занимает больше одной страницы. Разделите рисунок или таблицу на части.")
    run(["pdfcrop", "--restricted", "main.pdf", "cropped.pdf"])
    run(["pdftoppm", "-f", "1", "-singlefile", "-scale-to", "1800", "-png", "cropped.pdf", "result"])
    if os.path.getsize("result.png") > 5_000_000:
        raise ValueError("Рисунок слишком большой.")
    with open("result.png", "rb") as file:
        return {"image": "data:image/png;base64," + base64.b64encode(file.read()).decode("ascii")}


if __name__ == "__main__":
    try:
        payload = sys.stdin.buffer.read(200001)
        if len(payload) > 200000:
            raise ValueError("Запрос слишком большой.")
        result = render(json.loads(payload))
    except Exception as error:
        result = {"error": str(error)[:1500]}
    print(json.dumps(result, ensure_ascii=False))
