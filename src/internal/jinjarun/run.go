package jinjarun

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"runtime"
	"runtime/debug"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// childArg makes a binary that calls Main run one operation and exit.
const childArg = "__jinja-run"

var ops = map[string]func([]byte) ([]byte, error){
	"notify":   Notify,
	"injector": Injector,
	"context":  Context,
	// credential is CredentialType.inject_credential's rendering, as a
	// job is prepared.
	"credential": Credential,
}

// cpuSeconds is each operation's CPU limit, as the scripts set it, and
// renderTimeout the render deadline inside it, which reports a timeout
// before the kernel ends the process (the garbage collector's threads
// spend CPU time too).
var (
	cpuSeconds    = map[string]uint64{"notify": 20, "injector": 20, "context": 10, "credential": 20}
	renderTimeout = map[string]time.Duration{"notify": 15 * time.Second, "injector": 15 * time.Second, "context": 6 * time.Second, "credential": 15 * time.Second}
)

// serving is set by Main: the running binary can run operations in a
// child process of itself.
var serving bool

// Main is called first in a binary's main. With the child argument it
// runs the operation named after it on stdin and exits; otherwise it
// marks the binary as able to run operations that way.
func Main() {
	if len(os.Args) < 3 || os.Args[1] != childArg {
		serving = true
		return
	}
	os.Exit(child(os.Args[2]))
}

func child(op string) int {
	fn, ok := ops[op]
	if !ok {
		fmt.Fprintln(os.Stderr, "unknown operation", op)
		return 2
	}
	runtime.GOMAXPROCS(2)
	limit(cpuSeconds[op])
	in, err := io.ReadAll(os.Stdin)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	out, err := fn(in)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	os.Stdout.Write(out)
	return 0
}

// limit caps the child as the scripts capped Python: CPU time, and memory
// 256MB past what it holds now (more address space, as Go reserves it
// ahead).
func limit(cpu uint64) {
	_ = syscall.Setrlimit(syscall.RLIMIT_CPU, &syscall.Rlimit{Cur: cpu, Max: cpu})
	debug.SetMemoryLimit(256 << 20)
	if b, err := os.ReadFile("/proc/self/statm"); err == nil {
		if pages, err := strconv.ParseUint(strings.Fields(string(b))[0], 10, 64); err == nil {
			as := pages*uint64(os.Getpagesize()) + 1<<30
			_ = syscall.Setrlimit(syscall.RLIMIT_AS, &syscall.Rlimit{Cur: as, Max: as})
		}
	}
}

// Run runs an operation on in (marshalled to JSON) and decodes its result
// into out: in a child process of this binary when it calls Main, so a
// runaway template meets the CPU and memory limits, else in this process.
// An exception the operation does not handle is returned as an error with
// its last traceback line.
func Run(ctx context.Context, op string, in, out any) error {
	b, err := json.Marshal(in)
	if err != nil {
		return err
	}
	var res []byte
	if serving {
		res, err = runChild(ctx, op, b)
	} else {
		res, err = ops[op](b)
	}
	if err != nil {
		return err
	}
	return json.Unmarshal(res, out)
}

func runChild(ctx context.Context, op string, in []byte) ([]byte, error) {
	exe, err := os.Executable()
	if err != nil {
		return nil, err
	}
	// The child's output is bounded too: a template can print what it
	// likes ('a' * 10**8), and the parent would hold, store and send it.
	// Past the bound the child is killed.
	cctx, cancel := context.WithCancel(ctx)
	defer cancel()
	cmd := exec.CommandContext(cctx, exe, childArg, op)
	cmd.Dir = "/"
	cmd.Env = []string{"PATH=/usr/bin:/bin"}
	cmd.Stdin = bytes.NewReader(in)
	stdout := &cappedBuffer{max: maxChildOutput, overflow: cancel}
	stderr := &cappedBuffer{max: 1 << 20, overflow: cancel}
	cmd.Stdout, cmd.Stderr = stdout, stderr
	if err := cmd.Run(); err != nil {
		if stdout.over {
			return nil, fmt.Errorf("the rendered template is longer than %d bytes", maxChildOutput)
		}
		if msg := strings.TrimSpace(stderr.String()); msg != "" {
			return nil, fmt.Errorf("%v: %s", err, lastLine(msg))
		}
		return nil, err
	}
	return stdout.Bytes(), nil
}

// maxChildOutput bounds what one template run may produce.
const maxChildOutput = 16 << 20

// cappedBuffer keeps at most max bytes; past that it calls overflow and
// refuses the write. The buffer is a field, not embedded: an embedded
// bytes.Buffer brings ReadFrom, which io.Copy (exec's output copy) would
// call instead of Write, past the limit.
type cappedBuffer struct {
	buf      bytes.Buffer
	max      int
	over     bool
	overflow func()
}

func (b *cappedBuffer) Write(p []byte) (int, error) {
	if b.buf.Len()+len(p) > b.max {
		b.over = true
		b.overflow()
		return 0, errors.New("output limit")
	}
	return b.buf.Write(p)
}

func (b *cappedBuffer) Bytes() []byte  { return b.buf.Bytes() }
func (b *cappedBuffer) String() string { return b.buf.String() }

func lastLine(s string) string {
	if i := strings.LastIndexByte(s, '\n'); i >= 0 {
		return s[i+1:]
	}
	return s
}
