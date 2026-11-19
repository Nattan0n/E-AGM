"""Admin console (drawio pages 13-16): agendas, open / close voting, room, settings, publish results, close meeting,
users, and every admin page opens."""
import re

import pytest
from playwright.sync_api import Page, expect

from console_pages import alerts, dialog, heading, staff_login, toast

pytestmark = pytest.mark.admin


def admin(page: Page) -> Page:
    staff_login(page, "admin")
    expect(heading(page, "Dashboard")).to_be_visible()
    return page


# ---------- page 13: before the meeting ----------

def test_admin_sees_staff_pages_too(page: Page):
    admin(page)
    page.goto("/staff/vote")
    expect(heading(page, "ลงคะแนนแทน")).to_be_visible()


def test_add_edit_delete_agenda(page: Page, is_mobile: bool):
    admin(page)
    page.goto("/admin/agenda")
    page.get_by_role("button", name="+ เพิ่มวาระ").click()
    d = dialog(page, "เพิ่มวาระ")
    d.get_by_label("เลขที่วาระ").fill("7")
    d.get_by_label("ชื่อวาระ (ไทย)").fill("พิจารณาเรื่องอื่น ๆ (บอททดสอบ)")
    d.get_by_role("button", name="บันทึก").click()
    expect(toast(page)).to_contain_text("เพิ่มวาระแล้ว")
    expect(page.get_by_text("พิจารณาเรื่องอื่น ๆ (บอททดสอบ)")).to_be_visible()

    edit = page.get_by_role("button", name="แก้ไขวาระ 7") if is_mobile else page.get_by_role("row").filter(has_text="บอททดสอบ").get_by_role("button", name="แก้ไข")
    edit.click()
    d = dialog(page, "แก้ไขวาระ")
    expect(d.get_by_label("เลขที่วาระ")).to_be_disabled()
    d.get_by_label("ชื่อวาระ (ไทย)").fill("พิจารณาเรื่องอื่น ๆ (แก้แล้ว)")
    d.get_by_role("button", name="บันทึก").click()
    expect(toast(page)).to_contain_text("บันทึกวาระแล้ว")
    expect(page.get_by_text("พิจารณาเรื่องอื่น ๆ (แก้แล้ว)")).to_be_visible()

    delete = page.get_by_role("button", name="ลบวาระ 7") if is_mobile else page.get_by_role("row").filter(has_text="แก้แล้ว").get_by_role("button", name="ลบ")
    delete.click()
    dialog(page, "ยืนยันการลบวาระ").get_by_role("button", name="ลบวาระ").click()
    expect(toast(page)).to_contain_text("ลบวาระแล้ว")
    expect(page.get_by_text("พิจารณาเรื่องอื่น ๆ (แก้แล้ว)")).to_have_count(0)


def test_started_agendas_cannot_be_edited(page: Page, is_mobile: bool):
    admin(page)
    page.goto("/admin/agenda")
    if is_mobile:
        expect(page.get_by_role("button", name="แก้ไขวาระ 3")).to_be_disabled()  # open
        expect(page.get_by_role("button", name="ลบวาระ 1")).to_be_disabled()  # closed
        expect(page.get_by_role("button", name="แก้ไขวาระ 4")).to_be_enabled()  # pending
    else:
        rows = page.get_by_role("row")
        expect(rows.filter(has_text="พิจารณาอนุมัติงบแสดงฐานะ").get_by_role("button", name="แก้ไข")).to_be_disabled()
        expect(rows.filter(has_text="รับรองรายงานการประชุม").get_by_role("button", name="ลบ")).to_be_disabled()
        expect(rows.filter(has_text="จัดสรรกำไร").get_by_role("button", name="แก้ไข")).to_be_enabled()


def test_create_user(page: Page):
    admin(page)
    page.goto("/admin/users")
    page.get_by_role("button", name="+ เพิ่มผู้ใช้").click()
    d = dialog(page, "เพิ่มผู้ใช้")
    d.get_by_label("ชื่อผู้ใช้").fill("bot_staff")
    d.get_by_label("ชื่อ-นามสกุล").fill("บอท ทดสอบ")
    pw = d.get_by_label(re.compile("รหัสผ่าน"))
    pw.fill("short")
    d.get_by_role("button", name="บันทึก").click()
    # the browser's own minLength check blocks the submit (its tooltip is not in the DOM)
    assert pw.evaluate("el => el.validity.tooShort") is True
    expect(d).to_be_visible()
    pw.fill("long-enough-pw")
    d.get_by_role("button", name="บันทึก").click()
    expect(toast(page)).to_contain_text("สร้างผู้ใช้แล้ว")
    expect(page.get_by_text("bot_staff").first).to_be_visible()


# ---------- page 14-15: meeting day ----------

def test_room_switch(page: Page):
    admin(page)
    page.goto("/admin/vote-control")
    expect(page.get_by_text("ห้องประชุมออนไลน์: เปิดแล้ว")).to_be_visible()
    page.get_by_role("switch", name="ปิดห้องประชุมออนไลน์").click()
    expect(toast(page)).to_contain_text("ปิดห้องประชุมแล้ว")
    expect(page.get_by_text(re.compile("ห้องประชุมออนไลน์: ยังไม่เปิด"))).to_be_visible()
    page.get_by_role("switch", name="เปิดห้องประชุมออนไลน์").click()
    expect(page.get_by_text("ห้องประชุมออนไลน์: เปิดแล้ว")).to_be_visible()


