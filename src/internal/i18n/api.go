package i18n

import (
	"net/http"
	"regexp"
	"strconv"
	"strings"
)

// The API side: the old API was a Django application whose LocaleMiddleware
// picked a language per request (get_language_from_request) and whose
// messages went through gettext. Its catalogs (locales/<lang>/api.json)
// hold Python format strings: %-style ("%(name)s", "%s") or str.format
// style ("{name}", "{}"), depending on how the old code filled them in.

// APILanguages is the old API's settings.LANGUAGES, in its order: the
// languages LocaleMiddleware could activate.
var APILanguages = []string{"en-us", "en", "ar", "es", "fr", "hi", "ja", "ko", "nl", "zh"}

// APIDefault is the old API's LANGUAGE_CODE.
const APIDefault = "en-us"

// LanguageCookie is Django's LANGUAGE_COOKIE_NAME, which the old UI set
// to its language so the API answered in it.
const LanguageCookie = "django_language"

// languageCodeMaxLength is Django's LANGUAGE_CODE_MAX_LENGTH.
const languageCodeMaxLength = 500

var (
	languageCodeRe   = regexp.MustCompile(`(?i)^[a-z]{1,8}(?:-[a-z0-9]{1,8})*(?:@[a-z0-9]{1,20})?$`)
	acceptLanguageRe = regexp.MustCompile(`([A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*|\*)(?:\s*;\s*q=(0(?:\.[0-9]{0,3})?|1(?:\.0{0,3})?))?(?:\s*,\s*|$)`)
)

// langFallbacks are the "fallback" entries of Django's LANG_INFO.
var langFallbacks = map[string][]string{
	"zh-cn": {"zh-hans"}, "zh-hk": {"zh-hant"}, "zh-mo": {"zh-hant"},
	"zh-my": {"zh-hans"}, "zh-sg": {"zh-hans"}, "zh-tw": {"zh-hant"},
}

func apiLanguageListed(code string) bool {
	for _, l := range APILanguages {
		if l == code {
			return true
		}
	}
	return false
}

// checkForLanguage is Django's check_for_language for the codes it is
// asked about here (ones whose lower case is in APILanguages, each of
// which has a catalog).
func checkForLanguage(code string) bool {
	return len(code) <= languageCodeMaxLength && languageCodeRe.MatchString(code)
}

// supportedVariant is Django's get_supported_language_variant (not
// strict): the listed language a code asks for, possibly a more generic
// one, or "" (LookupError).
func supportedVariant(code string) string {
	if code == "" {
		return ""
	}
	if len(code) > languageCodeMaxLength {
		i := strings.LastIndex(code[:languageCodeMaxLength], "-")
		if i <= 0 {
			return ""
		}
		code = code[:i]
	}
	possible := []string{code}
	possible = append(possible, langFallbacks[code]...)
	for i := len(code); ; {
		i = strings.LastIndex(code[:i], "-")
		if i < 0 {
			break
		}
		possible = append(possible, code[:i])
	}
	generic := possible[len(possible)-1]
	for _, c := range possible {
		if apiLanguageListed(strings.ToLower(c)) && checkForLanguage(c) {
			return c
		}
	}
	for _, s := range APILanguages {
		if strings.HasPrefix(s, generic+"-") {
			return s
		}
	}
	return ""
}

type acceptLang struct {
	lang string
	q    float64
}

// parseAcceptLanguage is Django's parse_accept_lang_header: the header's
// languages, lower-cased, by descending q (stably); none when any part is
// malformed.
func parseAcceptLanguage(s string) []acceptLang {
	if len(s) > languageCodeMaxLength {
		i := strings.LastIndex(s[:languageCodeMaxLength], ",")
		if i <= 0 {
			return nil
		}
		s = s[:i]
	}
	s = strings.ToLower(s)
	var out []acceptLang
	pos := 0
	for _, m := range acceptLanguageRe.FindAllStringSubmatchIndex(s, -1) {
		if m[0] != pos {
			// Text between matches: re.split's non-empty "first".
			return nil
		}
		pos = m[1]
		q := 1.0
		if m[4] >= 0 {
			q, _ = strconv.ParseFloat(s[m[4]:m[5]], 64)
		}
		out = append(out, acceptLang{s[m[2]:m[3]], q})
	}
	if pos != len(s) {
		return nil
	}
	// A stable sort by descending q, as Python's list.sort.
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && out[j].q > out[j-1].q; j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
	return out
}

