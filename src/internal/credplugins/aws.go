package credplugins

import (
	"bufio"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

type awsCreds struct{ id, secret, token string }

var awsRegionRe = regexp.MustCompile(`^[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?$`)

// awsSecretsManagerBackend is aws_secretsmanager_backend: GetSecretValue
// with the credential's keys, or with the controller's own AWS identity
// when an administrator allowed that.
func awsSecretsManagerBackend(ctx context.Context, env Env, kw Kwargs) (any, error) {
	name, err := kw.need("secret_name")
	if err != nil {
		return nil, err
	}
	region, err := kw.need("region_name")
	if err != nil {
		return nil, err
	}
	// Empty keys mean botocore's default credential chain.
	secretKey := kw.get("aws_secret_key", "")
	accessKey := kw.get("aws_access_key", "")
	useDefault := secretKey == "" && accessKey == ""
	if useDefault && !env.AllowAWSDefaultCredentials {
		return nil, exc("DefaultCredentialsNotAllowed", "AWS Access Key and AWS Secret Key are empty and AWS_SECRETS_MANAGER_ALLOW_DEFAULT_CREDENTIALS is off, "+
			"so this lookup may not use the controller's AWS identity. Supply both keys, or have a system administrator enable the setting.")
	}
	v, err := awsGetSecretValue(ctx, env, region, name, accessKey, secretKey)
	if err == nil || !useDefault {
		return v, err
	}
	// With the controller's identity, AWS's error text can name it; keep
	// only the error code and the operation.
	e, ok := err.(*Exception)
	if !ok {
		return nil, err
	}
	detail := e.Class
	if e.awsDetail != "" {
		detail = e.awsDetail
	}
	return nil, exc("DefaultCredentialsLookupError", "AWS Secrets Manager lookup with the controller's AWS identity failed: %s", detail)
}

func awsGetSecretValue(ctx context.Context, env Env, region, name, accessKey, secretKey string) (any, error) {
	if !awsRegionRe.MatchString(region) {
		return nil, exc("InvalidRegionError", "Provided region_name '%s' doesn't match a supported format.", region)
	}
	var creds *awsCreds
	switch {
	case accessKey != "" && secretKey != "":
		creds = &awsCreds{id: accessKey, secret: secretKey}
	case accessKey != "":
		return nil, exc("PartialCredentialsError", "Partial credentials found in explicit, missing: aws_secret_access_key")
	case secretKey != "":
		return nil, exc("PartialCredentialsError", "Partial credentials found in explicit, missing: aws_access_key_id")
	default:
		var err error
		if creds, err = awsDefaultCredentials(ctx, env, region); err != nil {
			return nil, err
		}
	}
	endpoint := env.getenv("AWS_ENDPOINT_URL_SECRETS_MANAGER")
	if endpoint == "" {
		endpoint = env.getenv("AWS_ENDPOINT_URL")
	}
	if endpoint == "" {
		suffix := "amazonaws.com"
		if strings.HasPrefix(region, "cn-") {
			suffix = "amazonaws.com.cn"
		}
		endpoint = "https://secretsmanager." + region + "." + suffix
	}
	s, err := newSession(env, timeouts(60, 60))
	if err != nil {
		return nil, botoTransportError(err)
	}
	body, _ := json.Marshal(map[string]string{"SecretId": name})
	var resp *response
	for attempt := 0; ; attempt++ {
		u, err := url.Parse(strings.TrimRight(endpoint, "/") + "/")
		if err != nil || u.Host == "" {
			return nil, exc("ValueError", "Invalid endpoint: %s", endpoint)
		}
		h := http.Header{"Content-Type": {"application/x-amz-json-1.1"}, "X-Amz-Target": {"secretsmanager.GetSecretValue"}}
		sigV4(h, "POST", u, body, creds, region, "secretsmanager", time.Now().UTC())
		if resp, err = s.do(ctx, "POST", u.String(), h, body); err != nil {
			if ctx.Err() != nil {
				return nil, err
			}
			return nil, botoTransportError(err)
		}
		if resp.status < 300 {
			break
		}
		code, msg := awsErrorCode(resp)
		retryable := resp.status >= 500 || code == "Throttling" || code == "ThrottlingException" || code == "TooManyRequestsException" || code == "RequestLimitExceeded"
		if !retryable || attempt >= 4 {
			e := exc("ClientError", "An error occurred (%s) when calling the GetSecretValue operation: %s", code, msg)
			e.awsDetail = code + " from GetSecretValue"
			return nil, e
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(time.Duration(1<<attempt) * 500 * time.Millisecond):
		}
	}
	var out map[string]any
	d := json.NewDecoder(strings.NewReader(string(resp.body)))
	if err := d.Decode(&out); err != nil {
		return nil, exc("ResponseParserError", "Unable to parse response")
	}
	if v, ok := out["SecretString"]; ok {
		return v, nil
	}
	b64, ok := out["SecretBinary"].(string)
	if !ok {
		return nil, keyError("SecretBinary")
	}
	raw, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return nil, exc("ResponseParserError", "Unable to parse response")
	}
	return string(raw), nil
}

