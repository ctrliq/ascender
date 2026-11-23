package api

import (
	"net/http"
	"strings"

	"github.com/ctrliq/ascender/internal/auth"
)

// routesWithoutOptions are the patterns registered with no OPTIONS document.
var routesWithoutOptions []string

// methodMap maps HTTP methods to handlers for one URL pattern.
type methodMap map[string]HandlerFunc

// route registers a pattern with per-method dispatch, a JSON 405 for other
// methods, and HEAD/OPTIONS defaults. The pattern must end with "{$}" so a
// trailing slash is required, as Django's URLs did.
func (s *Server) route(mux *http.ServeMux, pattern string, methods methodMap, options HandlerFunc) {
	// The Allow header lists methods in Django's http_method_names order,
	// as DRF's allowed_methods did.
	allowed := make([]string, 0, len(methods)+2)
	for _, m := range []string{"GET", "POST", "PUT", "PATCH", "DELETE"} {
		if _, ok := methods[m]; ok {
			allowed = append(allowed, m)
		}
	}
	// The bulk views listed their allowed methods themselves, without HEAD.
	if _, ok := methods["GET"]; ok && !strings.HasPrefix(pattern, "/api/v2/bulk/") {
		allowed = append(allowed, "HEAD")
	}
	allowed = append(allowed, "OPTIONS")
	// Routes registered without an OPTIONS handler still answer with the
	// document captured from the old API for them, when there is one.
	if options == nil {
		key := routeMetadataKey(pattern)
		if _, err := metadataFS.ReadFile("metadata/routes/" + key + ".json"); err == nil {
			options = s.optionsFor(key)
		} else if _, err := metadataFS.ReadFile("metadata/" + key + ".json"); err == nil {
			options = s.optionsFor(key)
		}
	}
	if options == nil {
		routesWithoutOptions = append(routesWithoutOptions, pattern)
	}
	allow := strings.Join(allowed, ", ")
	// The views of these routes were DRF's: their error responses are
	// logged (API_400_ERROR_LOG_FORMAT).
	mux.HandleFunc(pattern, s.handle(func(w http.ResponseWriter, r *http.Request) error {
		w.Header().Set("Allow", allow)
		m := r.Method
		if m == http.MethodHead {
			m = http.MethodGet
		}
		if m == http.MethodOptions {
			if options != nil {
				return localizeOptions(options)(w, r)
			}
			w.WriteHeader(http.StatusOK)
			return nil
		}
		// APIView.check_permissions: a token without the write scope may
		// only read, whatever the view and before the view looks at the
		// method or the object.
		if m != http.MethodGet {
			if u := auth.UserFrom(r.Context()); u != nil && !u.CanWrite() {
				return ErrForbidden
			}
		}
		fn, ok := methods[m]
		if !ok {
			return MethodNotAllowed(r.Method)
		}
		return fn(w, r)
	}, true))
}

// Routes builds the API handler.
// WebsocketHandler serves /websocket/, authenticated as the API is.
func (s *Server) WebsocketHandler() http.Handler {
	return s.Middleware(http.HandlerFunc(s.websocketView))
}

func (s *Server) Routes() http.Handler {
	s.routesOnce.Do(func() { s.routes = s.buildRoutes() })
	return s.routes
}

func (s *Server) buildRoutes() http.Handler {
	mux := http.NewServeMux()
	s.route(mux, "/api/{$}", methodMap{"GET": s.apiRoot}, nil)
	s.route(mux, "/api/v2/{$}", methodMap{"GET": s.apiV2Root}, nil)
	s.route(mux, "/api/v2/ping/{$}", methodMap{"GET": s.ping}, s.optionsAnonymous("ping"))
	s.route(mux, "/api/v2/config/{$}", methodMap{"GET": s.configView, "POST": s.configNoSubscription("install"), "DELETE": s.configNoSubscription("remove")}, nil)
	s.route(mux, "/api/v2/auth/{$}", methodMap{"GET": s.authView}, nil)
	s.route(mux, "/api/v2/me/{$}", methodMap{"GET": s.meView}, nil)
	mux.HandleFunc("/api/login/{$}", s.h(s.loginView))
	mux.HandleFunc("/api/logout/{$}", s.h(s.logoutView))
	mux.HandleFunc("/api/websocket/{$}", s.websocketView)
	// The workload identity issuer's public documents, with or without
	// the trailing slash, unauthenticated.
	for _, p := range []string{"/api/o/.well-known/openid-configuration", "/api/o/.well-known/openid-configuration/"} {
		mux.HandleFunc(p, s.openIDConfiguration)
	}
	for _, p := range []string{"/api/o/.well-known/jwks.json", "/api/o/.well-known/jwks.json/"} {
		mux.HandleFunc(p, s.jwksView)
	}
	// The OAuth2 provider (django-oauth-toolkit's views, not DRF's).
	s.route(mux, "/api/o/{$}", methodMap{"GET": s.oauthRootView}, s.optionsAnonymous("oauth2_root"))
	mux.HandleFunc("/api/o/token/{$}", s.oauthTokenView)
	mux.HandleFunc("/api/o/revoke_token/{$}", s.oauthRevokeView)
	mux.HandleFunc("/api/o/authorize/{$}", s.oauthAuthorizeView)

	s.registerOrganizations(mux)
	s.registerResources(mux)
	s.registerBulk(mux)
	s.registerSchema(mux)

	// Anything else under /api/ is a JSON 404; a missing trailing slash is
	// redirected, as APPEND_SLASH did.
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set(browsableNoView, "1")
		if !strings.HasSuffix(r.URL.Path, "/") {
			u := *r.URL
			u.Path += "/"
			http.Redirect(w, r, u.String(), http.StatusMovedPermanently)
			return
		}
		WriteError(w, ErrNotFound)
	})
	return LanguageHandler(s.namedURLs(s.Middleware(mux)))
}

// deprecatedWarning is the header deprecated views answered with.
const deprecatedWarning = `299 awx "This resource has been deprecated and will be removed in a future release."`

// configNoSubscription is ApiV2ConfigView's POST and DELETE: there is no
// subscription to install or remove. Only superusers get that far.
func (s *Server) configNoSubscription(action string) HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) error {
		u, err := RequireUser(r)
		if err != nil {
			return err
		}
		if err := RequireWriteScope(u); err != nil {
			return err
		}
		if !u.IsSuperuser {
			return ErrForbidden
		}
		WriteJSON(w, http.StatusBadRequest, NewOMap().Set("error", "Ascender does not use subscriptions. There is no licence to "+action+"."))
		return nil
	}
}