// RequestLanguage is the language the old API answered a request in, as
// its Content-Language header named it: Django's
// get_language_from_request, from the django_language cookie (when
// hasCookie) and the Accept-Language header.
func RequestLanguage(cookie string, hasCookie bool, accept string) string {
	if hasCookie {
		if apiLanguageListed(cookie) && checkForLanguage(cookie) {
			return cookie
		}
		if c := supportedVariant(cookie); c != "" {
			return strings.ToLower(c)
		}
	}
	for _, a := range parseAcceptLanguage(accept) {
		if a.lang == "*" {
			break
		}
		if !languageCodeRe.MatchString(a.lang) {
			continue
		}
		if c := supportedVariant(a.lang); c != "" {
			return strings.ToLower(c)
		}
	}
	return APIDefault
}

// LanguageFromRequest is RequestLanguage for an HTTP request.
func LanguageFromRequest(r *http.Request) string {
	cookie, hasCookie := "", false
	if c, err := r.Cookie(LanguageCookie); err == nil {
		cookie, hasCookie = c.Value, true
	}
	return RequestLanguage(cookie, hasCookie, r.Header.Get("Accept-Language"))
}

// ForAPI returns the Locale of an API language (a RequestLanguage code):
// en-us and en are English, which has no catalog.
func ForAPI(code string) *Locale {
	return New(code)
}

// English reports whether the Locale leaves messages in English.
func (l *Locale) English() bool {
	return l == nil || l.api == nil || len(l.api.msgs) == 0
}

// Gettext is Django's gettext against the API catalog: the translation of
// msgid, or msgid itself.
func (l *Locale) Gettext(msgid string) string {
	if l == nil || l.api == nil {
		return msgid
	}
	if s, ok := l.api.msgs[msgid].(string); ok && s != "" {
		return s
	}
	return msgid
}

// HasAPI reports whether the API catalog translates msgid.
func (l *Locale) HasAPI(msgid string) bool {
	if l == nil || l.api == nil {
		return false
	}
	s, ok := l.api.msgs[msgid].(string)
	return ok && s != ""
}

// Pgettext is Django's pgettext: msgid translated in a context.
func (l *Locale) Pgettext(context, msgid string) string {
	if t := l.Gettext(context + "\x04" + msgid); t != context+"\x04"+msgid {
		return t
	}
	return msgid
}

// Ngettext is Django's ngettext: the form of a plural message for n,
// chosen by the catalog's plural rule, or English's (singular for 1).
func (l *Locale) Ngettext(singular, plural string, n int64) string {
	if l != nil && l.api != nil {
		if m, ok := l.api.msgs[singular].(map[string]any); ok {
			forms, _ := m["forms"].([]any)
			rule, _ := m["plural"].(string)
			if i := gettextPlural(rule, n); i >= 0 && i < len(forms) {
				if s, ok := forms[i].(string); ok && s != "" {
					return s
				}
			}
		}
	}
	if n == 1 {
		return singular
	}
	return plural
}

// gettextPlural evaluates the plural expressions the API catalogs use
// (testdata/gen_api_catalogs.py's RULES); -1 for any other.
func gettextPlural(rule string, n int64) int {
	b := func(v bool) int {
		if v {
			return 1
		}
		return 0
	}
	switch rule {
	case "0":
		return 0
	case "n != 1":
		return b(n != 1)
	case "n > 1":
		return b(n > 1)
	case "n == 1 ? 0 : n != 0 && n % 1000000 == 0 ? 1 : 2":
		switch {
		case n == 1:
			return 0
		case n != 0 && n%1000000 == 0:
			return 1
		}
		return 2
	case "(n == 0 || n == 1) ? 0 : n != 0 && n % 1000000 == 0 ? 1 : 2":
		switch {
		case n == 0 || n == 1:
			return 0
		case n != 0 && n%1000000 == 0:
			return 1
		}
		return 2
	case "n==0 ? 0 : n==1 ? 1 : n==2 ? 2 : n%100>=3 && n%100<=10 ? 3 : n%100>=11 && n%100<=99 ? 4 : 5":
		switch {
		case n == 0:
			return 0
		case n == 1:
			return 1
		case n == 2:
			return 2
		case n%100 >= 3 && n%100 <= 10:
			return 3
		case n%100 >= 11 && n%100 <= 99:
			return 4
		}
		return 5
	}
	return -1
}