// awsErrorCode is what botocore read from an error response.
func awsErrorCode(resp *response) (string, string) {
	code, msg := "", ""
	var j map[string]any
	if json.Unmarshal(resp.body, &j) == nil {
		if t, ok := j["__type"].(string); ok {
			code = t
		}
		if m, ok := j["message"].(string); ok {
			msg = m
		} else if m, ok := j["Message"].(string); ok {
			msg = m
		}
	}
	if code == "" {
		code = resp.header.Get("X-Amzn-Errortype")
		if i := strings.IndexByte(code, ':'); i >= 0 {
			code = code[:i]
		}
	}
	if i := strings.LastIndexByte(code, '#'); i >= 0 {
		code = code[i+1:]
	}
	if code == "" {
		code = strconv.Itoa(resp.status)
	}
	return code, msg
}

// botoTransportError renames a requests exception to botocore's.
func botoTransportError(err error) error {
	e, ok := err.(*Exception)
	if !ok {
		return err
	}
	class := map[string]string{"ConnectionError": "EndpointConnectionError", "ConnectTimeout": "ConnectTimeoutError", "ReadTimeout": "ReadTimeoutError",
		"ProxyError": "ProxyConnectionError", "SSLError": "SSLError"}[e.Class]
	if class == "" {
		return err
	}
	return &Exception{Class: class, Msg: e.Msg}
}

// sigV4 signs a request with AWS Signature Version 4.
func sigV4(h http.Header, method string, u *url.URL, body []byte, c *awsCreds, region, service string, now time.Time) {
	amzDate := now.Format("20060102T150405Z")
	day := now.Format("20060102")
	h.Set("X-Amz-Date", amzDate)
	if c.token != "" {
		h.Set("X-Amz-Security-Token", c.token)
	}
	payloadHash := sha256Hex(body)
	headers := map[string]string{"host": u.Host}
	for k, v := range h {
		headers[strings.ToLower(k)] = strings.Join(strings.Fields(strings.Join(v, ",")), " ")
	}
	names := make([]string, 0, len(headers))
	for k := range headers {
		names = append(names, k)
	}
	sort.Strings(names)
	var canon strings.Builder
	for _, k := range names {
		canon.WriteString(k + ":" + headers[k] + "\n")
	}
	signed := strings.Join(names, ";")
	path := u.EscapedPath()
	if path == "" {
		path = "/"
	}
	creq := strings.Join([]string{method, path, u.RawQuery, canon.String(), signed, payloadHash}, "\n")
	scope := day + "/" + region + "/" + service + "/aws4_request"
	sts := "AWS4-HMAC-SHA256\n" + amzDate + "\n" + scope + "\n" + sha256Hex([]byte(creq))
	k := hmacSHA256([]byte("AWS4"+c.secret), day)
	k = hmacSHA256(k, region)
	k = hmacSHA256(k, service)
	k = hmacSHA256(k, "aws4_request")
	sig := hex.EncodeToString(hmacSHA256(k, sts))
	h.Set("Authorization", "AWS4-HMAC-SHA256 Credential="+c.id+"/"+scope+", SignedHeaders="+signed+", Signature="+sig)
}

func sha256Hex(b []byte) string {
	s := sha256.Sum256(b)
	return hex.EncodeToString(s[:])
}

func hmacSHA256(key []byte, data string) []byte {
	m := hmac.New(sha256.New, key)
	m.Write([]byte(data))
	return m.Sum(nil)
}

