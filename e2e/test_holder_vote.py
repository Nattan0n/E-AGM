"""Flow page 5: vote, receipt, results, logout."""
import re

import pytest
from playwright.sync_api import Page, expect

from holder_pages import Vote, login_new_holder, url
from mock_data import NEW_HOLDER

pytestmark = pytest.mark.holder


def test_vote_receipt_results_logout(page: Page):
    room = login_new_holder(page, NEW_HOLDER)
    room.enter_vote()
    vote = Vote(page).wait()

    # agenda 3 is the open one in the mock; it is selected automatically
    expect(page.get_by_text("วาระที่ 3", exact=True)).to_be_visible()
    vote.cast("เห็นด้วย")
    expect(page.get_by_role("status")).to_contain_text("บันทึกคะแนนวาระ 3 แล้ว")
    expect(page.get_by_text(re.compile("ลงคะแนนแล้ว: เห็นด้วย"))).to_be_visible()
    expect(vote.choice("ไม่เห็นด้วย")).to_be_disabled()  # cannot change after confirming

    # closed / pending agendas cannot be voted
    page.get_by_role("tab", name=re.compile("วาระ 4")).click()
    expect(page.get_by_text("ยังไม่เปิดลงคะแนน")).to_be_visible()
    page.get_by_role("tab", name=re.compile("วาระ 2")).click()
    expect(page.get_by_text(re.compile("รับทราบ - ไม่ต้องลงคะแนน"))).to_be_visible()

    # receipt
    page.get_by_role("link", name=re.compile("ดูสรุปและใบยืนยัน")).click()
    expect(page).to_have_url(url("/online/confirm"))
    expect(page.get_by_role("heading", name="บันทึกการลงคะแนนเรียบร้อยแล้ว")).to_be_visible()
    expect(page.get_by_text("หมายเลขอ้างอิง")).to_be_visible()
    expect(page.get_by_text(re.compile("ยังไม่เผยแพร่ผลมติ"))).to_be_visible()  # admin has not published

    # results page (not published in the mock)
    page.goto("/online/results")
    expect(page.get_by_role("heading", name="ยังไม่เผยแพร่ผลมติ")).to_be_visible()

    # logout ends the session
    page.goto("/online/confirm")
    page.get_by_role("button", name="ออกจากระบบ").filter(visible=True).last.click()
    expect(page).to_have_url(re.compile(r"/$"))
    page.goto("/online/vote")
    expect(page).to_have_url(url("/online"))


def test_cancel_in_the_confirm_dialog_does_not_vote(page: Page):
    login_new_holder(page, NEW_HOLDER).enter_vote()
    vote = Vote(page).wait()
    vote.choice("งดออกเสียง").click()
    dialog = page.get_by_role("dialog", name="ยืนยันการลงคะแนน")
    dialog.get_by_role("button", name="ยกเลิก").click()
    expect(dialog).to_be_hidden()
    expect(vote.choice("งดออกเสียง")).to_be_enabled()
    expect(page.get_by_text(re.compile("ลงคะแนนแล้ว:"))).to_have_count(0)
