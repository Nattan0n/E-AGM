"""Flow page 17: OMD Review of User requests - documents, call-back note, approve / reject, two approvers for large
holders, and the holder seeing the result of a request they sent."""
import re

import pytest
from playwright.sync_api import Page, expect

from console_pages import dialog, logout, staff_login, toast
from holder_pages import fill, ready, url
from mock_data import OTP, UNKNOWN

pytestmark = pytest.mark.staff

PDF = {"name": "idcard.pdf", "mimeType": "application/pdf", "buffer": b"%PDF-1.4\n%mock\n"}


def open_requests(page: Page, username: str = "staff1"):
    staff_login(page, username)
    page.goto("/staff/requests")
    ready(page)
    expect(page.get_by_role("tab", name=re.compile("รอตรวจ"))).to_be_visible()


def open_request(page: Page, name: str):
    page.get_by_role("button", name=re.compile(name)).first.click()
    # phones show the open request instead of the list: look at what is visible
    expect(page.get_by_text(re.compile(r"REQ-\d{6}")).locator("visible=true").first).to_be_visible()


def test_pending_requests_are_listed_with_details_and_documents(page: Page):
    open_requests(page)
    open_request(page, "นายสมชาย ใจดี")
    expect(page.get_by_text("3-1017-00123-45-6")).to_be_visible()
    expect(page.get_by_text("ยืนยัน OTP แล้ว")).to_be_visible()
    expect(page.get_by_text("แนะนำจากชื่อ")).to_be_visible()  # account suggested from the name
    page.get_by_role("button", name=re.compile("บัตรประชาชน.jpg")).click()
    expect(dialog(page, "บัตรประชาชน.jpg").get_by_role("img")).to_be_visible()
    dialog(page, "บัตรประชาชน.jpg").get_by_role("button", name="ปิด").click()


def test_approve_binds_the_chosen_account(page: Page):
    open_requests(page)
    open_request(page, "นายสมชาย ใจดี")
    approve = page.get_by_role("button", name="อนุมัติ", exact=True)
    expect(approve).to_be_disabled()  # no account chosen yet

    fill(page.get_by_label("ผลการโทร"), "ยืนยันตัวตนผ่าน")
    page.get_by_role("button", name="บันทึกผลการโทร").click()
    expect(toast(page)).to_contain_text("บันทึกผลการโทรแล้ว")

    page.get_by_label("เลือกบัญชี 1001").check()
    approve.click()
    dialog(page, re.compile("อนุมัติ REQ-")).get_by_role("button", name="ยืนยันอนุมัติ").click()
    expect(toast(page)).to_contain_text("อนุมัติแล้ว")
    expect(page.get_by_text(re.compile("ผูกกับบัญชี 1001"))).to_be_visible()


def test_reject_needs_a_reason(page: Page):
    open_requests(page)
    open_request(page, "บริษัท ไทยพัฒนา")
    page.get_by_role("button", name="ปฏิเสธ", exact=True).click()
    d = dialog(page, re.compile("ปฏิเสธ REQ-"))
    confirm = d.get_by_role("button", name="ยืนยันปฏิเสธ")
    expect(confirm).to_be_disabled()
    d.get_by_role("button", name="เอกสารไม่ชัดเจนหรือไม่ครบ").click()
    confirm.click()
    expect(toast(page)).to_contain_text("ปฏิเสธคำขอแล้ว")
    expect(page.get_by_text(re.compile("ปฏิเสธ: เอกสารไม่ชัดเจน"))).to_be_visible()


