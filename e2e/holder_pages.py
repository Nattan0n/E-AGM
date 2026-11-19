"""Page helpers for the shareholder screens: tests describe the flow, these know how to click it.

Locators use the accessible names / labels the user sees, so a test fails when the screen a holder would read changes.
"""
import re

from playwright.sync_api import Page, expect

from mock_data import OTP


def alerts(page: Page):
    """Error boxes of the page (Next.js also renders an empty role=alert route announcer - skip it)."""
    return page.locator("[role=alert]:not(#__next-route-announcer__)")


def fill(locator, value: str):
    """Type into a React input and make sure it stuck: text typed before the page has hydrated is reset by React."""
    for _ in range(5):
        locator.fill(value)
        try:
            expect(locator).to_have_value(value, timeout=1500)
            locator.page.wait_for_timeout(150)
            if locator.input_value() == value:
                return
        except AssertionError:
            pass
    expect(locator).to_have_value(value)


def ready(page: Page):
    page.wait_for_load_state("networkidle")


def url(path: str):
    return re.compile(re.escape(path) + r"/?(\?.*)?$")


class Login:
    def __init__(self, page: Page):
        self.page = page
        self.id_card = page.get_by_label("เลขประจำตัวประชาชน / Passport / เลขนิติบุคคล")
        self.request_otp = page.get_by_role("button", name="ขอรหัส OTP")
        self.error = alerts(page)

    def open(self):
        self.page.goto("/online")
        expect(self.page.get_by_role("heading", name="เข้าสู่ระบบผู้ถือหุ้น")).to_be_visible()
        ready(self.page)
        return self

    def submit(self, id_card: str):
        fill(self.id_card, id_card)
        self.request_otp.click()


class Otp:
    def __init__(self, page: Page):
        self.page = page
        self.first_box = page.get_by_label("หลักที่ 1")
        self.error = alerts(page)

    def wait(self):
        expect(self.page).to_have_url(url("/online/otp"))
        expect(self.page.get_by_role("heading", name="ยืนยันรหัส OTP")).to_be_visible()
        return self

    def enter(self, code: str = OTP):
        # typing into the first box spreads the digits and submits on the 6th
        self.first_box.fill(code)


class Welcome:
    """Flow page 3: PDPA + vote method, first visit of the year."""

    def __init__(self, page: Page):
        self.page = page
        self.consent = page.get_by_role("checkbox")
        self.self_vote = page.get_by_role("radio", name=re.compile("ลงคะแนนออนไลน์ด้วยตนเอง"))
        self.staff_vote = page.get_by_role("radio", name=re.compile("ให้เจ้าหน้าที่ลงคะแนนแทน"))
        self.submit = page.get_by_role("button", name=re.compile("ยืนยันและเข้าห้องประชุม"))
        self.decline = page.get_by_role("button", name="ไม่ยอมรับ และออกจากระบบ")

    def wait(self):
        expect(self.page).to_have_url(url("/online/welcome"))
        expect(self.page.get_by_role("heading", name="ยืนยันข้อมูลก่อนเข้าประชุม")).to_be_visible()
        return self

    def accept(self, mode: str = "self"):
        self.consent.check()
        (self.self_vote if mode == "self" else self.staff_vote).click()
        self.submit.click()


class Room:
    def __init__(self, page: Page):
        self.page = page

    def wait(self):
        expect(self.page).to_have_url(url("/online/waiting"))
        expect(self.page.get_by_text("วาระการประชุม").first).to_be_visible()
        return self

    def enter_vote(self):
        # phones: sticky bottom button; desktop: button in the status card
        self.page.get_by_role("link", name=re.compile("เข้าสู่การลงคะแนน")).filter(visible=True).first.click()


class Vote:
    def __init__(self, page: Page):
        self.page = page

    def wait(self):
        expect(self.page).to_have_url(url("/online/vote"))
        expect(self.page.get_by_role("tablist", name="วาระ")).to_be_visible()
        return self

    def choice(self, label: str):
        return self.page.get_by_role("button", name=label, exact=True)

    def cast(self, label: str):
        self.choice(label).click()
        dialog = self.page.get_by_role("dialog", name="ยืนยันการลงคะแนน")
        expect(dialog).to_contain_text(label)
        dialog.get_by_role("button", name="ยืนยัน", exact=True).click()
        expect(dialog).to_be_hidden()


def login_new_holder(page: Page, id_card: str, mode: str = "self"):
    """User -> OTP -> PDPA -> meeting room."""
    Login(page).open().submit(id_card)
    Otp(page).wait().enter()
    Welcome(page).wait().accept(mode)
    return Room(page).wait()


def login_registered_holder(page: Page, id_card: str):
    """User -> OTP -> meeting room (PDPA was already accepted this year)."""
    Login(page).open().submit(id_card)
    Otp(page).wait().enter()
    return Room(page).wait()