// awsDefaultCredentials walks botocore's default credential chain: the
// environment, a web identity token, the shared credentials and config
// files, the container credential endpoint, and the EC2 instance metadata
// service (one attempt, one second, as the plugin pinned it).
func awsDefaultCredentials(ctx context.Context, env Env, region string) (*awsCreds, error) {
	if id, sec := env.getenv("AWS_ACCESS_KEY_ID"), env.getenv("AWS_SECRET_ACCESS_KEY"); id != "" || sec != "" {
		if id == "" || sec == "" {
			return nil, exc("PartialCredentialsError", "Partial credentials found in env")
		}
		tok := env.getenv("AWS_SESSION_TOKEN")
		if tok == "" {
			tok = env.getenv("AWS_SECURITY_TOKEN")
		}
		return &awsCreds{id: id, secret: sec, token: tok}, nil
	}
	if tf, role := env.getenv("AWS_WEB_IDENTITY_TOKEN_FILE"), env.getenv("AWS_ROLE_ARN"); tf != "" && role != "" {
		return awsWebIdentity(ctx, env, region, tf, role)
	}
	profile := env.getenv("AWS_PROFILE")
	if profile == "" {
		profile = env.getenv("AWS_DEFAULT_PROFILE")
	}
	if profile == "" {
		profile = "default"
	}
	home, _ := os.UserHomeDir()
	credFile := env.getenv("AWS_SHARED_CREDENTIALS_FILE")
	if credFile == "" {
		credFile = filepath.Join(home, ".aws", "credentials")
	}
	if c := iniCreds(credFile, profile); c != nil {
		return c, nil
	}
	cfgFile := env.getenv("AWS_CONFIG_FILE")
	if cfgFile == "" {
		cfgFile = filepath.Join(home, ".aws", "config")
	}
	section := "profile " + profile
	if profile == "default" {
		section = "default"
	}
	if c := iniCreds(cfgFile, section); c != nil {
		return c, nil
	}
	if c, err := awsContainerCreds(ctx, env); c != nil || err != nil {
		return c, err
	}
	if !strings.EqualFold(env.getenv("AWS_EC2_METADATA_DISABLED"), "true") {
		if c := awsIMDSCreds(ctx, env); c != nil {
			return c, nil
		}
	}
	return nil, exc("NoCredentialsError", "Unable to locate credentials")
}

// iniCreds reads static keys from one section of an AWS ini file.
func iniCreds(path, section string) *awsCreds {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()
	vals := map[string]string{}
	cur := ""
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		switch {
		case line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, ";"):
		case strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]"):
			cur = strings.TrimSpace(line[1 : len(line)-1])
		case cur == section:
			if k, v, ok := strings.Cut(line, "="); ok {
				vals[strings.TrimSpace(k)] = strings.TrimSpace(v)
			}
		}
	}
	if vals["aws_access_key_id"] == "" || vals["aws_secret_access_key"] == "" {
		return nil
	}
	return &awsCreds{id: vals["aws_access_key_id"], secret: vals["aws_secret_access_key"], token: vals["aws_session_token"]}
}

// directSession talks to a metadata endpoint: no proxy, and none of the
// metadata guard every other session has. Its URLs are the controller's
// own identity endpoints (169.254.169.254, 169.254.170.2, or the task
// environment's AWS_CONTAINER_CREDENTIALS_FULL_URI), never a user's.
func directSession(connect, read float64) (*session, error) {
	s, err := newSession(Env{}, timeouts(connect, read))
	if err != nil {
		return nil, err
	}
	tr := s.hc.Transport.(*http.Transport)
	tr.Proxy = nil
	if testDial == nil {
		tr.DialContext = (&net.Dialer{Timeout: time.Duration(connect * float64(time.Second)), KeepAlive: 30 * time.Second}).DialContext
	}
	return s, nil
}

