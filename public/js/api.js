(function () {
  window.MonifyApi = {
    async fetchJson(url, opts) {
      var merged = Object.assign({ credentials: "include", cache: "no-store" }, opts || {});
      if (merged.body && typeof merged.body === "string") {
        merged.headers = Object.assign({}, merged.headers || {}, {
          "Content-Type": "application/json",
        });
      }
      var res = await fetch(url, merged);
      if (res.status === 401) {
        window.location.href = "/login";
        throw new Error("Unauthorized");
      }
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) {
        throw new Error(data.error || res.statusText);
      }
      return data;
    },
  };
})();
