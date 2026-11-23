package jinja

// Error is a Python exception raised while compiling or rendering a
// template: Type is the exception class's name (TemplateSyntaxError,
// UndefinedError, SecurityError, TypeError, ...) and Message its str().
// Syntax errors carry only their message, as Jinja's translated syntax
// errors do.
type Error struct {
	Type    string
	Message string
	Lineno  int
}

func (e *Error) Error() string { return e.Message }

// IsSyntaxError is isinstance(e, TemplateSyntaxError), which includes
// TemplateAssertionError.
func (e *Error) IsSyntaxError() bool {
	return e.Type == "TemplateSyntaxError" || e.Type == "TemplateAssertionError"
}

func syntaxError(msg string, lineno int) *Error {
	return &Error{Type: "TemplateSyntaxError", Message: msg, Lineno: lineno}
}

func assertionError(msg string, lineno int) *Error {
	return &Error{Type: "TemplateAssertionError", Message: msg, Lineno: lineno}
}