func awsWebIdentity(ctx context.Context, env Env, region, tokenFile, role string) (*awsCreds, error) {
	tok, err := os.ReadFile(tokenFile)
	if err != nil {
		return nil, exc("InvalidIdentityTokenError", "The web identity token file could not be read")
	}
	sessionName := env.getenv("AWS_ROLE_SESSION_NAME")
	if sessionName == "" {
		sessionName = "botocore-session-" + strconv.FormatInt(time.Now().Unix(), 10)
	}
	endpoint := "https://sts." + region + ".amazonaws.com/"
	if v := env.getenv("AWS_ENDPOINT_URL_STS"); v != "" {
		endpoint = strings.TrimRight(v, "/") + "/"
	}
	s, err := newSession(env, timeouts(60, 60))
	if err != nil {
		return nil, err
	}
	form := url.Values{"Action": {"AssumeRoleWithWebIdentity"}, "Version": {"2011-06-15"}, "RoleArn": {role}, "RoleSessionName": {sessionName},
		"WebIdentityToken": {strings.TrimSpace(string(tok))}}
	resp, err := s.do(ctx, "POST", endpoint, nil, form)
	if err != nil {
		return nil, botoTransportError(err)
	}
	var out struct {
		Result struct {
			Credentials struct {
				AccessKeyID     string `xml:"AccessKeyId"`
				SecretAccessKey string `xml:"SecretAccessKey"`
				SessionToken    string `xml:"SessionToken"`
			} `xml:"Credentials"`
		} `xml:"AssumeRoleWithWebIdentityResult"`
		Error struct {
			Code string `xml:"Code"`
		} `xml:"Error"`
	}
	_ = xml.Unmarshal(resp.body, &out)
	if resp.status >= 300 || out.Result.Credentials.AccessKeyID == "" {
		code := out.Error.Code
		if code == "" {
			code = strconv.Itoa(resp.status)
		}
		e := exc("ClientError", "An error occurred (%s) when calling the AssumeRoleWithWebIdentity operation", code)
		e.awsDetail = code + " from AssumeRoleWithWebIdentity"
		return nil, e
	}
	c := out.Result.Credentials
	return &awsCreds{id: c.AccessKeyID, secret: c.SecretAccessKey, token: c.SessionToken}, nil
}

func awsContainerCreds(ctx context.Context, env Env) (*awsCreds, error) {
	full := env.getenv("AWS_CONTAINER_CREDENTIALS_FULL_URI")
	if rel := env.getenv("AWS_CONTAINER_CREDENTIALS_RELATIVE_URI"); rel != "" {
		full = "http://169.254.170.2" + rel
	}
	if full == "" {
		return nil, nil
	}
	h := http.Header{"Accept": {"application/json"}}
	if t := env.getenv("AWS_CONTAINER_AUTHORIZATION_TOKEN"); t != "" {
		h.Set("Authorization", t)
	} else if p := env.getenv("AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE"); p != "" {
		if b, err := os.ReadFile(p); err == nil {
			h.Set("Authorization", strings.TrimSpace(string(b)))
		}
	}
	s, err := directSession(2, 2)
	if err != nil {
		return nil, err
	}
	var resp *response
	for attempt := 0; attempt < 3; attempt++ {
		if resp, err = s.do(ctx, "GET", full, h, nil); err == nil && resp.status == 200 {
			break
		}
	}
	if err != nil || resp.status != 200 {
		return nil, exc("CredentialRetrievalError", "Error when retrieving credentials from container-role")
	}
	var j struct{ AccessKeyId, SecretAccessKey, Token string }
	if json.Unmarshal(resp.body, &j) != nil || j.AccessKeyId == "" {
		return nil, exc("CredentialRetrievalError", "Error when retrieving credentials from container-role")
	}
	return &awsCreds{id: j.AccessKeyId, secret: j.SecretAccessKey, token: j.Token}, nil
}

func awsIMDSCreds(ctx context.Context, env Env) *awsCreds {
	base := env.getenv("AWS_EC2_METADATA_SERVICE_ENDPOINT")
	if base == "" {
		base = "http://169.254.169.254/"
	}
	base = strings.TrimRight(base, "/")
	s, err := directSession(1, 1)
	if err != nil {
		return nil
	}
	h := http.Header{}
	if resp, err := s.do(ctx, "PUT", base+"/latest/api/token", http.Header{"X-Aws-Ec2-Metadata-Token-Ttl-Seconds": {"21600"}}, []byte{}); err == nil && resp.status == 200 {
		h.Set("X-Aws-Ec2-Metadata-Token", string(resp.body))
	}
	resp, err := s.do(ctx, "GET", base+"/latest/meta-data/iam/security-credentials/", h, nil)
	if err != nil || resp.status != 200 {
		return nil
	}
	role := strings.TrimSpace(strings.SplitN(string(resp.body), "\n", 2)[0])
	if role == "" {
		return nil
	}
	if resp, err = s.do(ctx, "GET", base+"/latest/meta-data/iam/security-credentials/"+role, h, nil); err != nil || resp.status != 200 {
		return nil
	}
	var j struct{ AccessKeyId, SecretAccessKey, Token string }
	if json.Unmarshal(resp.body, &j) != nil || j.AccessKeyId == "" {
		return nil
	}
	return &awsCreds{id: j.AccessKeyId, secret: j.SecretAccessKey, token: j.Token}
}
