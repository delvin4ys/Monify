(function () {
  window.MonifyAuth = {
    async requireAuth() {
      const r = await fetch("/api/auth/me", { credentials: "include" });
      if (!r.ok) {
        window.location.href = "/login";
        throw new Error("Unauthorized");
      }
      return r.json();
    },
    async redirectIfAuthed() {
      const r = await fetch("/api/auth/me", { credentials: "include" });
      if (r.ok) {
        window.location.href = "/dashboard";
      }
    },
  };
})();
