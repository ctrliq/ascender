package tasks

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"syscall"
)

// A job's private data directory is mounted read-write into its container
// at /runner, so a playbook can leave anything there: symlinks to host
// files (/etc/ascender/SECRET_KEY), symlinked directories, FIFOs. Every
// host-side access to a file under it after the container has started
// goes through these helpers, which resolve the path inside an os.Root
// opened on the directory: a symlink may point elsewhere inside it, never
// outside, and only regular files are read.

// One task process runs every job, so what a job (its playbook, its
// execution environment, its worker) hands back is bounded: an
// out-of-memory or a full disk would end every run on the node.
const (
	// maxFactFile bounds one host's fact cache file.
	maxFactFile = 64 << 20
	// maxInventoryOutput bounds an inventory update's output.json.
	maxInventoryOutput = 1 << 30
	// maxWorkerArtifacts bounds the artifacts archive a worker returns,
	// and maxUnpacked what it may unpack to.
	maxWorkerArtifacts = 1 << 30
	maxUnpacked        = 2 << 30
	// maxStreamLine bounds one line of a worker's stream or a pod's log
	// (an event with its data).
	maxStreamLine = 128 << 20
	// maxOutputBuffer bounds the output the local runner holds back while
	// it waits for an event's end; past it the text goes out as verbose
	// output.
	maxOutputBuffer = 16 << 20
	// maxProbeOutput bounds what the callback plugin probe prints.
	maxProbeOutput = 16 << 20
	// maxRequirementsUnpacked bounds a requirements cache archive.
	maxRequirementsUnpacked = 8 << 30
)

// errLineTooLong is a stream line past maxStreamLine.
var errLineTooLong = fmt.Errorf("a line of the stream is longer than %d bytes", maxStreamLine)

// readLimitedLine is br.ReadBytes('\n') holding at most max bytes.
func readLimitedLine(br *bufio.Reader, max int) ([]byte, error) {
	var line []byte
	for {
		frag, err := br.ReadSlice('\n')
		if len(line)+len(frag) > max {
			return nil, errLineTooLong
		}
		line = append(line, frag...)
		if err == bufio.ErrBufferFull {
			continue
		}
		return line, err
	}
}

// limitedBuffer is a buffer that refuses to grow past max. The buffer is
// a field, not embedded: an embedded bytes.Buffer brings ReadFrom, which
// io.Copy (exec's output copy) would call instead of Write.
type limitedBuffer struct {
	buf bytes.Buffer
	max int
}

func (b *limitedBuffer) Write(p []byte) (int, error) {
	if b.buf.Len()+len(p) > b.max {
		return 0, fmt.Errorf("output longer than %d bytes", b.max)
	}
	return b.buf.Write(p)
}

func (b *limitedBuffer) Bytes() []byte  { return b.buf.Bytes() }
func (b *limitedBuffer) String() string { return b.buf.String() }

// eventUUIDRe is the event uuids used in file names: runner's are uuid4
// strings, and nothing with a separator or a dot may reach a path.
var eventUUIDRe = regexp.MustCompile(`^[A-Za-z0-9-]{1,64}$`)

// jobRel returns path relative to base, refusing one outside it.
func jobRel(base, path string) (string, error) {
	rel, err := filepath.Rel(base, path)
	if err != nil {
		return "", err
	}
	if !filepath.IsLocal(rel) {
		return "", fmt.Errorf("%s is outside %s", path, base)
	}
	return rel, nil
}

// readRootFile reads a regular file through root, at most max bytes (an
// error past that). O_NONBLOCK keeps a planted FIFO from blocking the open.
func readRootFile(root *os.Root, rel string, max int64) ([]byte, error) {
	f, err := root.OpenFile(rel, os.O_RDONLY|syscall.O_NONBLOCK, 0)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return nil, err
	}
	if !st.Mode().IsRegular() {
		return nil, fmt.Errorf("%s is not a regular file", rel)
	}
	if st.Size() > max {
		return nil, fmt.Errorf("%s is larger than %d bytes", rel, max)
	}
	b, err := io.ReadAll(io.LimitReader(f, max+1))
	if err != nil {
		return nil, err
	}
	if int64(len(b)) > max {
		return nil, fmt.Errorf("%s is larger than %d bytes", rel, max)
	}
	return b, nil
}

// readJobFile reads path, a regular file under the job directory base,
// without following anything out of base.
func readJobFile(base, path string, max int64) ([]byte, error) {
	rel, err := jobRel(base, path)
	if err != nil {
		return nil, err
	}
	root, err := os.OpenRoot(base)
	if err != nil {
		return nil, err
	}
	defer root.Close()
	return readRootFile(root, rel, max)
}

// writeJobFile writes path under the job directory base, replacing
// whatever the job left at that name rather than writing through it.
func writeJobFile(base, path string, data []byte, perm os.FileMode) error {
	rel, err := jobRel(base, path)
	if err != nil {
		return err
	}
	root, err := os.OpenRoot(base)
	if err != nil {
		return err
	}
	defer root.Close()
	if st, err := root.Lstat(rel); err == nil && !st.Mode().IsRegular() {
		if err := root.Remove(rel); err != nil {
			return err
		}
	}
	f, err := root.OpenFile(rel, os.O_WRONLY|os.O_CREATE|os.O_TRUNC|syscall.O_NONBLOCK, perm)
	if err != nil {
		return err
	}
	if _, err := f.Write(data); err != nil {
		f.Close()
		return err
	}
	return f.Close()
}

// removeJobFile removes path under the job directory base (a symlink
// itself, not its target).
func removeJobFile(base, path string) error {
	rel, err := jobRel(base, path)
	if err != nil {
		return err
	}
	root, err := os.OpenRoot(base)
	if err != nil {
		return err
	}
	defer root.Close()
	return root.Remove(rel)
}
