package tasks

import (
	"syscall"
	"testing"
	"unsafe"
)

// openPTY gives a working terminal pair with echo off on the slave.
func TestOpenPTY(t *testing.T) {
	master, slave, err := openPTY()
	if err != nil {
		t.Skipf("no pseudo-terminal here: %v", err)
	}
	defer master.Close()
	defer slave.Close()
	var tio syscall.Termios
	if _, _, e := syscall.Syscall(syscall.SYS_IOCTL, slave.Fd(), syscall.TCGETS, uintptr(unsafe.Pointer(&tio))); e != 0 {
		t.Fatalf("TCGETS: %v", e)
	}
	if tio.Lflag&syscall.ECHO != 0 {
		t.Error("echo is on")
	}
	if _, err := slave.Write([]byte("x\n")); err != nil {
		t.Fatal(err)
	}
	buf := make([]byte, 16)
	n, err := master.Read(buf)
	if err != nil || n == 0 {
		t.Fatalf("read from master: %d, %v", n, err)
	}
}
