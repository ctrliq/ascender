package jinja

import (
	"github.com/ctrliq/ascender/internal/pystr"
)

// UndefinedKind picks the environment's undefined class.
type UndefinedKind int

const (
	// Undefined prints as "" and is false; anything else raises.
	UndefinedDefault UndefinedKind = iota
	// StrictUndefined raises on printing, iteration, truth and comparison.
	UndefinedStrict
	// ChainableUndefined also allows attribute and item lookups.
	UndefinedChainable
	// UndefinedDescriptive is the notification validator's
	// DescriptiveUndefined: a StrictUndefined whose message is the
	// undefined name alone, and whose repr raises too.
	UndefinedDescriptive
)

const (
	undefDefault     = UndefinedDefault
	undefStrict      = UndefinedStrict
	undefChainable   = UndefinedChainable
	undefDescriptive = UndefinedDescriptive
)

// Undefined is jinja2.runtime.Undefined and its subclasses.
type Undefined struct {
	kind    UndefinedKind
	hint    Value // nil: none
	obj     Value
	hasObj  bool
	name    Value
	hasName bool
	exc     string // the exception raised, UndefinedError by default
}

// newUndefined is environment.undefined(hint, obj, name, exc).
func newUndefined(kind UndefinedKind, hint string, obj Value, hasObj bool, name Value, hasName bool, exc string) *Undefined {
	u := &Undefined{kind: kind, obj: obj, hasObj: hasObj, name: name, hasName: hasName, exc: exc}
	if hint != "" {
		u.hint = hint
	}
	if u.exc == "" {
		u.exc = "UndefinedError"
	}
	if kind == undefDescriptive {
		// DescriptiveUndefined.__init__: self._undefined_hint = self._undefined_name
		u.hint = nil
		if hasName {
			u.hint = name
		}
	}
	return u
}

func (u *Undefined) message() string {
	if u.hint != nil && truth(u.hint) {
		return str(u.hint)
	}
	if !u.hasObj {
		return reprName(u.name, u.hasName) + " is undefined"
	}
	if _, isStr := u.name.(string); !isStr {
		return objectTypeRepr(u.obj) + " has no element " + reprName(u.name, u.hasName)
	}
	return pystr.Repr(objectTypeRepr(u.obj)) + " has no attribute " + reprName(u.name, u.hasName)
}

func reprName(name Value, has bool) string {
	if !has {
		return "None"
	}
	return repr(name)
}

// fail is _fail_with_undefined_error.
func (u *Undefined) fail() {
	panic(&Error{Type: u.exc, Message: u.message()})
}

func (u *Undefined) strict() bool { return u.kind == undefStrict || u.kind == undefDescriptive }

func (u *Undefined) typeName() string {
	switch u.kind {
	case undefStrict:
		return "StrictUndefined"
	case undefChainable:
		return "ChainableUndefined"
	case undefDescriptive:
		return "DescriptiveUndefined"
	}
	return "Undefined"
}

func (u *Undefined) TypeName() string { return u.typeName() }

func (u *Undefined) Module() string {
	if u.kind == undefDescriptive {
		return "__main__"
	}
	return "jinja2.runtime"
}

// Attr is __getattr__: chainable returns itself, the others raise (dunder
// names are AttributeError, a plain missing attribute).
func (u *Undefined) Attr(name string) (Value, bool) {
	if len(name) >= 4 && name[:2] == "__" && name[len(name)-2:] == "__" {
		return nil, false
	}
	if u.kind == undefChainable {
		return u, true
	}
	u.fail()
	return nil, false
}

func (u *Undefined) Repr() string {
	if u.kind == undefDescriptive {
		u.fail()
	}
	return "Undefined"
}

func (u *Undefined) Str() string {
	if u.strict() {
		u.fail()
	}
	return ""
}

func (u *Undefined) Truth() bool {
	if u.strict() {
		u.fail()
	}
	return false
}

func (u *Undefined) Len() int {
	if u.strict() {
		u.fail()
	}
	return 0
}

func (u *Undefined) Iter() Iterator {
	if u.strict() {
		u.fail()
	}
	return func() (Value, bool) { return nil, false }
}

// Item is __getitem__.
func (u *Undefined) Item(Value) (Value, bool) {
	if u.kind == undefChainable {
		return u, true
	}
	u.fail()
	return nil, false
}

func (u *Undefined) Call(*renderer, []Value, []kwarg) Value {
	u.fail()
	return nil
}

// eq is __eq__: the same undefined class.
func (u *Undefined) eq(other Value) bool {
	if u.strict() {
		u.fail()
	}
	o, ok := other.(*Undefined)
	if ok && o.strict() {
		o.fail()
	}
	return ok && o.kind == u.kind
}

// isUndefined is the defined test's negation.
func isUndefined(v Value) bool {
	_, ok := v.(*Undefined)
	return ok
}
