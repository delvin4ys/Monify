/**
 * Klien API. Semua respons berbentuk { ok, data } atau { ok:false, error:{ code, message, fields } }.
 * Setiap mutasi yang berhasil memancarkan event `monify:mutated` supaya cache data
 * finansial langsung dianggap usang (lihat store.js).
 */
export class ApiError extends Error {
  constructor(message, { code = "UNKNOWN", status = 0, fields } = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

/** Kunci idempotency: satu kunci per niat pengguna, dipakai ulang bila request dikirim ulang. */
export const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2, 12));

async function request(method, url, { body, form, key, quiet } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (key) headers["Idempotency-Key"] = key;
  let res;
  try {
    res = await fetch(url, { method, headers, credentials: "same-origin", body: form || (body !== undefined ? JSON.stringify(body) : undefined) });
  } catch {
    throw new ApiError("Tidak ada koneksi ke server. Periksa jaringan lalu coba lagi.", { code: "NETWORK" });
  }
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    /* respons bukan JSON */
  }
  if (res.status === 401 && !url.startsWith("/api/auth/")) {
    window.location.assign("/login");
    throw new ApiError("Sesi berakhir.", { code: "UNAUTHORIZED", status: 401 });
  }
  if (!res.ok || !payload || payload.ok === false) {
    const e = (payload && payload.error) || {};
    throw new ApiError(e.message || "Terjadi kesalahan. Coba lagi.", { code: e.code, status: res.status, fields: e.fields });
  }
  if (method !== "GET" && !quiet) window.dispatchEvent(new CustomEvent("monify:mutated", { detail: { url, method } }));
  return payload.data;
}

export const api = {
  get: (url) => request("GET", url),
  post: (url, body = {}, opts) => request("POST", url, { body, ...opts }),
  patch: (url, body = {}, opts) => request("PATCH", url, { body, ...opts }),
  del: (url, body, opts) => request("DELETE", url, { body, ...opts }),
  upload: (url, file, opts) => {
    const form = new FormData();
    form.append("file", file);
    return request("POST", url, { form, ...opts });
  },
};

export const qs = (params) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.set(k, v);
  const s = u.toString();
  return s ? "?" + s : "";
};