def test_open_then_close_an_agenda(page: Page):
    admin(page)
    page.goto("/admin/vote-control")
    page.get_by_role("switch", name="เปิดโหวตวาระ 4").click()
    expect(toast(page)).to_contain_text("เปิดโหวตวาระ 4 แล้ว")
    expect(page.get_by_role("switch", name="ปิดโหวตวาระ 4")).to_have_attribute("aria-checked", "true")

    page.get_by_role("button", name="■ ปิดการลงคะแนน วาระที่ 4").click()
    d = dialog(page, "ปิดโหวตวาระ 4")
    confirm = d.get_by_role("button", name="ยืนยันปิดโหวต")
    expect(confirm).to_be_disabled()  # must acknowledge "not voted = agree"
    d.get_by_role("checkbox", name=re.compile("นับเป็น เห็นด้วย")).check()
    confirm.click()
    expect(toast(page)).to_contain_text("ปิดโหวตวาระ 4 แล้ว")
    # closed agendas cannot be reopened
    expect(page.get_by_role("switch", name="ปิดแล้ว - เปิดซ้ำไม่ได้").first).to_be_disabled()


def test_cancel_closing_keeps_the_agenda_open(page: Page):
    admin(page)
    page.goto("/admin/vote-control")
    page.get_by_role("button", name="■ ปิดการลงคะแนน วาระที่ 3").click()
    dialog(page, "ปิดโหวตวาระ 3").get_by_role("button", name="ยกเลิก").click()
    expect(page.get_by_role("switch", name="ปิดโหวตวาระ 3")).to_have_attribute("aria-checked", "true")


# ---------- page 16: after the meeting ----------

def test_quorum_must_be_between_0_and_100(page: Page):
    admin(page)
    page.goto("/admin/settings")
    q = page.get_by_label("เกณฑ์องค์ประชุม (%)").first
    q.fill("0")
    expect(page.get_by_text("ต้องอยู่ระหว่าง 0-100")).to_be_visible()
    expect(page.get_by_role("button", name="บันทึก", exact=True)).to_be_disabled()


def test_publish_results_reaches_the_settings(page: Page):
    admin(page)
    page.goto("/admin/settings")
    box = page.get_by_role("checkbox", name=re.compile("เผยแพร่ผลมติรายวาระ"))
    expect(box).not_to_be_checked()
    box.check()
    page.get_by_role("button", name="บันทึก", exact=True).click()
    expect(toast(page)).to_contain_text("บันทึกการตั้งค่าแล้ว")
    page.reload()
    expect(page.get_by_role("checkbox", name=re.compile("เผยแพร่ผลมติรายวาระ"))).to_be_checked()


def test_close_meeting_makes_everything_read_only(page: Page):
    admin(page)
    page.goto("/admin/settings")
    page.get_by_role("button", name="ปิดการประชุม", exact=True).click()
    d = dialog(page, "ยืนยันการปิดการประชุม")
    expect(d).to_contain_text("ไม่สามารถย้อนกลับได้")
    d.get_by_role("button", name="ยืนยันปิดการประชุม").click()
    expect(toast(page)).to_contain_text("ปิดการประชุมแล้ว")
    expect(page.get_by_text(re.compile("ปิดแล้ว - ข้อมูลเป็นแบบอ่านอย่างเดียว"))).to_be_visible()
    expect(page.get_by_role("button", name="ปิดการประชุมแล้ว")).to_be_disabled()
    # a new year can be created only now
    expect(page.get_by_role("button", name="สร้างการประชุม")).to_be_enabled()
    # staff pages turn read-only as well
    page.goto("/staff/vote?acc=1007")
    expect(page.get_by_text("การประชุมปิดแล้ว — ระบบอยู่ในโหมดอ่านอย่างเดียว")).to_be_visible()
    expect(page.get_by_role("button", name="เห็นด้วย", exact=True)).to_be_disabled()


@pytest.mark.parametrize("path,title", [
    ("/admin", "Dashboard"),
    ("/admin/agenda", "จัดการวาระการประชุม"),
    ("/admin/vote-control", "เปิด/ปิดการลงคะแนน"),
    ("/admin/attendees", "ผู้เข้าร่วมประชุม"),
    ("/admin/holders", "ทะเบียนผู้ถือหุ้น"),
    ("/admin/users", "จัดการผู้ใช้งาน"),
    ("/admin/audit", "Audit Log"),
    ("/admin/export", "ส่งออกรายงาน"),
    ("/admin/history", "ประวัติการประชุม"),
    ("/admin/report", "รายงานสรุปผลการประชุม"),
    ("/admin/settings", "ตั้งค่าการประชุม"),
])
def test_admin_pages_open(page: Page, path: str, title: str):
    admin(page)
    page.goto(path)
    expect(heading(page, title)).to_be_visible()
    expect(alerts(page)).to_have_count(0)
