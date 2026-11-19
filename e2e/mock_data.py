"""Sample shareholders of the mock (frontend/lib/mock.ts seed). ID card = "1" + str(100000000000 + i*7919)[:12]."""

OTP = "123456"  # the mock accepts only this code
WRONG_OTP = "000000"


def id_card(account_id: int) -> str:
    i = account_id - 1001
    return "1" + str(100000000000 + i * 7919)[:12]


NEW_HOLDER = id_card(1014)  # ชาตรี เลิศล้ำ - not registered yet: goes through PDPA
NEW_HOLDER_2 = id_card(1015)  # อรุณี ศรีสวัสดิ์ - not registered yet (used by the decline test)
ONLINE_SELF = id_card(1009)  # สุรชัย แก้วมณี - already registered online, votes himself
ONLINE_STAFF = id_card(1010)  # นภา ทองดี - already registered online, chose "staff votes for me"
ONSITE = id_card(1001)  # สมชาย ใจดี - registered at the venue: online login refused

UNKNOWN_CONTACT = "9999999999990"  # request-a-User demo: ends in 0 -> found but no contact on file
UNKNOWN = "9999999999991"  # request-a-User demo: not in the register
