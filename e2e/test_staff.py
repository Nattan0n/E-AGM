"""Staff console (drawio pages 6-12): login, search, onsite registration, convert / cancel, groups, late,
no-voting-right, voting on behalf (single, split, overwrite, clear), summary / roll-call."""
import re

import pytest
from playwright.sync_api import Page, expect

from console_pages import alerts, choose, dialog, heading, logout, pick_holder, search_row_action, staff_login, toast, url

pytestmark = pytest.mark.staff


# ---------- page 6: login / roles ----------

def test_staff_login_lands_on_search(page: Page):
    staff_login(page)
    expect(heading(page, "ค้นหาผู้ถือหุ้น")).to_be_visible()


def test_login_button_needs_username_and_password(page: Page):
    page.goto("/staff/login")
    btn = page.get_by_role("button", name="เข้าสู่ระบบ", exact=True)
    expect(btn).to_be_disabled()
    page.get_by_label("ชื่อผู้ใช้").fill("staff1")
    expect(btn).to_be_disabled()
    page.get_by_label("รหัสผ่าน", exact=True).fill("x")
    expect(btn).to_be_enabled()


def test_staff_cannot_open_admin_pages(page: Page):
    staff_login(page)
    page.goto("/admin/settings")
    expect(page).to_have_url(url("/staff"))


def test_console_needs_login(page: Page):
    page.goto("/staff/vote")
    expect(page).to_have_url(url("/staff/login"))


def test_viewer_is_read_only(page: Page, is_mobile: bool):
    staff_login(page, "viewer1")
    expect(page.get_by_text("บัญชี Viewer — ดูข้อมูลได้อย่างเดียว")).to_be_visible()
    page.get_by_label("ค้นหา", exact=True).fill("1014")
    if is_mobile:
        page.get_by_role("button", name=re.compile(r"\b1014\b")).first.click()
    expect(page.get_by_text("อ่านอย่างเดียว", exact=True).first).to_be_visible()
    expect(page.get_by_role("link", name="+ ลงทะเบียน")).to_have_count(0)


def test_logout(page: Page, is_mobile: bool):
    staff_login(page)
    logout(page, is_mobile)
    page.goto("/staff")
    expect(page).to_have_url(url("/staff/login"))


# ---------- page 7: search + register ----------

def test_search_shows_status(page: Page):
    staff_login(page)
    q = page.get_by_label("ค้นหา", exact=True)
    q.fill("1014")
    expect(page.get_by_text("ชาตรี เลิศล้ำ").first).to_be_visible()
    expect(page.get_by_text("ยังไม่ลงทะเบียน").first).to_be_visible()
    q.fill("ไม่มีชื่อนี้แน่นอน")
    expect(page.get_by_text("ไม่พบผู้ถือหุ้น")).to_be_visible()


def test_register_person_from_search(page: Page, is_mobile: bool):
    staff_login(page)
    search_row_action(page, "1014", "+ ลงทะเบียน", is_mobile)
    expect(page).to_have_url(re.compile(r"/staff/register\?acc=1014"))
    submit = page.get_by_role("button", name="ยืนยันลงทะเบียน")
    expect(submit).to_be_disabled()  # identity not checked yet
    page.get_by_role("checkbox", name=re.compile("ตรวจสอบเอกสารยืนยันตัวตนแล้ว")).check()
    submit.click()
    expect(toast(page)).to_contain_text("ลงทะเบียนสำเร็จ")
    expect(page).to_have_url(re.compile(r"/staff/ballots\?acc=1014"))
    expect(heading(page, "พิมพ์บัตรลงคะแนน")).to_be_visible()


def test_register_proxy_needs_proxy_name_and_valid_shares(page: Page):
    staff_login(page)
    page.goto("/staff/register?acc=1015")
    page.get_by_role("checkbox", name=re.compile("ตรวจสอบเอกสารยืนยันตัวตนแล้ว")).check()
    page.get_by_role("radio", name=re.compile("มอบฉันทะ")).click()
    submit = page.get_by_role("button", name="ยืนยันลงทะเบียน")
    expect(submit).to_be_disabled()
    page.get_by_label("ชื่อผู้รับมอบฉันทะ").fill("นายผู้รับ มอบฉันทะ")
    shares = page.get_by_label("จำนวนหุ้น", exact=True)
    shares.fill("0")
    expect(page.get_by_text(re.compile("จำนวนหุ้นต้องอยู่ระหว่าง 1 ถึง"))).to_be_visible()
    expect(submit).to_be_disabled()
    shares.fill("1000")
    submit.click()
    expect(page).to_have_url(re.compile(r"/staff/ballots\?acc=1015"))


def test_already_registered_holder_cannot_register_again(page: Page):
    staff_login(page)
    page.goto("/staff/register?acc=1001")
    expect(page.get_by_text(re.compile("ลงทะเบียนแล้ว \\(Onsite\\)"))).to_be_visible()
    page.get_by_role("checkbox", name=re.compile("ตรวจสอบเอกสารยืนยันตัวตนแล้ว")).check()
    expect(page.get_by_role("button", name="ยืนยันลงทะเบียน")).to_be_disabled()


