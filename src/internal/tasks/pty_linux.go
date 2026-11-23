package tasks

import (
	"fmt"
	"os"
	"syscall"
	"unsafe"
)

// openPTY allocates a pseudo-terminal pair, the way pexpect.spawn does for
// ansible-runner: the child's stdio is the slave and we read the master.
// The ioctl numbers come from syscall, which has each architecture's
// (powerpc and mips encode them differently).
// Echo is turned off on the slave so the passwords typed into prompts are
// not repeated into the output.
func openPTY() (master, slave *os.File, err error) {
	master, err = os.OpenFile("/dev/ptmx", os.O_RDWR|syscall.O_NOCTTY|syscall.O_CLOEXEC, 0)
	if err != nil {
		return nil, nil, err
	}
	var n uint32
	if _, _, e := syscall.Syscall(syscall.SYS_IOCTL, master.Fd(), syscall.TIOCGPTN, uintptr(unsafe.Pointer(&n))); e != 0 {
		master.Close()
		return nil, nil, fmt.Errorf("TIOCGPTN: %v", e)
	}
	var unlock int32
	if _, _, e := syscall.Syscall(syscall.SYS_IOCTL, master.Fd(), syscall.TIOCSPTLCK, uintptr(unsafe.Pointer(&unlock))); e != 0 {
		master.Close()
		return nil, nil, fmt.Errorf("TIOCSPTLCK: %v", e)
	}
	slave, err = os.OpenFile(fmt.Sprintf("/dev/pts/%d", n), os.O_RDWR|syscall.O_NOCTTY|syscall.O_CLOEXEC, 0)
	if err != nil {
		master.Close()
		return nil, nil, err
	}
	// Passwords are written to this terminal and its output is kept, so
	// without echo turned off there is no terminal to use.
	var t syscall.Termios
	if _, _, e := syscall.Syscall(syscall.SYS_IOCTL, slave.Fd(), syscall.TCGETS, uintptr(unsafe.Pointer(&t))); e != 0 {
		slave.Close()
		master.Close()
		return nil, nil, fmt.Errorf("TCGETS: %v", e)
	}
	t.Lflag &^= syscall.ECHO | syscall.ECHOE | syscall.ECHOK | syscall.ECHONL
	if _, _, e := syscall.Syscall(syscall.SYS_IOCTL, slave.Fd(), syscall.TCSETS, uintptr(unsafe.Pointer(&t))); e != 0 {
		slave.Close()
		master.Close()
		return nil, nil, fmt.Errorf("TCSETS: %v", e)
	}
	return master, slave, nil
}
