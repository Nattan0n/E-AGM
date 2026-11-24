"""Flow pages 2-4: log in with the ID card + OTP, first visit (PDPA), meeting room."""
import re

import pytest
from playwright.sync_api import Page, expect

from holder_pages import Login, Otp, Room, Welcome, fill, login_new_holder, login_registered_holder, url
from mock_data import NEW_HOLDER, NEW_HOLDER_2, ONLINE_SELF, ONLINE_STAFF, ONSITE, UNKNOWN, WRONG_OTP

pytestmark = pytest.mark.holder


def test_first_visit_goes_through_pdpa_to_the_room(page: Page):
    room = login_new_holder(page, NEW_HOLDER)
    expect(page.get_by_text("ชาตรี เลิศล้ำ").first).to_be_visible()
    expect(page.get_by_text(re.compile("ลงทะเบียนออนไลน์แล้ว"))).to_be_visible()
    # registered now: reopening the first-visit page sends the holder straight back to the room
    page.goto("/online/welcome")
    room.wait()


def test_otp_page_shows_masked_channels_and_id(page: Page):
    Login(page).open().submit(NEW_HOLDER)
    Otp(page).wait()
    expect(page.get_by_text(re.compile(r"เลขบัตร •+" + NEW_HOLDER[-4:]))).to_be_visible()
    expect(page.get_by_text(re.compile(r"X{4,}\d{4}")).first).to_be_visible()  # mobile number, masked (the channel chosen)
    expect(page.get_by_text(re.compile(r"รหัสหมดอายุใน"))).to_be_visible()


def test_holder_chooses_where_the_otp_goes(page: Page):
    login = Login(page).open()
    login.submit(NEW_HOLDER, via=None)
    # both channels are on file: nothing is sent until one is chosen
    expect(page.get_by_role("heading", name="รับรหัส OTP ทางไหน")).to_be_visible()
    expect(page.get_by_role("button", name=re.compile("ส่งทาง SMS"))).to_be_visible()
    expect(page.get_by_role("button", name=re.compile("ส่งทางอีเมล"))).to_be_visible()
    expect(page).to_have_url(url("/online"))
    page.get_by_role("button", name=re.compile("ส่งทางอีเมล")).click()
    Otp(page).wait()
    # (the login page stays mounted but hidden behind the OTP page: look at what is visible)
    expect(page.get_by_text(re.compile(r"\*{3,}@")).locator("visible=true")).to_have_count(1)  # e-mail, masked
    expect(page.get_by_text(re.compile(r"X{4,}\d{4}")).locator("visible=true")).to_have_count(1)  # the mobile appears only as the "send by SMS instead" offer
    expect(page.get_by_role("button", name=re.compile("ส่งทาง SMS .* แทน"))).to_be_visible()


def test_back_from_the_channel_question_returns_to_the_id_card(page: Page):
    Login(page).open().submit(NEW_HOLDER, via=None)
    expect(page.get_by_role("heading", name="รับรหัส OTP ทางไหน")).to_be_visible()
    page.get_by_role("button", name=re.compile("เปลี่ยนเลขบัตร")).click()
    expect(page.get_by_role("heading", name="เข้าสู่ระบบผู้ถือหุ้น")).to_be_visible()


def test_otp_can_be_sent_the_other_way(page: Page):
    page.clock.install()  # the new code is allowed after a minute: skip the wait
    Login(page).open().submit(NEW_HOLDER, via="sms")
    Otp(page).wait()
    page.clock.fast_forward("01:05")
    page.get_by_role("button", name=re.compile("ส่งทางอีเมล .* แทน")).click()
    expect(page.get_by_role("status").filter(has_text="ส่งรหัส OTP ใหม่แล้ว")).to_be_visible()
    expect(page.get_by_text(re.compile(r"\*{3,}@")).first).to_be_visible()  # now the e-mail got the code
    expect(page.get_by_role("button", name=re.compile("ส่งทาง SMS .* แทน"))).to_be_visible()  # and SMS is the alternative


def test_pdpa_must_be_accepted_before_choosing_a_vote_method(page: Page):
    Login(page).open().submit(NEW_HOLDER)
    Otp(page).wait().enter()
    w = Welcome(page).wait()
    expect(w.self_vote).to_be_disabled()
    expect(w.submit).to_be_disabled()
    w.consent.check()
    expect(w.self_vote).to_be_enabled()
    expect(w.submit).to_be_disabled()  # still needs a vote method
    w.staff_vote.click()
    expect(w.submit).to_be_enabled()


def test_declining_pdpa_logs_out_with_a_notice(page: Page):
    Login(page).open().submit(NEW_HOLDER_2)
    Otp(page).wait().enter()
    w = Welcome(page).wait()
    w.decline.click()
    dialog = page.get_by_role("dialog", name="ไม่ยอมรับ PDPA?")
    expect(dialog).to_be_visible()
    dialog.get_by_role("button", name="ไม่ยอมรับ และออกจากระบบ").click()
    expect(page).to_have_url(url("/online"))
    expect(page.get_by_text(re.compile("ไม่ได้ยอมรับ PDPA"))).to_be_visible()
    # the login page is usable again (it used to come back stuck on "กำลังตรวจสอบ..." from the first submit)
    expect(page.get_by_role("button", name="กำลังตรวจสอบ...")).to_have_count(0)
    # the session is gone: the meeting room sends back to the login
    page.goto("/online/waiting")
    expect(page).to_have_url(url("/online"))


def test_registered_holder_skips_pdpa(page: Page):
    login_registered_holder(page, ONLINE_SELF)
    expect(page.get_by_text("สุรชัย แก้วมณี").first).to_be_visible()


def test_staff_mode_holder_can_switch_to_self(page: Page):
    login_registered_holder(page, ONLINE_STAFF)
    switch = page.get_by_role("button", name="เปลี่ยนเป็นลงคะแนนด้วยตนเอง")
    expect(page.get_by_role("heading", name="เจ้าหน้าที่จะลงคะแนนแทนท่าน")).to_be_visible()
    switch.click()
    expect(switch).to_be_hidden()
    Room(page).enter_vote()
    expect(page).to_have_url(url("/online/vote"))


def test_unknown_id_card_is_refused(page: Page):
    login = Login(page).open()
    login.submit(UNKNOWN)
    expect(login.error).to_contain_text("ไม่สามารถเข้าสู่ระบบด้วยเลขบัตรนี้ได้")
    expect(page).to_have_url(url("/online"))


def test_short_id_card_cannot_be_submitted(page: Page):
    login = Login(page).open()
    fill(login.id_card, "123")
    expect(login.request_otp).to_be_disabled()


def test_holder_registered_onsite_cannot_log_in_online(page: Page):
    login = Login(page).open()
    login.submit(ONSITE)
    expect(login.error).to_contain_text("Onsite")


def test_wrong_otp_shows_an_error_and_stays(page: Page):
    Login(page).open().submit(NEW_HOLDER)
    otp = Otp(page).wait()
    otp.enter(WRONG_OTP)
    expect(otp.error).to_contain_text("OTP ไม่ถูกต้อง")
    expect(page).to_have_url(url("/online/otp"))


def test_meeting_pages_need_a_session(page: Page):
    for path in ("/online/waiting", "/online/vote", "/online/confirm", "/online/welcome"):
        page.goto(path)
        expect(page).to_have_url(url("/online"))


def test_request_user_link_from_login(page: Page):
    Login(page).open()
    page.get_by_role("link", name="ขอ User").click()
    expect(page).to_have_url(url("/online/request"))
