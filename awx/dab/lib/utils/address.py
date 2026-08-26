import dataclasses
import enum
import ipaddress
import re
import typing


class AddressType(enum.Enum):
    """
    AddressType provides an abstracted identification of the determined kind of
    an address.  The abstraction eliminates cohesion between the provided
    address identification functionality and its clients.

    The type allows a client which may be configured with any of the supported
    types to identify which type was specified and perform necessary runtime
    handling.

    An example would be a client which uses the values from its configuration
    to construct URLs and which is configured using raw IPv6 addreesses. The
    client needs to be able to determine the address type to know what
    processing (such as enclosing IPv6 addresses in []s) is needed to
    successfully utilize it.
    """

    HOSTNAME = "hostname"
    IPv4 = "ipv4"
    IPv6 = "ipv6"
    UNKNOWN = "unknown"


@dataclasses.dataclass(frozen=True)
class AddressTypeResponse(object):
    """
    AddressTypeResponse is returned from the classify address method describing
    the detected address including splitting it into address and port parts as
    appicable.

    Strings are used for the address and port so as to minimize changes to
    existing code to facilitate use of the classification functionality
    provided.
    """

    type: AddressType
    address: str
    port: typing.Optional[str] = None

    @property
    def ipv6_bracketed(self):
        """
        IPv6 addresses are stored without brackets in the address field.
        If the type of this instance is AddressType.IPv6 the method will return
        the address enclosed in brackets.
        If the type is not AddressType.IPv6 it will return None.
        """
        if self.type != AddressType.IPv6:
            return None
        return f"[{self.address}]"


def _classify_base_address(address: str) -> AddressTypeResponse:
    """
    Categorizes a given string as IPv4, IPv6, hostname, or unknown.

    Args:
        address: The string to categorize.

    Returns:
        A value of AddressTypeResponse indicating the classified address.
    """
    try:
        ipaddress.IPv4Address(address)
        return AddressTypeResponse(AddressType.IPv4, address)
    except ipaddress.AddressValueError:
        pass

    try:
        ipaddress.IPv6Address(address)
        return AddressTypeResponse(AddressType.IPv6, address)
    except ipaddress.AddressValueError:
        pass

    # Basic hostname check (can be expanded for more rigorous validation)
    # The original regex was generated via Gemini AI.
    # It was modified to require the first character be alphabetic to eliminate
    # a string composed of nothing but digits be recognized as a hostname.
    #
    # The regex may appear more complicated than it actually is.
    #
    # First you can ignore the "?:" which simply makes the group in which it
    # appears non-capturing.
    #
    # Second you can conceptually collapse the portions delineated by "{" and
    # "}" to "*". The bracketed portions simply put a limit on minimum and
    # maximum lengths of the preceding construct.
    #
    # With the two above changes you'll see that there's effectively only one
    # construct in the regex:
    #
    #   [a-zA-Z]([a-zA-Z0-9-]*[a-zA-Z0-9])?
    #
    # It's second usage simply includes the requirement for a leading "." and
    # allows it to be specified zero or more times.
    if re.match(r"^[a-zA-Z](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$", address):
        return AddressTypeResponse(AddressType.HOSTNAME, address)

    return AddressTypeResponse(AddressType.UNKNOWN, address)


def _classify_address(address: str) -> AddressTypeResponse:
    """
    Categorizes a given string as IPv4, IPv6, hostname, or unknown.

    Args:
        address: The string to categorize.

    Returns:
        A value of AddressTypeResponse indicating the classified address.
    """
    # We could be dealing with an IPv6 address wrapped in [].
    # If that is the case we want to classify the address itself.

    # Check that the address is at least two characters long.
    if (len(address) >= 2) and (address[0] == "[") and (address[-1] == "]"):
        response = _classify_base_address(address[1:-1])

        # We only recognize an IPv6 address wrapped in []s as valid.
        # Regardless of the contents being identified if it is not an IPv6
        # address we treat it as unknown.
        if response.type == AddressType.IPv6:
            return response
        return AddressTypeResponse(AddressType.UNKNOWN, address)

    return _classify_base_address(address)


def classify_address(address: str) -> AddressTypeResponse:
    """
    Categorizes a given string with optional ":<port>" suffix as IPv4, IPv6,
    hostname, or unknown.

    Args:
        address: The string to categorize.

    Returns:
        A value of AddressTypeResponse indicating the classified address.
    """
    response = _classify_address(address)
    if response.type != AddressType.UNKNOWN:
        # A known type with no port.
        return response

    # Split into potential address and port and classify the address.
    (split_address, _, port) = address.rpartition(":")
    response = _classify_address(split_address)
    if response.type != AddressType.UNKNOWN:
        # A known type with a port.
        return AddressTypeResponse(response.type, response.address, port)

    # An unknown address type.
    return AddressTypeResponse(AddressType.UNKNOWN, address)
