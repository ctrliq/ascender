package pystr

import (
	"strconv"
	"strings"
	"sync"
	"unicode"

	"golang.org/x/text/unicode/runenames"
)

// IsIdentifier is str.isidentifier(): XID_Start or "_", then XID_Continue
// (approximated from the general categories Go carries).
func IsIdentifier(s string) bool {
	if s == "" {
		return false
	}
	for i, r := range []rune(s) {
		start := r == '_' || unicode.IsLetter(r) || unicode.Is(unicode.Nl, r) || unicode.Is(unicode.Other_ID_Start, r)
		if i == 0 {
			if !start {
				return false
			}
			continue
		}
		if !start && !unicode.In(r, unicode.Mn, unicode.Mc, unicode.Nd, unicode.Pc, unicode.Other_ID_Continue) {
			return false
		}
	}
	return true
}

// IsAlpha is str.isalpha().
func IsAlpha(r []rune) bool {
	for _, c := range r {
		if !unicode.IsLetter(c) {
			return false
		}
	}
	return len(r) > 0
}

// IsPrintable is str.isprintable() for one character: Go's IsPrint has the
// same exclusions (other, separators but the space, unassigned).
func IsPrintable(r rune) bool { return unicode.IsPrint(r) }

var (
	namesOnce sync.Once
	names     map[string]rune
)

// LookupName is unicodedata.lookup for \N{...}: names are matched without
// regard to case, Hangul syllable and CJK unified ideograph names are
// computed, as CPython's are. Name aliases and named sequences (which
// re refuses anyway) are not known.
func LookupName(name string) (rune, bool) {
	upper := strings.ToUpper(name)
	if rest, ok := strings.CutPrefix(upper, "HANGUL SYLLABLE "); ok {
		return hangulSyllable(rest)
	}
	if strings.HasPrefix(upper, "CJK UNIFIED IDEOGRAPH-") {
		hex := name[len("CJK UNIFIED IDEOGRAPH-"):]
		if len(hex) != 4 && len(hex) != 5 {
			return 0, false
		}
		for _, c := range hex {
			if !(c >= '0' && c <= '9' || c >= 'A' && c <= 'F') {
				return 0, false
			}
		}
		v, _ := strconv.ParseInt(hex, 16, 32)
		r := rune(v)
		if unicode.Is(unicode.Unified_Ideograph, r) && unicode.Is(unicode.Han, r) {
			return r, true
		}
		return 0, false
	}
	namesOnce.Do(func() {
		names = make(map[string]rune, 40000)
		for r := rune(0); r <= unicode.MaxRune; r++ {
			if n := runenames.Name(r); n != "" && n[0] != '<' {
				names[n] = r
			}
		}
	})
	r, ok := names[upper]
	return r, ok
}

var (
	hangulL = []string{"G", "GG", "N", "D", "DD", "R", "M", "B", "BB", "S", "SS", "", "J", "JJ", "C", "K", "T", "P", "H"}
	hangulV = []string{"A", "AE", "YA", "YAE", "EO", "E", "YEO", "YE", "O", "WA", "WAE", "OE", "YO", "U", "WEO", "WE", "WI", "YU", "EU", "YI", "I"}
	hangulT = []string{"", "G", "GG", "GS", "N", "NJ", "NH", "D", "L", "LG", "LM", "LB", "LS", "LT", "LP", "LH", "M", "B", "BS", "S", "SS", "NG", "J", "C", "K", "T", "P", "H"}
)

// longestJamo is find_syllable: the longest short name s starts with.
func longestJamo(s string, table []string) (int, int) {
	best, length := -1, -1
	for i, j := range table {
		if len(j) > length && strings.HasPrefix(s, j) {
			best, length = i, len(j)
		}
	}
	return best, length
}

func hangulSyllable(s string) (rune, bool) {
	l, n := longestJamo(s, hangulL)
	if l < 0 {
		return 0, false
	}
	s = s[n:]
	v, n := longestJamo(s, hangulV)
	if v < 0 {
		return 0, false
	}
	s = s[n:]
	t, n := longestJamo(s, hangulT)
	if t < 0 || n != len(s) {
		return 0, false
	}
	return rune(0xAC00 + (l*21+v)*28 + t), true
}
