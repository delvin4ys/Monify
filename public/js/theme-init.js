/* Dijalankan sinkron di <head> agar tema terpasang sebelum render pertama (tanpa kedip). */
(function () {
  var pref = "system";
  try {
    pref = localStorage.getItem("monify-theme") || "system";
  } catch (e) {}
  var light = pref === "light" || (pref === "system" && window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches);
  document.documentElement.setAttribute("data-theme", light ? "light" : "dark");
})();