# ---------- page 8: convert online -> onsite / cancel ----------

def test_cancel_onsite_registration(page: Page, is_mobile: bool):
    staff_login(page)
    search_row_action(page, "1007", "ยกเลิกลงทะเบียน", is_mobile)
    d = dialog(page, "ยืนยันยกเลิกการลงทะเบียน")
    d.get_by_role("button", name="ยืนยัน").click()
    expect(toast(page)).to_contain_text("ยกเลิกการลงทะเบียนแล้ว")
    expect(page.get_by_text("ยังไม่ลงทะเบียน").first).to_be_visible()


def test_convert_online_self_voter_to_onsite(page: Page, is_mobile: bool):
    staff_login(page)
    search_row_action(page, "1009", "เปลี่ยนเป็น Onsite", is_mobile)
    d = dialog(page, "เปลี่ยนจาก Online เป็น Onsite")
    expect(d).to_contain_text("ย้อนกลับไม่ได้")
    d.get_by_role("button", name="ยืนยัน").click()
    expect(toast(page)).to_contain_text("เปลี่ยนเป็น Onsite แล้ว")


def test_admit_staff_mode_holder_and_vote_for_them(page: Page, is_mobile: bool):
    staff_login(page)
    search_row_action(page, "1010", "รับเข้าห้อง · ลงคะแนนแทน", is_mobile)
    dialog(page, "รับเข้าห้องและลงคะแนนแทน").get_by_role("button", name="ยืนยัน").click()
    expect(page).to_have_url(re.compile(r"/staff/vote\?acc=1010"))
    expect(heading(page, "ลงคะแนนแทน")).to_be_visible()


# ---------- page 9: group ----------

def test_register_group(page: Page):
    staff_login(page)
    page.goto("/staff/register")
    page.get_by_role("tab", name="กลุ่ม (กองทุน / นิติบุคคล)").click()
    submit = page.get_by_role("button", name="ลงทะเบียนกลุ่ม")
    expect(submit).to_be_disabled()
    page.get_by_label("ชื่อกลุ่ม").fill("กองทุนทดสอบบอท")
    pick_holder(page, "1018")
    pick_holder(page, "1019")
    expect(page.get_by_text(re.compile(r"รวมทั้งหมด \(2 สมาชิก\)"))).to_be_visible()
    submit.click()
    expect(toast(page)).to_contain_text("ลงทะเบียนกลุ่มสำเร็จ")
    expect(page).to_have_url(re.compile(r"/staff/ballots\?group=\d+"))


# ---------- page 10: late + no voting right ----------

def test_record_late_arrival(page: Page):
    staff_login(page)
    page.goto("/staff/late")
    expect(heading(page, "ผู้มาสาย")).to_be_visible()
    pick_holder(page, "1003")
    page.get_by_role("button", name=re.compile("บันทึกเวลามาถึง")).click()
    expect(toast(page)).to_contain_text("บันทึกผู้มาสายแล้ว")
    expect(page.get_by_text(re.compile(r"รายชื่อผู้มาสาย — 1 คน"))).to_be_visible()


def test_add_and_restore_no_voting_right(page: Page):
    staff_login(page)
    page.goto("/staff/novote")
    choose(page, "เลือกวาระที่ต้องการจัดการ", re.compile(r"^วาระ 5:"))
    pick_holder(page, "1005")
    page.get_by_role("button", name=re.compile("เพิ่มเป็นผู้ไม่มีสิทธิ์")).click()
    expect(toast(page)).to_contain_text("เพิ่มรายชื่อผู้ไม่มีสิทธิ์แล้ว")
    row = page.get_by_role("row").filter(has_text="1005")
    row.get_by_role("button", name="คืนสิทธิ์").click()
    dialog(page, "คืนสิทธิ์ลงคะแนน").get_by_role("button", name="ยืนยัน").click()
    expect(toast(page)).to_contain_text("คืนสิทธิ์แล้ว")
    expect(page.get_by_role("row").filter(has_text="1005")).to_have_count(0)


def test_no_voting_right_on_a_voted_holder_asks_first(page: Page):
    staff_login(page)
    page.goto("/staff/novote")
    choose(page, "เลือกวาระที่ต้องการจัดการ", re.compile(r"^วาระ 3:"))
    pick_holder(page, "1001")  # already voted on agenda 3
    page.get_by_role("button", name=re.compile("เพิ่มเป็นผู้ไม่มีสิทธิ์")).click()
    d = dialog(page, "ผู้ถือหุ้นลงคะแนนในวาระนี้แล้ว")
    expect(d).to_contain_text("ลบคะแนน")
    d.get_by_role("button", name="ตัดสิทธิ์และลบคะแนน").click()
    expect(toast(page)).to_contain_text("เพิ่มรายชื่อผู้ไม่มีสิทธิ์แล้ว")


