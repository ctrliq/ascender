package tasks

import (
	"bufio"
	"errors"
	"io"
	"os"
	"regexp"
	"strings"
)

// The project checkout is written by the project update, which runs in an
// execution environment from the project's own content: a project admin
// controls every file in it, .git/config and hooks included. Running git
// on this host in that tree would run what they put there (core.fsmonitor,
// filters, hooks) as the task process. So the checked-out revision is read
// from the repository's files directly, through an os.Root on the checkout
// (no symlink leads out of it), and git itself only ever runs in an
// execution environment.

var (
	gitObjectName = regexp.MustCompile(`^(?:[0-9a-f]{40}|[0-9a-f]{64})$`)
	gitRefName    = regexp.MustCompile(`^refs/[A-Za-z0-9._/-]+$`)
)

// maxGitRefFile bounds what is read of HEAD, a loose ref or packed-refs.
const maxGitRefFile = 16 << 20

// gitHead is `git rev-parse HEAD` for the checkout in dir, read without
// running git. A repository it cannot read this way (a .git file pointing
// elsewhere, a symbolic ref chain, a missing ref) is an error, which makes
// the caller sync the project.
func gitHead(dir string) (string, error) {
	root, err := os.OpenRoot(dir)
	if err != nil {
		return "", err
	}
	defer root.Close()
	head, err := readGitFile(root, ".git/HEAD")
	if err != nil {
		return "", err
	}
	head = strings.TrimSpace(head)
	ref, symbolic := strings.CutPrefix(head, "ref:")
	if !symbolic {
		if !gitObjectName.MatchString(head) {
			return "", errors.New("HEAD is not an object name")
		}
		return head, nil
	}
	ref = strings.TrimSpace(ref)
	if !gitRefName.MatchString(ref) || strings.Contains(ref, "..") {
		return "", errors.New("HEAD names an invalid ref")
	}
	if loose, err := readGitFile(root, ".git/"+ref); err == nil {
		if sha := strings.TrimSpace(loose); gitObjectName.MatchString(sha) {
			return sha, nil
		}
		return "", errors.New(ref + " is not an object name")
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", err
	}
	return packedRef(root, ref)
}

// readGitFile reads a small regular file of the repository.
func readGitFile(root *os.Root, name string) (string, error) {
	f, err := root.Open(name)
	if err != nil {
		return "", err
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return "", err
	}
	if !st.Mode().IsRegular() {
		return "", errors.New(name + " is not a regular file")
	}
	b, err := io.ReadAll(io.LimitReader(f, maxGitRefFile+1))
	if err != nil {
		return "", err
	}
	if len(b) > maxGitRefFile {
		return "", errors.New(name + " is too large")
	}
	return string(b), nil
}

// packedRef looks ref up in .git/packed-refs ("<object> <ref>" lines).
func packedRef(root *os.Root, ref string) (string, error) {
	data, err := readGitFile(root, ".git/packed-refs")
	if err != nil {
		return "", err
	}
	sc := bufio.NewScanner(strings.NewReader(data))
	sc.Buffer(make([]byte, 0, 4096), maxGitRefFile)
	for sc.Scan() {
		sha, name, ok := strings.Cut(sc.Text(), " ")
		if ok && name == ref && gitObjectName.MatchString(sha) {
			return sha, nil
		}
	}
	return "", errors.New(ref + " is not in packed-refs")
}
