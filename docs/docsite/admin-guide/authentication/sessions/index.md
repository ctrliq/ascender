---
title: Session Timeouts and Limits
description: Change the idle timeout for Ascender login sessions and limit the number of simultaneous sessions per user.
weight: 6
---

## Changing the Default Timeout for Authentication

A browser session ends when the user has been idle for longer than the idle timeout, and the user must then log in again. Each request the browser makes pushes the end of the session forward. The timeout, in seconds, is 1800 (30 minutes) by default and can be changed in the Settings screen of the Ascender user interface. It does not apply to OAuth 2 tokens, whose lifetime is set separately (see [Token-based authentication](../oauth2-tokens)).

1. Click **Settings** from the left navigation bar.
2. Click **Miscellaneous Authentication settings** under the System settings.
3. Click **Edit**.
4. Enter the timeout period in seconds in the **Idle Time Force Log Out** text field.

   ![Miscellaneous Authentication settings showing the Idle Time Force Log Out field where you can adjust the idle timeout](/assets/images/configure-ascender-system-timeout.webp)

5. Click **Save** to apply your changes.

<Hint type="note">

If you are accessing Ascender directly and are having trouble getting your authentication to stay, in that you have to keep logging in over and over, try clearing your web browser's cache. In situations like this, it is often found that the authentication token has been cached in the browser session and must be cleared.

</Hint>

## Working with Session Limits

Setting a session limit allows administrators to limit the number of simultaneous sessions per user.

A session is created for each browser that a user uses to log in, which forces the user to log out any extra sessions after they exceed the administrator-defined maximum.

Session limits may be important, depending on your particular setup. For example, perhaps you only want a single user on your system with a single login per device (where the user could log in on his work laptop, phone, or home computer). In such a case, you would want to create a session limit equal to 1 (one). If the user logs in on his laptop, for example, then logs in using his phone, his laptop session expires (times out) and only the login on the phone persists. Proactive session limits will kick the user out when the session is idle. The default value is **-1**, which disables the maximum sessions allowed altogether, meaning you can have as many sessions without an imposed limit.

While session counts can be very limited, they can also be expanded to cover as many session logins as are needed by your organization.

When a login takes a user over the limit, that user's oldest sessions are ended. A browser whose session was ended returns to the login page at its next request, without a message saying why.

To make changes to your session limits, navigate to the **Miscellaneous Authentication settings** of the Settings menu and edit the **Maximum Number Of Simultaneous Logged In Sessions** setting or use the [browsable API](/user-guide/rest-api#browsable-api) if you are comfortable with making REST requests.

<Hint type="note">

To make the best use of session limits, disable `AUTH_BASIC_ENABLED` by changing the value to `False`, as it falls outside of the scope of session limit enforcement. Alternatively, in the System Settings of the Ascender UI, toggle the **Enable HTTP Basic Auth** to off.

</Hint>

![Miscellaneous Authentication settings with the Maximum number of simultaneous logged in sessions field and the Enable HTTP Basic Auth toggle highlighted](/assets/images/configure-ascender-session-limits.webp)
