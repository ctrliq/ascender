package api

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/hex"
	"encoding/pem"
	"math/big"
	"strings"
	"testing"
	"time"
)

// Expected values: cryptography's SubjectAlternativeName([DNSName(h),
// OtherName(1.3.6.1.4.1.2312.19.1, <DER UTF8String h>)(, IPAddress(h))])
// .public_bytes(), as generate_receptor_tls built it.
func TestReceptorSAN(t *testing.T) {
	for host, want := range map[string]string{
		"zz-exec.example.com": "303982137a7a2d657865632e6578616d706c652e636f6da02206092b0601040192081301a0150c137a7a2d657865632e6578616d706c652e636f6d",
		"10.1.2.3":            "3029820831302e312e322e33a01706092b0601040192081301a00a0c0831302e312e322e3387040a010203",
	} {
		ext, err := receptorSAN(host)
		if err != nil {
			t.Fatal(err)
		}
		got := hex.EncodeToString(ext.Value)
		if got != want {
			t.Errorf("SAN of %s:\n got %s\nwant %s", host, got, want)
		}
	}
}

func TestReceptorTLSAndTemplates(t *testing.T) {
	caKey, _ := rsa.GenerateKey(rand.Reader, 2048)
	tmpl := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "Ascender Mesh CA"}, NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour),
		IsCA: true, BasicConstraintsValid: true, KeyUsage: x509.KeyUsageCertSign}
	der, _ := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &caKey.PublicKey, caKey)
	caPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(caKey)})
	key, cert, err := generateReceptorTLS("10.1.2.3", caPEM, keyPEM)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(string(key), "-----BEGIN RSA PRIVATE KEY-----") {
		t.Errorf("key: %.40s", key)
	}
	block, _ := pem.Decode(cert)
	c, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		t.Fatal(err)
	}
	ca, _ := x509.ParseCertificate(der)
	if err := c.CheckSignatureFrom(ca); err != nil {
		t.Errorf("not signed by the CA: %v", err)
	}
	if c.Subject.CommonName != "10.1.2.3" || len(c.DNSNames) != 1 || c.DNSNames[0] != "10.1.2.3" || len(c.IPAddresses) != 1 || c.NotAfter.Sub(c.NotBefore) < 3649*24*time.Hour {
		t.Errorf("certificate: %v %v %v %v", c.Subject, c.DNSNames, c.IPAddresses, c.NotAfter.Sub(c.NotBefore))
	}
	play := installPlaybook("execution")
	if play != "---\n- hosts: all\n  become: yes\n  tasks:\n    - name: Create the receptor user\n      user:\n        name: \"{{ receptor_user }}\"\n        shell: /bin/bash\n    - import_role:\n        name: ansible.receptor.podman\n    - import_role:\n        name: ansible.receptor.setup\n" {
		t.Errorf("playbook:\n%s", play)
	}
	if strings.Contains(installPlaybook("hop"), "podman") {
		t.Error("hop playbook installs podman")
	}
	vars := installGroupVars("hop", 27199, "tcp", []bundlePeer{{"wss://control.example.com:443/mesh", "ws"}})
	want := "receptor_user: awx\nreceptor_group: awx\nreceptor_verify: true\nreceptor_tls: true\nreceptor_mintls13: false\ncustom_worksign_public_keyfile: receptor/work_public_key.pem\ncustom_tls_certfile: receptor/tls/receptor.crt\ncustom_tls_keyfile: receptor/tls/receptor.key\ncustom_ca_certfile: receptor/tls/ca/mesh-CA.crt\nreceptor_protocol: tcp\nreceptor_listener: true\nreceptor_port: 27199\nreceptor_peers:\n  - address: wss://control.example.com:443/mesh\n    protocol: ws\npodman_user: \"{{ receptor_user }}\"\npodman_group: \"{{ receptor_group }}\"\n"
	if vars != want {
		t.Errorf("group vars:\n%s", vars)
	}
}
