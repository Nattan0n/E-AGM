package api

import "testing"

func TestCSVSafe(t *testing.T) {
	for _, in := range []string{"=1+1", "+1", "-1", "@x", "\tx", "\rx"} {
		if got := csvSafe(in); got != "'"+in {
			t.Errorf("csvSafe(%q) = %q, want it prefixed with a quote", in, got)
		}
	}
	if csvSafe("ปกติ") != "ปกติ" {
		t.Error("plain text must be unchanged")
	}
}

func TestMaskID(t *testing.T) {
	if got := maskID("1234567890123"); got != "xxxxxxxxx0123" {
		t.Errorf("maskID = %q", got)
	}
}

func TestTermIDRe(t *testing.T) {
	for _, ok := range []string{"1", "12", "5.1", "5.12"} {
		if !termIDRe.MatchString(ok) {
			t.Errorf("%q should be valid", ok)
		}
	}
	for _, bad := range []string{"", "a", "5.", "5.123", "1234", "5..1"} {
		if termIDRe.MatchString(bad) {
			t.Errorf("%q should be invalid", bad)
		}
	}
}
