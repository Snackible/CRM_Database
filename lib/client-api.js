// Browser-side helper for the JSON API. Throws an Error with the server's own message.
export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try {
    data = await res.json();
  } catch {}
  if (res.status === 401 && !path.startsWith("/api/session")) {
    window.location.href = "/login";
    throw new Error("Sign in to continue.");
  }
  if (!res.ok) {
    const err = new Error(data.error || "Something went wrong.");
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
