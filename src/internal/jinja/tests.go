package jinja

// jinja2/tests.py's builtin tests.

import (
	"math/big"
)

var tests map[string]filterFunc

func test1(name string, body func(r *renderer, v Value) Value) filterFunc {
	return filter(pyFunc{name: name, params: []param{p("value")}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
		return body(r, a[0])
	})
}

func test2(name, other string, body func(r *renderer, v, o Value) Value) filterFunc {
	return filter(pyFunc{name: name, params: []param{p("value"), p(other)}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
		return body(r, a[0], a[1])
	})
}

// operatorTest is one of the operator module's functions (eq, lt, ...),
// which take exactly two positional arguments.
func operatorTest(name, op string) filterFunc {
	return func(r *renderer, f *frame, v Value, args []Value, kw []kwarg) Value {
		if len(kw) > 0 {
			typeError(name + "() takes no keyword arguments")
		}
		if len(args) != 1 {
			typeError(name + " expected 2 arguments, got " + intStr(int64(len(args)+1)))
		}
		return compareOp(op, v, args[0])
	}
}

func isSameObject(a, b Value) bool {
	switch x := a.(type) {
	case nil, bool:
		return a == b
	case int64:
		y, ok := b.(int64)
		return ok && x == y && x >= -5 && x <= 256
	case string:
		y, ok := b.(string)
		return ok && x == y
	case *List, *Dict, *Undefined:
		return a == b
	}
	return false
}

func init() {
	tests = map[string]filterFunc{
		"odd": test1("test_odd", func(r *renderer, v Value) Value {
			return equal(mod(v, int64(2)), int64(1))
		}),
		"even": test1("test_even", func(r *renderer, v Value) Value {
			return equal(mod(v, int64(2)), int64(0))
		}),
		"divisibleby": test2("test_divisibleby", "num", func(r *renderer, v, o Value) Value {
			failUndefined(v, o)
			return equal(mod(v, o), int64(0))
		}),
		"defined":   test1("test_defined", func(r *renderer, v Value) Value { return !isUndefined(v) }),
		"undefined": test1("test_undefined", func(r *renderer, v Value) Value { return isUndefined(v) }),
		"filter": filter(pyFunc{name: "test_filter", hidden: true, params: []param{p("value")}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			s, ok := a[0].(string)
			if !ok {
				_ = hashKey(a[0])
				return false
			}
			_, found := filters[s]
			return found
		}),
		"test": filter(pyFunc{name: "test_test", hidden: true, params: []param{p("value")}}, func(r *renderer, f *frame, a, _ []Value, _ []kwarg) Value {
			s, ok := a[0].(string)
			if !ok {
				_ = hashKey(a[0])
				return false
			}
			_, found := tests[s]
			return found
		}),
		"none":    test1("test_none", func(r *renderer, v Value) Value { return v == nil }),
		"boolean": test1("test_boolean", func(r *renderer, v Value) Value { _, ok := v.(bool); return ok }),
		"false":   test1("test_false", func(r *renderer, v Value) Value { b, ok := v.(bool); return ok && !b }),
		"true":    test1("test_true", func(r *renderer, v Value) Value { b, ok := v.(bool); return ok && b }),
		"integer": test1("test_integer", func(r *renderer, v Value) Value {
			switch v.(type) {
			case int64, *big.Int:
				return true
			}
			return false
		}),
		"float": test1("test_float", func(r *renderer, v Value) Value { _, ok := v.(float64); return ok }),
		"lower": test1("test_lower", func(r *renderer, v Value) Value {
			return strMethod(r, str(v), "islower", argList{fn: "islower"})
		}),
		"upper": test1("test_upper", func(r *renderer, v Value) Value {
			return strMethod(r, str(v), "isupper", argList{fn: "isupper"})
		}),
		"string": test1("test_string", func(r *renderer, v Value) Value { _, ok := asStr(v); return ok }),
		"mapping": test1("test_mapping", func(r *renderer, v Value) Value {
			_, ok := v.(*Dict)
			return ok
		}),
		"number": test1("test_number", func(r *renderer, v Value) Value {
			if _, ok := v.(*Complex); ok {
				return true
			}
			return isNumber(v)
		}),
		"sequence": test1("test_sequence", func(r *renderer, v Value) Value {
			ok := func() (res bool) {
				defer func() {
					if recover() != nil {
						res = false
					}
				}()
				length(v)
				switch v.(type) {
				case string, Markup, *List, Tuple, *Dict, Range, *Undefined, itemer:
					return true
				}
				return false
			}()
			return ok
		}),
		"iterable": test1("test_iterable", func(r *renderer, v Value) Value {
			if u, ok := v.(*Undefined); ok && u.strict() {
				u.fail()
			}
			return isIterable(v)
		}),
		"callable": func(r *renderer, f *frame, v Value, args []Value, kw []kwarg) Value {
			builtin1("callable", v, args, kw)
			switch v.(type) {
			case callable:
				return true
			}
			return false
		},
		"sameas": test2("test_sameas", "other", func(r *renderer, v, o Value) Value { return isSameObject(v, o) }),
		"escaped": test1("test_escaped", func(r *renderer, v Value) Value {
			switch x := v.(type) {
			case Markup:
				return true
			case *Undefined:
				return x.kind == undefChainable
			case interface{ HTML() string }:
				return true
			}
			return false
		}),
		"in": test2("test_in", "seq", func(r *renderer, v, o Value) Value { return contains(o, v) }),
	}
	for _, op := range []struct {
		names  []string
		fn, op string
	}{
		{[]string{"==", "eq", "equalto"}, "eq", "eq"},
		{[]string{"!=", "ne"}, "ne", "ne"},
		{[]string{">", "gt", "greaterthan"}, "gt", "gt"},
		{[]string{">=", "ge"}, "ge", "gteq"},
		{[]string{"<", "lt", "lessthan"}, "lt", "lt"},
		{[]string{"<=", "le"}, "le", "lteq"},
	} {
		for _, n := range op.names {
			tests[n] = operatorTest(op.fn, op.op)
		}
	}
}