def test_large_holder_needs_a_second_approver(page: Page, is_mobile: bool):
    # admin turns the rule on: 100,000 shares or more
    staff_login(page, "admin")
    page.goto("/admin/settings")
    ready(page)
    fill(page.get_by_label(re.compile("อนุมัติ 2 คน")), "100000")
    page.get_by_role("button", name="บันทึก", exact=True).click()
    expect(toast(page)).to_contain_text("บันทึกการตั้งค่าแล้ว")
    logout(page, is_mobile)

    open_requests(page, "staff1")
    open_request(page, "นายสมชาย ใจดี")
    page.get_by_label("เลือกบัญชี 1001").check()  # 120,000 shares
    expect(page.get_by_text("ต้องอนุมัติ 2 คน").last).to_be_visible()
    page.get_by_role("button", name="อนุมัติ (คนที่ 1)").click()
    dialog(page, re.compile("อนุมัติ REQ-")).get_by_role("button", name="ยืนยันอนุมัติ").click()
    expect(toast(page)).to_contain_text("รอเจ้าหน้าที่อีกคนอนุมัติ")
    expect(page.get_by_role("button", name="อนุมัติ (คนที่ 2)")).to_be_disabled()  # not the same person
    logout(page, is_mobile)

    open_requests(page, "staff2")
    open_request(page, "นายสมชาย ใจดี")
    page.get_by_role("button", name="อนุมัติ (คนที่ 2)").click()
    dialog(page, re.compile("อนุมัติ REQ-")).get_by_role("button", name="ยืนยันอนุมัติ").click()
    expect(toast(page)).to_contain_text("อนุมัติแล้ว")


def test_holder_request_reaches_omd_and_the_holder_sees_the_result(page: Page, is_mobile: bool):
    # holder sends a request with a document
    page.goto("/online/request")
    ready(page)
    fill(page.get_by_label(re.compile("เลขประจำตัวประชาชน")), UNKNOWN)
    page.get_by_role("button", name=re.compile("ตรวจสอบและขอ User")).click()
    page.get_by_label(re.compile("ชื่อ-นามสกุล")).fill("นายทดสอบ บอท")
    page.get_by_label("เบอร์มือถือ").fill("0899999999")
    page.locator("input[type=file]").set_input_files(PDF)
    page.get_by_role("button", name=re.compile("ส่งรหัส OTP เพื่อยืนยัน")).click()
    page.get_by_label("รหัส OTP 6 หลัก").fill(OTP)
    page.get_by_role("button", name="ยืนยันและส่งคำขอ").click()
    expect(page.get_by_role("heading", name="รอเจ้าหน้าที่ตรวจสอบ")).to_be_visible()
    ref = re.search(r"REQ-\d{6}", page.get_by_text(re.compile(r"REQ-\d{6}")).first.inner_text()).group(0)

    # OMD finds it and approves it against account 1003
    open_requests(page)
    open_request(page, "นายทดสอบ บอท")
    expect(page.get_by_text(ref).locator("visible=true").first).to_be_visible()
    page.get_by_role("button", name=re.compile("ค้นหาบัญชีอื่นในทะเบียน")).click()
    page.locator("#hp-q").fill("1003")
    page.get_by_role("button", name=re.compile(r"\b1003\b")).first.click()
    page.get_by_role("button", name="อนุมัติ", exact=True).click()
    dialog(page, re.compile("อนุมัติ REQ-")).get_by_role("button", name="ยืนยันอนุมัติ").click()
    expect(toast(page)).to_contain_text("อนุมัติแล้ว")
    logout(page, is_mobile)

    # back on the request page the holder checks the status
    page.goto("/online/request")
    ready(page)
    page.get_by_role("button", name=f"ตรวจสถานะคำขอ {ref}").click()
    expect(page.get_by_role("heading", name="เข้าสู่ระบบได้แล้ว")).to_be_visible()
    page.get_by_role("link", name=re.compile("ไปหน้าเข้าสู่ระบบ")).click()
    expect(page).to_have_url(url("/online"))


def test_viewer_cannot_see_requests(page: Page):
    staff_login(page, "viewer1")
    page.goto("/staff/requests")
    expect(page.get_by_text("ไม่มีสิทธิ์ดูคำขอ User")).to_be_visible()
