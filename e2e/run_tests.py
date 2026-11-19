"""Menu launcher for the e2e bot (started by run_tests.bat). Installs what is missing, runs pytest, opens the report."""
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPORT = HERE / "reports" / "report.html"  # not in test-results: pytest-playwright empties that folder

MODES = {
    "1": ("รันทุกเทสต์แบบเร็ว (ไม่เปิดหน้าจอ, ประมาณ 10 นาที)", []),
    "2": ("ดูบอทกดให้ดู (เปิดเบราว์เซอร์, เฉพาะจอเดสก์ท็อป)", ["--headed", "--slowmo", "400", "-k", "desktop"]),
    "3": ("เฉพาะ ผู้ถือหุ้น (ขอ User / เข้าสู่ระบบ / ลงคะแนน)", ["-m", "holder"]),
    "4": ("เฉพาะ เจ้าหน้าที่ Staff (ลงทะเบียน / ลงคะแนนแทน / มาสาย / ตัดสิทธิ์)", ["-m", "staff"]),
    "5": ("เฉพาะ ผู้ดูแลระบบ Admin (วาระ / เปิดปิดโหวต / ตั้งค่า / ผู้ใช้)", ["-m", "admin"]),
}


def run(*args: str, quiet: bool = False) -> int:
    out = subprocess.DEVNULL if quiet else None
    # no stdin: installers must not swallow the menu answer
    return subprocess.call([sys.executable, *args], cwd=HERE, stdout=out, stdin=subprocess.DEVNULL)


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    line = "=" * 46
    print(line)
    print("  E-AGM Test Bot - ทดสอบ flow ผู้ถือหุ้น / Staff / Admin")
    print("  เว็บ: https://e-agm-one.vercel.app")
    print(line + "\n")

    print("[1/2] ตรวจสอบโปรแกรมที่ต้องใช้...")
    if run("-m", "pip", "install", "-q", "-r", "requirements.txt") != 0:
        print("[X] ติดตั้งแพ็กเกจไม่สำเร็จ (ตรวจสอบอินเทอร์เน็ต)")
        return 1
    if run("-m", "playwright", "install", "chromium", quiet=True) != 0:
        print("[X] ติดตั้งเบราว์เซอร์ Chromium ไม่สำเร็จ")
        return 1
    print("      พร้อมแล้ว\n")

    print("เลือกโหมด:")
    for k, (label, _) in MODES.items():
        print(f"  {k} = {label}")
    choice = ""
    while choice not in MODES:
        choice = input("พิมพ์เลข 1-5 แล้วกด Enter: ").strip().lstrip("﻿") or "1"
    print()

    print("[2/2] กำลังทดสอบ...\n", flush=True)
    env_args = ["-m", "pytest", "-p", "no:cacheprovider", *MODES[choice][1], f"--html={REPORT}", "--self-contained-html"]
    os.environ["PYTHONIOENCODING"] = "utf-8"
    REPORT.parent.mkdir(exist_ok=True)
    code = run(*env_args)

    print("\n" + line)
    if code == 0:
        print("  ผ่านทั้งหมด")
    else:
        print("  มีเทสต์ไม่ผ่าน - ดูรายละเอียดในรายงาน")
        print(f"  screenshot / trace อยู่ใน {HERE / 'test-results'}")
    print(line)
    if REPORT.exists() and not os.environ.get("NO_OPEN"):
        os.startfile(REPORT)  # opens the HTML report in the default browser
    return code


if __name__ == "__main__":
    sys.exit(main())
