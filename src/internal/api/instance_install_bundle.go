package api

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/asn1"
	"encoding/pem"
	"errors"
	"fmt"
	"github.com/ctrliq/ascender/internal/db"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// The install bundle of a hop or execution node (InstanceInstallBundle):
// a tarball with the receptor certificate and key the mesh CA signs for
// the node, the CA, the work signing public key, and the playbook,
// inventory and variables of the ansible.receptor collection that set the
// node up.

// receptorOID is the otherName receptor checks a node's identity by.
var receptorOID = asn1.ObjectIdentifier{1, 3, 6, 1, 4, 1, 2312, 19, 1}

var oidSubjectAltName = asn1.ObjectIdentifier{2, 5, 29, 17}

// receptorSAN is the subjectAltName generate_receptor_tls asked for: the
// hostname as a DNS name and as receptor's otherName, and as an IP address
// when it is an IPv4 address.
func receptorSAN(hostname string) (pkix.Extension, error) {
	utf8, err := asn1.MarshalWithParams(hostname, "utf8")
	if err != nil {
		return pkix.Extension{}, err
	}
	oid, err := asn1.Marshal(receptorOID)
	if err != nil {
		return pkix.Extension{}, err
	}
	value, err := asn1.Marshal(asn1.RawValue{Class: asn1.ClassContextSpecific, Tag: 0, IsCompound: true, Bytes: utf8})
	if err != nil {
		return pkix.Extension{}, err
	}
	names := []asn1.RawValue{
		{Class: asn1.ClassContextSpecific, Tag: 2, Bytes: []byte(hostname)},
		{Class: asn1.ClassContextSpecific, Tag: 0, IsCompound: true, Bytes: append(oid, value...)},
	}
	if ip := net.ParseIP(hostname); ip != nil && ip.To4() != nil && !strings.Contains(hostname, ":") {
		names = append(names, asn1.RawValue{Class: asn1.ClassContextSpecific, Tag: 7, Bytes: ip.To4()})
	}
	der, err := asn1.Marshal(names)
	if err != nil {
		return pkix.Extension{}, err
	}
	return pkix.Extension{Id: oidSubjectAltName, Value: der}, nil
}

func parsePrivateKeyPEM(b []byte) (crypto.Signer, error) {
	block, _ := pem.Decode(b)
	if block == nil {
		return nil, errors.New("no PEM data in the mesh CA key")
	}
	if k, err := x509.ParsePKCS1PrivateKey(block.Bytes); err == nil {
		return k, nil
	}
	if k, err := x509.ParsePKCS8PrivateKey(block.Bytes); err == nil {
		if s, ok := k.(crypto.Signer); ok {
			return s, nil
		}
	}
	if k, err := x509.ParseECPrivateKey(block.Bytes); err == nil {
		return k, nil
	}
	return nil, errors.New("unsupported mesh CA key")
}

// generateReceptorTLS is generate_receptor_tls: a 2048-bit RSA key and a
// ten-year certificate for the node, signed by the mesh CA.
func generateReceptorTLS(hostname string, caCertPEM, caKeyPEM []byte) ([]byte, []byte, error) {
	block, _ := pem.Decode(caCertPEM)
	if block == nil {
		return nil, nil, errors.New("no PEM data in the mesh CA certificate")
	}
	caCert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, nil, err
	}
	caKey, err := parsePrivateKeyPEM(caKeyPEM)
	if err != nil {
		return nil, nil, err
	}
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, nil, err
	}
	san, err := receptorSAN(hostname)
	if err != nil {
		return nil, nil, err
	}
	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 159))
	if err != nil {
		return nil, nil, err
	}
	now := time.Now().UTC()
	tmpl := &x509.Certificate{SerialNumber: serial, Subject: pkix.Name{CommonName: hostname}, NotBefore: now, NotAfter: now.Add(3650 * 24 * time.Hour),
		ExtraExtensions: []pkix.Extension{san}}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, caCert, &key.PublicKey, caKey)
	if err != nil {
		return nil, nil, err
	}
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	return keyPEM, certPEM, nil
}

var blankLines = regexp.MustCompile(`\n+`)

// installPlaybook is install_receptor.yml, with its blank lines removed.
func installPlaybook(nodeType string) string {
	var b strings.Builder
	b.WriteString("---\n- hosts: all\n  become: yes\n  tasks:\n    - name: Create the receptor user\n      user:\n\n        name: \"{{ receptor_user }}\"\n\n        shell: /bin/bash\n")
	if nodeType == "execution" {
		b.WriteString("\n    - import_role:\n        name: ansible.receptor.podman\n")
	}
	b.WriteString("\n    - import_role:\n        name: ansible.receptor.setup\n")
	return blankLines.ReplaceAllString(b.String(), "\n")
}

func installInventory(hostname string) string {
	return "---\nall:\n  hosts:\n    remote-execution:\n      ansible_host: " + hostname + "\n      ansible_user: <username> # user provided\n      ansible_ssh_private_key_file: ~/.ssh/id_rsa\n"
}

const installRequirements = "---\ncollections:\n  - name: ansible.receptor\n    version: 2.0.3\n"

type bundlePeer struct{ address, protocol string }

