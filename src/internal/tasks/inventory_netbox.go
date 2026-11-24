package tasks

import (
	"net/url"
	"strings"
)

// netboxInstanceIDVar is the host variable the netbox source composes a
// host's NetBox identity into, and the source's instance id variable
// (sourceImportSettings), so that a device or virtual machine renamed in
// NetBox is renamed here instead of being deleted and created anew.
// nb_inventory sets no variable holding the object's id, but its compose
// option is templated against the object as the API returned it, which has
// the id, and is_virtual, which the plugin adds.
const netboxInstanceIDVar = "netbox_instance_id"

// netboxCompose returns the source's compose option (variable name to Jinja
// expression) with netbox_instance_id added, unless the source variables
// set it. A compose that is not a map is left for the plugin to reject.
// host is the credential's NetBox URL.
func netboxCompose(compose any, host string) any {
	m := map[string]any{}
	switch c := compose.(type) {
	case nil:
	case map[string]any:
		for k, v := range c {
			m[k] = v
		}
	default:
		return compose
	}
	if _, ok := m[netboxInstanceIDVar]; !ok {
		m[netboxInstanceIDVar] = netboxInstanceIDExpr(host)
	}
	return m
}

// netboxInstanceIDExpr is the expression for a host's instance id:
// device:7@netbox.example.org, or vm:7@..., since devices and virtual
// machines are numbered separately, with the NetBox named by the host, port
// and path of the credential's URL, so that two NetBox sources in one
// inventory never share an id.
func netboxInstanceIDExpr(host string) string {
	expr := "('vm:' if is_virtual else 'device:') ~ id"
	if inst := netboxInstance(host); inst != "" {
		expr += " ~ '@" + inst + "'"
	}
	return expr
}

// netboxInstance names a NetBox by the host, port and path of its URL,
// lowercased and without a trailing slash: netbox.example.org,
// netbox.example.org:8443, or example.org/netbox for an install under a
// prefix. Empty when the URL has no host.
func netboxInstance(raw string) string {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Host == "" {
		return ""
	}
	return strings.ReplaceAll(strings.ToLower(u.Host)+strings.TrimSuffix(u.Path, "/"), "'", "")
}
