package api

import (
	"context"
	"net/http"

	"github.com/ctrliq/ascender/internal/i18n"
)

// Translation. The old API ran Django's LocaleMiddleware: each request was
// answered in the language its django_language cookie or Accept-Language
// header asked for (i18n.RequestLanguage), named in Content-Language, and
// the messages the old code passed through gettext came out in it.
//
// The language travels in the request's context (WithLanguage) and, for
// code that only has the ResponseWriter, in the response's
// Content-Language header, which is set before any handler runs. Error
// bodies are translated as they are written (translateBody, from
// WriteJSON); text the old serializers translated in other responses is
// translated where it is produced (Tr, SerCtx.Loc).

type languageKey struct{}

// WithLanguage returns ctx answering API requests in lang, an API
// language ("ja", "en-us"; see i18n.APILanguages). An in-process request
// made with this context is answered in lang whatever its own cookie and
// headers say; the UI passes its language this way.
func WithLanguage(ctx context.Context, lang string) context.Context {
	return context.WithValue(ctx, languageKey{}, i18n.RequestLanguage(lang, true, ""))
}

// LanguageFrom is the API language a context carries, or "".
func LanguageFrom(ctx context.Context) string {
	s, _ := ctx.Value(languageKey{}).(string)
	return s
}

// Loc is the request's API translator.
func Loc(r *http.Request) *i18n.Locale {
	return locFor(LanguageFrom(r.Context()))
}

// Tr is msgid as the old code's _() gave it for the request.
func Tr(r *http.Request, msgid string) string {
	return Loc(r).Gettext(msgid)
}

// Loc is the translator of the request being serialized.
func (c *SerCtx) Loc() *i18n.Locale {
	if c == nil || c.R == nil {
		return locFor("")
	}
	return Loc(c.R)
}

func locFor(lang string) *i18n.Locale {
	if lang == "" {
		lang = i18n.APIDefault
	}
	return i18n.ForAPI(lang)
}

// withLanguage settles the request's language, keeping one the context
// already carries, and names it in the response's Content-Language.
func withLanguage(w http.ResponseWriter, r *http.Request) *http.Request {
	lang := LanguageFrom(r.Context())
	if lang == "" {
		lang = i18n.LanguageFromRequest(r)
		r = r.WithContext(context.WithValue(r.Context(), languageKey{}, lang))
	}
	w.Header().Set("Content-Language", lang)
	return r
}

// LanguageHandler answers next's requests in their language: the context's
// (WithLanguage) or else the one the request asks for.
func LanguageHandler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(w, withLanguage(w, r))
	})
}

// responseLocale is the translator of a response being written, from the
// Content-Language set as the request started.
func responseLocale(w http.ResponseWriter) *i18n.Locale {
	lang := w.Header().Get("Content-Language")
	if lang == "" {
		return nil
	}
	l := i18n.ForAPI(lang)
	if l.English() {
		return nil
	}
	return l
}

// locCtx is the translator of the request a context belongs to.
func locCtx(ctx context.Context) *i18n.Locale {
	return locFor(LanguageFrom(ctx))
}

// translateCredentialInputs puts a managed credential type's input
// labels and help texts into l's language, in place.
func translateCredentialInputs(l *i18n.Locale, inputs any) {
	in, ok := inputs.(*OMap)
	if !ok || l.English() {
		return
	}
	for _, key := range []string{"fields", "metadata"} {
		list, _ := in.vals[key].([]any)
		for _, f := range list {
			m, ok := f.(*OMap)
			if !ok {
				continue
			}
			for _, a := range []string{"label", "help_text"} {
				if s, ok := m.vals[a].(string); ok {
					m.vals[a] = l.Gettext(s)
				}
			}
		}
	}
}