// installGroupVars is group_vars/all.yml, with its blank lines removed.
func installGroupVars(nodeType string, listenerPort int64, listenerProtocol string, peers []bundlePeer) string {
	var b strings.Builder
	b.WriteString("receptor_user: awx\nreceptor_group: awx\nreceptor_verify: true\nreceptor_tls: true\nreceptor_mintls13: false\n")
	if nodeType == "execution" {
		b.WriteString("\nreceptor_work_commands:\n  ansible-runner:\n    command: ansible-runner\n    params: worker\n    allowruntimeparams: true\n    verifysignature: true\nadditional_python_packages:\n  - ansible-runner\n")
	}
	b.WriteString("\ncustom_worksign_public_keyfile: receptor/work_public_key.pem\ncustom_tls_certfile: receptor/tls/receptor.crt\ncustom_tls_keyfile: receptor/tls/receptor.key\ncustom_ca_certfile: receptor/tls/ca/mesh-CA.crt\n")
	if listenerPort != 0 {
		fmt.Fprintf(&b, "\nreceptor_protocol: %s\nreceptor_listener: true\nreceptor_port: %d\n", listenerProtocol, listenerPort)
	} else {
		b.WriteString("\nreceptor_listener: false\n")
	}
	if len(peers) > 0 {
		b.WriteString("\nreceptor_peers:\n")
		for _, p := range peers {
			fmt.Fprintf(&b, "\n  - address: %s\n    protocol: %s\n", p.address, p.protocol)
		}
	}
	b.WriteString("\n\npodman_user: \"{{ receptor_user }}\"\npodman_group: \"{{ receptor_group }}\"\n\n")
	return blankLines.ReplaceAllString(b.String(), "\n")
}

// bundleAddresses reads the node's listener and the addresses it peers to
// (canonical_address and get_full_address).
func (s *Server) bundleAddresses(ctx context.Context, id int64) (int64, string, []bundlePeer, error) {
	var port *int64
	var protocol string
	_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT port, protocol FROM main_receptoraddress WHERE instance_id = $1 AND canonical ORDER BY id LIMIT 1`, id).Scan(&port, &protocol)
	if protocol == "wss" {
		protocol = "ws"
	}
	rows, err := s.Q().Query(ctx, `SELECT ra.address, ra.port, ra.protocol, ra.websocket_path FROM main_instancelink l JOIN main_receptoraddress ra ON ra.id = l.target_id WHERE l.source_id = $1 ORDER BY ra.id`, id)
	if err != nil {
		return 0, "", nil, err
	}
	defer rows.Close()
	var peers []bundlePeer
	for rows.Next() {
		var addr, proto, path string
		var p *int64
		if err := rows.Scan(&addr, &p, &proto, &path); err != nil {
			return 0, "", nil, err
		}
		full := addr
		if proto == "ws" {
			full = "wss://" + addr
		}
		if p != nil && *p != 0 {
			full += fmt.Sprintf(":%d", *p)
		}
		if proto == "ws" && path != "" {
			full += "/" + path
		}
		peers = append(peers, bundlePeer{address: full, protocol: proto})
	}
	var lp int64
	if port != nil {
		lp = *port
	}
	return lp, protocol, peers, rows.Err()
}

// writeInstallBundle builds the tarball.
func (s *Server) writeInstallBundle(ctx context.Context, i *instance) ([]byte, error) {
	dir := s.Cfg.ReceptorDir
	caPath := filepath.Join(dir, "tls", "ca", "mesh-CA.crt")
	if real, err := filepath.EvalSymlinks(caPath); err == nil {
		caPath = real
	}
	caCert, err := os.ReadFile(caPath)
	if err != nil {
		return nil, err
	}
	caInfo, err := os.Stat(caPath)
	if err != nil {
		return nil, err
	}
	workKeyPath := filepath.Join(dir, "work_public_key.pem")
	workKey, err := os.ReadFile(workKeyPath)
	if err != nil {
		return nil, err
	}
	workInfo, err := os.Stat(workKeyPath)
	if err != nil {
		return nil, err
	}
	caKey, err := os.ReadFile(filepath.Join(dir, "tls", "ca", "mesh-CA.key"))
	if err != nil {
		return nil, err
	}
	key, cert, err := generateReceptorTLS(i.Hostname, caCert, caKey)
	if err != nil {
		return nil, err
	}
	port, protocol, peers, err := s.bundleAddresses(ctx, i.ID)
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	base := i.Hostname + "_install_bundle/"
	add := func(name string, data []byte, info os.FileInfo) error {
		h := &tar.Header{Name: base + name, Mode: 0o644, Size: int64(len(data)), ModTime: time.Now(), Typeflag: tar.TypeReg}
		if info != nil {
			fh, err := tar.FileInfoHeader(info, "")
			if err != nil {
				return err
			}
			fh.Name, fh.Size = base+name, int64(len(data))
			h = fh
		}
		if err := tw.WriteHeader(h); err != nil {
			return err
		}
		_, err := tw.Write(data)
		return err
	}
	for _, f := range []struct {
		name string
		data []byte
		info os.FileInfo
	}{
		{"receptor/tls/ca/mesh-CA.crt", caCert, caInfo},
		{"receptor/work_public_key.pem", workKey, workInfo},
		{"receptor/tls/receptor.key", key, nil},
		{"receptor/tls/receptor.crt", cert, nil},
		{"install_receptor.yml", []byte(installPlaybook(i.NodeType)), nil},
		{"inventory.yml", []byte(installInventory(i.Hostname)), nil},
		{"group_vars/all.yml", []byte(installGroupVars(i.NodeType, port, protocol, peers)), nil},
		{"requirements.yml", []byte(installRequirements), nil},
	} {
		if err := add(f.name, f.data, f.info); err != nil {
			return nil, err
		}
	}
	if err := tw.Close(); err != nil {
		return nil, err
	}
	if err := gz.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
