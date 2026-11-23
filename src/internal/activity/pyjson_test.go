package activity

import "testing"

func TestPyJSON(t *testing.T) {
	got, err := PyJSON(map[string]any{"name": "café <a&b>", "id": 3, "list": []string{"x", "y"}, "n": nil, "s": "a, b: \"c\""})
	if err != nil {
		t.Fatal(err)
	}
	want := `{"id": 3, "list": ["x", "y"], "n": null, "name": "caf\u00e9 <a&b>", "s": "a, b: \"c\""}`
	if string(got) != want {
		t.Fatalf("got %s want %s", got, want)
	}
}
