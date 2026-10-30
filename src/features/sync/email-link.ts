// Read the verification token without opening the URL or following redirects.
// Only this project's email sign-in links are accepted (not recovery/invites).
export function emailLinkToken(input: string, projectUrl: string): string | null {
  try {
    const url = new URL(input.trim());
    const project = new URL(projectUrl);
    if (url.origin !== project.origin || url.username || url.password || url.pathname !== "/auth/v1/verify") return null;
    if (!["signup", "magiclink", "email"].includes(url.searchParams.get("type") ?? "")) return null;
    const token = url.searchParams.get("token");
    return token && /^[A-Za-z0-9_-]{1,1024}$/.test(token) ? token : null;
  } catch {
    return null;
  }
}
