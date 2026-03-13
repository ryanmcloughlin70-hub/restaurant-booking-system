export async function staffFetch(url: string, options: RequestInit = {}) {
  const res = await fetch(url, {
    ...options,
    credentials: "include",
  });

  if (res.status === 401) {
    let reason = "unauthorized";

    try {
      const data = await res.clone().json();

      if (data?.error === "SESSION_EXPIRED") {
        reason = "expired";
      }
    } catch {
      // ignore if response isn't JSON
    }

    if (window.location.pathname !== "/staff") {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/staff?next=${next}&reason=${reason}`;
    }

    throw new Error(reason === "expired" ? "SESSION_EXPIRED" : "UNAUTHORIZED");
  }

  return res;
}
