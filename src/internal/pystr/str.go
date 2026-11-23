// Package pystr holds Python's str and number formatting rules the ports of
// Python code (internal/pyre, internal/jinja) share.
package pystr

import (
	"math"
	"strconv"
	"strings"
)

// IsSpace is str.isspace() for one character: _PyUnicode_IsWhitespace,
// bidirectional types WS, B and S and the Zs category.
func IsSpace(r rune) bool {
	switch {
	case r >= 0x09 && r <= 0x0D, r >= 0x1C && r <= 0x20, r == 0x85, r == 0xA0, r == 0x1680,
		r >= 0x2000 && r <= 0x200A, r == 0x2028, r == 0x2029, r == 0x202F, r == 0x205F, r == 0x3000:
		return true
	}
	return false
}

// TrimRightSpace is str.rstrip() without arguments.
func TrimRightSpace(s string) string { return strings.TrimRightFunc(s, IsSpace) }

// TrimSpace is str.strip() without arguments.
func TrimSpace(s string) string { return strings.TrimFunc(s, IsSpace) }

// FloatRepr is repr() (and str()) of a float: the shortest digits that
// round-trip, in fixed notation from 1e-4 up to 1e16 (with ".0" when there
// is no fraction) and exponential outside it.
func FloatRepr(f float64) string {
	switch {
	case math.IsInf(f, 1):
		return "inf"
	case math.IsInf(f, -1):
		return "-inf"
	case math.IsNaN(f):
		return "nan"
	}
	e := strconv.FormatFloat(f, 'e', -1, 64) // -d.ddde±xx
	mant, expStr, _ := strings.Cut(e, "e")
	exp, _ := strconv.Atoi(expStr)
	neg := strings.HasPrefix(mant, "-")
	mant = strings.TrimPrefix(mant, "-")
	digits := strings.Replace(mant, ".", "", 1)
	sign := ""
	if neg {
		sign = "-"
	}
	decpt := exp + 1
	if decpt <= -4 || decpt > 16 {
		m := digits[:1]
		if len(digits) > 1 {
			m += "." + digits[1:]
		}
		es := "+"
		if exp < 0 {
			es, exp = "-", -exp
		}
		return sign + m + "e" + es + leftPad(strconv.Itoa(exp), 2)
	}
	switch {
	case decpt <= 0:
		return sign + "0." + strings.Repeat("0", -decpt) + digits
	case decpt >= len(digits):
		return sign + digits + strings.Repeat("0", decpt-len(digits)) + ".0"
	default:
		return sign + digits[:decpt] + "." + digits[decpt:]
	}
}

func leftPad(s string, n int) string {
	for len(s) < n {
		s = "0" + s
	}
	return s
}
