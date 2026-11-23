package i18n

import (
	"math"
	"strconv"
	"strings"
)

// pluralCategory is the CLDR plural category of n in a language, the
// answer Intl.PluralRules gives Lingui in the browser.
func pluralCategory(lang string, n float64, ordinal bool) string {
	abs := math.Abs(n)
	integer := abs == math.Trunc(abs)
	i := int64(math.Trunc(abs))
	if ordinal {
		if !integer {
			return "other"
		}
		switch lang {
		case "en":
			switch {
			case i%10 == 1 && i%100 != 11:
				return "one"
			case i%10 == 2 && i%100 != 12:
				return "two"
			case i%10 == 3 && i%100 != 13:
				return "few"
			}
		case "fr":
			if i == 1 {
				return "one"
			}
		case "hi":
			switch i {
			case 1:
				return "one"
			case 2, 3:
				return "two"
			case 4:
				return "few"
			case 6:
				return "many"
			}
		}
		return "other"
	}
	switch lang {
	case "en", "nl":
		if integer && i == 1 {
			return "one"
		}
	case "es":
		switch {
		case abs == 1:
			return "one"
		case integer && i != 0 && i%1000000 == 0:
			return "many"
		}
	case "fr":
		switch {
		case i == 0 || i == 1:
			return "one"
		case integer && i%1000000 == 0:
			return "many"
		}
	case "hi":
		if i == 0 || abs == 1 {
			return "one"
		}
	case "ar":
		if !integer {
			return "other"
		}
		switch m := i % 100; {
		case i == 0:
			return "zero"
		case i == 1:
			return "one"
		case i == 2:
			return "two"
		case m >= 3 && m <= 10:
			return "few"
		case m >= 11 && m <= 99:
			return "many"
		}
	}
	return "other"
}

// formatNumber writes n the way Intl.NumberFormat(lang) does for the
// numbers plurals count: grouped digits, Latin digits for every language
// (ICU's default for Arabic too).
func formatNumber(lang string, n float64) string {
	neg := n < 0
	s := strconv.FormatFloat(math.Abs(n), 'f', -1, 64)
	intPart, frac, hasFrac := strings.Cut(s, ".")
	group, dec := ",", "."
	minGrouping := 1
	switch lang {
	case "fr":
		group, dec = " ", ","
	case "es":
		group, dec = ".", ","
		minGrouping = 2 // 1234, but 12.345
	case "nl":
		group, dec = ".", ","
	}
	var out string
	switch {
	case len(intPart) <= 3 || (minGrouping == 2 && len(intPart) <= 4):
		out = intPart
	case lang == "hi":
		// Indian grouping: the last three digits, then pairs.
		head, tail := intPart[:len(intPart)-3], intPart[len(intPart)-3:]
		var parts []string
		for len(head) > 2 {
			parts = append([]string{head[len(head)-2:]}, parts...)
			head = head[:len(head)-2]
		}
		parts = append([]string{head}, parts...)
		out = strings.Join(append(parts, tail), group)
	default:
		var parts []string
		for len(intPart) > 3 {
			parts = append([]string{intPart[len(intPart)-3:]}, parts...)
			intPart = intPart[:len(intPart)-3]
		}
		out = strings.Join(append([]string{intPart}, parts...), group)
	}
	if hasFrac {
		out += dec + frac
	}
	if neg {
		out = "-" + out
		if lang == "ar" {
			out = "\u200e" + out // ICU keeps the sign left of the digits
		}
	}
	return out
}
