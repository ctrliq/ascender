package api

import (
	"net/http/httptest"
	"testing"

	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/models"
)

// Only a superuser may make an application skip the consent page; an
// unchanged value may be sent back by anyone (the UI's PUT sends it).
func TestSkipAuthorizationIsSuperuserOnly(t *testing.T) {
	s := &Server{}
	try := func(u *auth.User, current bool) (bool, FieldErrors) {
		body := NewOMap()
		body.Set("skip_authorization", true)
		f := NewForm(body, true)
		r := httptest.NewRequest("PATCH", "/api/v2/applications/1/", nil)
		r = r.WithContext(auth.WithUser(r.Context(), u))
		a := &models.OAuth2Application{SkipAuthorization: current}
		s.appFromForm(r, f, a, false)
		return a.SkipAuthorization, f.Errs
	}
	if got, errs := try(&auth.User{ID: 2}, false); got || len(errs["skip_authorization"]) == 0 {
		t.Errorf("org admin turned it on: %v %v", got, errs)
	}
	if got, errs := try(&auth.User{ID: 2}, true); !got || len(errs) != 0 {
		t.Errorf("org admin resending true: %v %v", got, errs)
	}
	if got, errs := try(&auth.User{ID: 1, IsSuperuser: true}, false); !got || len(errs) != 0 {
		t.Errorf("superuser: %v %v", got, errs)
	}
}
