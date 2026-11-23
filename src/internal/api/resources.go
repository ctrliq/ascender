package api

import "net/http"

// registerResources wires the resource groups that have been ported. Each
// group lives in its own file and adds its routes here.
func (s *Server) registerResources(mux *http.ServeMux) {
	for _, reg := range resourceRegistrars {
		reg(s, mux)
	}
}

// resourceRegistrars is appended to by init functions in the resource files.
var resourceRegistrars []func(*Server, *http.ServeMux)