def test_closed_agenda_cannot_get_new_exclusions(page: Page):
    staff_login(page)
    page.goto("/staff/novote")
    choose(page, "เลือกวาระที่ต้องการจัดการ", re.compile(r"^วาระ 1:"))
    expect(page.get_by_text("วาระนี้ปิดโหวตแล้ว ไม่สามารถเพิ่มรายชื่อได้")).to_be_visible()
    expect(page.locator("#hp-q")).to_be_disabled()


# ---------- page 11: vote on behalf ----------

def save_vote(page: Page):
    # desktop: button in the voting card; phones: sticky action bar
    page.get_by_role("button", name=re.compile(r"บันทึกการลงคะแนน|ยืนยันการลงคะแนน วาระ")).filter(visible=True).first.click()


def test_vote_on_behalf(page: Page):
    staff_login(page)
    page.goto("/staff/vote?acc=1007")
    expect(page.get_by_text("วาระที่ 3", exact=True)).to_be_visible()
    page.get_by_role("button", name="ไม่เห็นด้วย", exact=True).click()
    save_vote(page)
    d = dialog(page, "ยืนยันการลงคะแนน")
    expect(d).to_contain_text("ไม่เห็นด้วย")
    d.get_by_role("button", name="ยืนยัน").click()
    expect(toast(page)).to_contain_text("บันทึกคะแนน \"ไม่เห็นด้วย\" แล้ว")
    expect(page.get_by_text("ลงแล้ว: ไม่เห็นด้วย")).to_be_visible()


def test_overwrite_warns_and_keeps_the_new_vote(page: Page):
    staff_login(page)
    page.goto("/staff/vote?acc=1001")  # already voted on agenda 3
    expect(page.get_by_text(re.compile("ลงแล้ว:"))).to_be_visible()
    page.get_by_role("button", name="งดออกเสียง", exact=True).click()
    save_vote(page)
    d = dialog(page, "ยืนยันการลงคะแนน")
    expect(d).to_contain_text("เขียนทับคะแนนเดิม")
    d.get_by_role("button", name="ยืนยัน").click()
    expect(page.get_by_text("ลงแล้ว: งดออกเสียง")).to_be_visible()


def test_split_vote_for_a_custodian(page: Page):
    staff_login(page)
    page.goto("/staff/vote?acc=1008")
    page.get_by_role("checkbox", name=re.compile("แบ่งคะแนนเสียง")).check()
    disagree = page.get_by_label("จำนวนหุ้น ไม่เห็นด้วย")
    disagree.fill("999999999")
    expect(page.get_by_text(re.compile("จำนวนเกินหุ้นที่ถือ"))).to_be_visible()
    disagree.fill("1000")
    page.get_by_label("จำนวนหุ้น งดออกเสียง").fill("500")
    save_vote(page)
    d = dialog(page, "ยืนยันการลงคะแนน")
    expect(d).to_contain_text("ไม่เห็นด้วย 1,000")
    expect(d).to_contain_text("งดออกเสียง 500")
    d.get_by_role("button", name="ยืนยัน").click()
    expect(toast(page)).to_contain_text("บันทึกการแบ่งคะแนนแล้ว")


def test_clear_a_vote(page: Page):
    staff_login(page)
    page.goto("/staff/vote?acc=1004")
    page.get_by_role("button", name="ล้างคะแนน").click()
    dialog(page, "ล้างคะแนนที่ลงไว้").get_by_role("button", name="ล้างคะแนน").click()
    expect(toast(page)).to_contain_text("ล้างคะแนนแล้ว")
    expect(page.get_by_text(re.compile("ลงแล้ว:"))).to_have_count(0)


def test_holder_without_right_cannot_be_voted_for(page: Page):
    staff_login(page)
    page.goto("/staff/vote?acc=1002")  # no voting right on agenda 3
    expect(page.get_by_text("ผู้ถือหุ้นรายนี้ไม่มีสิทธิ์ลงคะแนนในวาระนี้")).to_be_visible()
    expect(page.get_by_role("button", name="เห็นด้วย", exact=True)).to_be_disabled()


def test_pending_agenda_is_not_open_for_votes(page: Page):
    staff_login(page)
    page.goto("/staff/vote?acc=1007")
    page.get_by_role("tab", name=re.compile("วาระ 4")).click()
    expect(page.get_by_text("วาระนี้ไม่ได้เปิดรับการลงคะแนน")).to_be_visible()
    expect(page.get_by_role("button", name="เห็นด้วย", exact=True)).to_be_disabled()


def test_vote_page_only_lists_onsite_holders(page: Page):
    staff_login(page)
    page.goto("/staff/vote")
    page.locator("#hp-q").fill("1014")  # not registered
    expect(page.get_by_text("ไม่พบข้อมูล")).to_be_visible()


# ---------- page 12: summary / roll-call ----------

@pytest.mark.parametrize("path,title", [
    ("/staff/summary", "สรุปผลการประชุม"),
    ("/staff/roll-call", "ผลรายผู้ถือหุ้น"),
    ("/staff/ballots", "พิมพ์บัตรลงคะแนน"),
])
def test_report_pages_open(page: Page, path: str, title: str):
    staff_login(page)
    page.goto(path)
    expect(heading(page, title)).to_be_visible()
    expect(alerts(page)).to_have_count(0)
