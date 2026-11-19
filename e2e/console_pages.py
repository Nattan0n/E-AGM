"""Helpers for the staff / admin console (drawio pages 6-16).

Mock login (frontend/lib/mock.ts): any password; the username decides the role - "admin..." = admin, "viewer..." = viewer,
anything else = staff. Sample holders: 1001-1008 registered onsite (1001-1006 already voted on agenda 3, 1002 has no
voting right on agenda 3 and 4, 1003 is a proxy), 1009-1013 online (1010 chose "staff votes for me"), 1014-1020 not
registered. Agendas: 1 closed, 2 closed (info), 3 open, 4-6 pending.
"""
import re

from playwright.sync_api import Page, expect

from holder_pages import alerts, fill, ready, url  # noqa: F401  (re-exported for the console tests)


def staff_login(page: Page, username: str = "staff1") -> Page:
    page.goto("/staff/login")
    ready(page)
    fill(page.get_by_label("ชื่อผู้ใช้"), username)
    fill(page.get_by_label("รหัสผ่าน", exact=True), "demo-password")
    page.get_by_role("button", name="เข้าสู่ระบบ", exact=True).click()
    expect(page).to_have_url(url("/admin") if "admin" in username else url("/staff"))
    return page


def heading(page: Page, text: str):
    """Page title. Desktop: the h1. Phones: admin pages keep the h1, staff pages show no title at all (the bottom dock
    marks the page), so there the page counts as open once its main content is shown."""
    if (page.viewport_size or {}).get("width", 1366) < 1024:
        return page.get_by_role("heading", name=text, level=1).or_(page.get_by_role("main")).first
    return page.get_by_role("heading", name=text, level=1)


def toast(page: Page):
    """Success / info toasts of both consoles (role=status)."""
    return page.get_by_role("status").filter(has_not_text="กำลังโหลด")


def dialog(page: Page, title: str):
    return page.get_by_role("dialog", name=title)


def pick_holder(page: Page, account_id: str):
    """HolderPicker: type the account id, click the matching row."""
    page.locator("#hp-q").fill(account_id)
    page.get_by_role("button", name=re.compile(rf"\b{account_id}\b")).first.click()


def choose(page: Page, combobox_label: str, option: str | re.Pattern):
    """The themed <Select> is a combobox button + listbox."""
    page.get_by_role("combobox", name=combobox_label).click()
    page.get_by_role("option", name=option).click()


def logout(page: Page, is_mobile: bool):
    if is_mobile:
        page.get_by_role("button", name="เมนู").click()
    page.get_by_role("button", name="ออกจากระบบ").filter(visible=True).first.click()
    expect(page).to_have_url(re.compile(r"/$"))


def search_row_action(page: Page, account_id: str, action: str, is_mobile: bool):
    """Staff search page: phones show an expandable list, desktop a table with the actions in the row."""
    page.get_by_label("ค้นหา", exact=True).fill(account_id)
    if is_mobile:
        page.get_by_role("button", name=re.compile(rf"\b{account_id}\b")).first.click()
        page.get_by_role("button", name=action).or_(page.get_by_role("link", name=action)).first.click()
    else:
        row = page.get_by_role("row").filter(has_text=account_id)
        row.get_by_role("button", name=action).or_(row.get_by_role("link", name=action)).first.click()
