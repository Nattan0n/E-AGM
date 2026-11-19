"""Shared fixtures for the E-AGM end-to-end bot.

Every test gets a fresh browser context, so the mock data (kept in sessionStorage by frontend/lib/mock.ts) starts from
the same seed each time. Each test runs twice: phone layout and desktop layout (they render different components).
"""
import pytest
from playwright.sync_api import expect

expect.set_options(timeout=10_000)  # Vercel cold start + client-side navigation

VIEWPORTS = {
    "mobile": {"viewport": {"width": 390, "height": 844}, "is_mobile": True, "has_touch": True, "device_scale_factor": 2},
    "desktop": {"viewport": {"width": 1366, "height": 860}},
}


@pytest.fixture(params=list(VIEWPORTS), ids=list(VIEWPORTS))
def browser_context_args(browser_context_args, request):
    return {**browser_context_args, **VIEWPORTS[request.param], "locale": "th-TH", "timezone_id": "Asia/Bangkok"}


HIDE_DEV_OVERLAY = """
document.addEventListener('DOMContentLoaded', () => {
  const s = document.createElement('style');
  s.textContent = 'nextjs-portal { display: none !important; }';
  document.head.appendChild(s);
});
"""


@pytest.fixture
def context(context):
    # `next dev` floats its badge over the bottom-right corner and swallows clicks there (not present on Vercel)
    context.add_init_script(HIDE_DEV_OVERLAY)
    return context


@pytest.fixture
def is_mobile(browser_context_args) -> bool:
    return bool(browser_context_args.get("is_mobile"))
