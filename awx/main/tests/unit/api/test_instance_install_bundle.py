import pytest

from awx.api.views.instance_install_bundle import der_utf8_string


@pytest.mark.parametrize(
    "value, expected",
    [
        ("", b"\x0c\x00"),
        ("a", b"\x0c\x01a"),
        ("host.example.com", b"\x0c\x10host.example.com"),
        # 0x7f is the last length the short form can express
        ("x" * 127, b"\x0c\x7f" + b"x" * 127),
        # 128 needs the long form: one length byte, announced as 0x81
        ("y" * 128, b"\x0c\x81\x80" + b"y" * 128),
        # 300 needs two length bytes, announced as 0x82
        ("z" * 300, b"\x0c\x82\x01\x2c" + b"z" * 300),
    ],
)
def test_der_utf8_string(value, expected):
    assert der_utf8_string(value) == expected


def test_der_utf8_string_counts_bytes_not_characters():
    # the hostname is encoded as UTF-8 first, so a two byte character counts twice
    assert der_utf8_string("ü") == b"\x0c\x02\xc3\xbc"
