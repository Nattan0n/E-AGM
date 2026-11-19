"""Flow page 1: request a User (ID card -> already usable | add contact + OTP | documents + OTP -> OMD queue)."""
import re

import pytest
from playwright.sync_api import Page, expect

from holder_pages import alerts, fill, ready, url
from mock_data import NEW_HOLDER, OTP, UNKNOWN, UNKNOWN_CONTACT, WRONG_OTP

pytestmark = pytest.mark.holder

PDF = {"name": "idcard.pdf", "mimeType": "application/pdf", "buffer": b"%PDF-1.4\n%mock\n"}


def start(page: Page, id_card: str):
    page.goto("/online/request")
    expect(page.get_by_role("heading", name="ขอ User เข้าประชุม")).to_be_visible()
    ready(page)
    fill(page.get_by_label(re.compile("เลขประจำตัวประชาชน")), id_card)
    page.get_by_role("button", name=re.compile("ตรวจสอบและขอ User")).click()


def test_holder_with_contact_is_told_to_log_in(page: Page):
    start(page, NEW_HOLDER)
    expect(page.get_by_role("heading", name="ท่านเข้าสู่ระบบได้แล้ว")).to_be_visible()
    expect(page.get_by_text(re.compile("ไม่ต้องขอ User เพิ่ม"))).to_be_visible()
    page.get_by_role("link", name=re.compile("ไปหน้าเข้าสู่ระบบ")).click()
    expect(page).to_have_url(url("/online"))


def test_found_without_contact_adds_one_and_goes_to_omd(page: Page):
    start(page, UNKNOWN_CONTACT)
    expect(page.get_by_role("heading", name="เพิ่มช่องทางรับ User")).to_be_visible()
    send = page.get_by_role("button", name=re.compile("ส่งรหัส OTP เพื่อยืนยัน"))
    send.click()
    expect(alerts(page)).to_contain_text("อย่างน้อย 1 ช่องทาง")

    page.get_by_label("เบอร์มือถือ").fill("0899999999")
    send.click()
    expect(page.get_by_role("heading", name="ยืนยันช่องทางติดต่อ")).to_be_visible()
    page.get_by_label("รหัส OTP 6 หลัก").fill(OTP)
    page.get_by_role("button", name="ยืนยันและส่งคำขอ").click()
    expect(page.get_by_role("heading", name="รอเจ้าหน้าที่ตรวจสอบ")).to_be_visible()
    expect(page.get_by_text(re.compile(r"REQ-\d+"))).to_be_visible()
    expect(page.get_by_text(re.compile("ข้อมูลกับทะเบียนผู้ถือหุ้น"))).to_be_visible()


def test_not_found_needs_name_and_documents(page: Page):
    start(page, UNKNOWN)
    expect(page.get_by_role("heading", name="ขอลงทะเบียนผู้ถือหุ้น")).to_be_visible()
    send = page.get_by_role("button", name=re.compile("ส่งรหัส OTP เพื่อยืนยัน"))

    page.get_by_label("เบอร์มือถือ").fill("0899999999")
    send.click()
    expect(alerts(page)).to_contain_text("ชื่อ-นามสกุล")
    page.get_by_label(re.compile("ชื่อ-นามสกุล")).fill("นายทดสอบ บอท")
    send.click()
    expect(alerts(page)).to_contain_text("แนบเอกสาร")

    # e-mail chosen for the OTP but not filled
    page.get_by_role("radio", name="อีเมล").click()
    page.locator("input[type=file]").set_input_files(PDF)
    expect(page.get_by_text("idcard.pdf")).to_be_visible()
    send.click()
    expect(alerts(page)).to_contain_text("ยังไม่ได้กรอกอีเมล")
    page.get_by_label("อีเมล", exact=True).fill("bot@example.com")
    send.click()

    expect(page.get_by_role("heading", name="ยืนยันช่องทางติดต่อ")).to_be_visible()
    otp = page.get_by_label("รหัส OTP 6 หลัก")
    otp.fill(WRONG_OTP)
    page.get_by_role("button", name="ยืนยันและส่งคำขอ").click()
    expect(alerts(page)).to_contain_text("OTP ไม่ถูกต้อง")
    otp.fill(OTP)
    page.get_by_role("button", name="ยืนยันและส่งคำขอ").click()
    expect(page.get_by_role("heading", name="รอเจ้าหน้าที่ตรวจสอบ")).to_be_visible()
    expect(page.get_by_text(re.compile("เอกสารกับนายทะเบียนหลักทรัพย์"))).to_be_visible()


def test_wrong_file_type_is_rejected(page: Page):
    start(page, UNKNOWN)
    page.locator("input[type=file]").set_input_files({"name": "virus.exe", "mimeType": "application/x-msdownload", "buffer": b"MZ"})
    expect(alerts(page)).to_contain_text("PDF, JPG หรือ PNG")
    expect(page.get_by_role("button", name="ลบ virus.exe")).to_have_count(0)  # not added to the file list


def test_short_id_card_is_rejected(page: Page):
    start(page, "123")
    expect(alerts(page)).to_contain_text("ให้ถูกต้อง")
