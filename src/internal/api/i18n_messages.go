package api

import (
	"strings"
	"unicode"

	"github.com/ctrliq/ascender/internal/i18n"
)

// translatedArgs are formatted messages whose values the old code
// translated too, by placeholder.
var translatedArgs = map[string][]string{
	// access.py's _("The {} role cannot be assigned to a team").format(
	// sub_obj.name): the role's name, a gettext_lazy message.
	"The {} role cannot be assigned to a team": {"#0"},
}

// composedMessages translate messages the old code put together from
// separately translated pieces; each reports whether s was its message.
var composedMessages []func(l *i18n.Locale, s string) (string, bool)

func init() {
	composedMessages = append(composedMessages,
		// APIView.finalize_response: every 401's detail had
		// _(' To establish a login session, visit') + ' /api/login/.' added.
		func(l *i18n.Locale, s string) (string, bool) {
			const tail = " To establish a login session, visit"
			const url = " /api/login/."
			head, ok := strings.CutSuffix(s, tail+url)
			if !ok {
				return s, false
			}
			return TranslateMessage(l, head) + l.Gettext(tail) + url, true
		},
		// BulkJobLaunchSerializer: model._meta.verbose_name_plural.title()
		// in the translated message; of the models it names, only
		// Inventory's plural was a gettext_lazy message.
		func(l *i18n.Locale, s string) (string, bool) {
			const msgid = "{model_name} {not_allowed} not found or you don't have permissions to access it"
			rest, ok := strings.CutPrefix(s, "Inventories ")
			if !ok {
				return s, false
			}
			ids, ok := strings.CutSuffix(rest, " not found or you don't have permissions to access it")
			if !ok {
				return s, false
			}
			return i18n.Format(l.Gettext(msgid), map[string]any{"model_name": pyTitle(l.Gettext("inventories")), "not_allowed": ids}), true
		})
}

// pyTitle is Python's str.title().
func pyTitle(s string) string {
	var b strings.Builder
	prevCased := false
	for _, r := range s {
		cased := unicode.IsUpper(r) || unicode.IsLower(r) || unicode.IsTitle(r)
		switch {
		case cased && !prevCased:
			b.WriteRune(unicode.ToTitle(r))
		case cased:
			b.WriteRune(unicode.ToLower(r))
		default:
			b.WriteRune(r)
		}
		prevCased = cased
	}
	return b.String()
}
