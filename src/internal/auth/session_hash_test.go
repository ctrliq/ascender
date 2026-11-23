package auth

import "testing"

func TestSessionAuthHash(t *testing.T) {
	u := &User{password: "pbkdf2_sha256$1$a$b"}
	sess := &Session{Data: map[string]any{}}
	if ok, present := SessionHashOK("k", sess, u); ok || present {
		t.Fatal("empty session passed")
	}
	sess.Data[SessionHashKey] = SessionAuthHash("k", u)
	if ok, _ := SessionHashOK("k", sess, u); !ok {
		t.Fatal("own hash refused")
	}
	u.password = "pbkdf2_sha256$1$a$c"
	if ok, present := SessionHashOK("k", sess, u); ok || !present {
		t.Fatal("changed password still passes")
	}
	if SessionAuthHash("k", u) == SessionAuthHash("other", u) {
		t.Fatal("hash ignores the secret key")
	}
}
