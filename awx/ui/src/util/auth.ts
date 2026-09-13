export function isAuthenticated(cookie: string | null | undefined): boolean {
  if (!cookie) {
    return false;
  }
  const cookies = cookie.split(';');
  for (let i = 0; i < cookies.length; i++) {
    const [key, value] = (cookies[i] as string).trim().split('=');
    if (key === 'userLoggedIn') {
      return value === 'true';
    }
  }
  return false;
}

export function getCurrentUserId(
  cookie: string | null | undefined
): number | null {
  if (!isAuthenticated(cookie)) {
    return null;
  }
  const name = 'current_user';
  let userId: number | null = null;
  if (cookie && cookie !== '') {
    const cookies = cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
      const parsedCookie = (cookies[i] as string).trim();
      if (parsedCookie.substring(0, name.length + 1) === `${name}=`) {
        userId = parseUserId(
          decodeURIComponent(parsedCookie.substring(name.length + 1))
        );
        break;
      }
    }
  }
  return userId;
}

function parseUserId(decodedUserData: string): number {
  const userData = JSON.parse(decodedUserData) as { id: number };
  return userData.id;
}
