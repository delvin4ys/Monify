/**
 * Halaman depan: hero slides + animasi muncul saat di-scroll.
 * Tanpa dependency. Semua konten tetap terbaca bila skrip ini gagal dimuat.
 */
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ——— Hero slides ———
  var root = document.querySelector("[data-slider]");
  if (root) {
    var track = root.querySelector("[data-track]");
    var slides = [].slice.call(root.querySelectorAll("[data-slide]"));
    var dots = [].slice.call(root.querySelectorAll("[data-dot]"));
    var pauseBtn = root.querySelector("[data-pause]");
    var INTERVAL = 6500;
    var index = 0;
    var timer = null;
    var userPaused = reduce; // dengan "kurangi gerakan", slide hanya berganti atas perintah pengguna
    var hovering = false;

    root.style.setProperty("--slide-ms", INTERVAL + "ms");

    function show(i) {
      index = (i + slides.length) % slides.length;
      track.style.transform = "translateX(" + -index * 100 + "%)";
      slides.forEach(function (s, n) {
        var on = n === index;
        s.classList.toggle("is-active", on);
        // Slide yang tidak tampil tidak boleh menerima fokus keyboard maupun dibaca pembaca layar.
        if (on) s.removeAttribute("inert");
        else s.setAttribute("inert", "");
        s.setAttribute("aria-hidden", on ? "false" : "true");
      });
      dots.forEach(function (d, n) {
        d.setAttribute("aria-selected", n === index ? "true" : "false");
        d.tabIndex = n === index ? 0 : -1;
      });
    }

    function stop() {
      if (timer) clearInterval(timer);
      timer = null;
      root.classList.remove("is-auto");
    }
    function start() {
      stop();
      if (userPaused || hovering || document.hidden) return;
      root.classList.add("is-auto");
      timer = setInterval(function () {
        show(index + 1);
      }, INTERVAL);
    }
    /** Pindah slide atas perintah pengguna, lalu mulai ulang hitungan otomatis. */
    function go(i) {
      stop();
      show(i);
      // Paksa animasi pengisi titik mulai dari awal untuk slide yang baru.
      void root.offsetWidth;
      start();
    }

    root.querySelector("[data-prev]").addEventListener("click", function () {
      go(index - 1);
    });
    root.querySelector("[data-next]").addEventListener("click", function () {
      go(index + 1);
    });
    dots.forEach(function (d, n) {
      d.addEventListener("click", function () {
        go(n);
      });
    });
    if (pauseBtn) {
      pauseBtn.addEventListener("click", function () {
        userPaused = !userPaused;
        pauseBtn.setAttribute("aria-pressed", String(userPaused));
        pauseBtn.setAttribute("aria-label", userPaused ? "Lanjutkan pergantian slide otomatis" : "Jeda pergantian slide otomatis");
        start();
      });
    }

    root.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") go(index - 1);
      else if (e.key === "ArrowRight") go(index + 1);
    });
    root.addEventListener("mouseenter", function () {
      hovering = true;
      stop();
    });
    root.addEventListener("mouseleave", function () {
      hovering = false;
      start();
    });
    root.addEventListener("focusin", stop);
    root.addEventListener("focusout", function (e) {
      if (!root.contains(e.relatedTarget)) start();
    });
    document.addEventListener("visibilitychange", start);

    // Geser dengan jari.
    var x0 = null;
    var y0 = null;
    root.addEventListener(
      "touchstart",
      function (e) {
        x0 = e.touches[0].clientX;
        y0 = e.touches[0].clientY;
        stop();
      },
      { passive: true }
    );
    root.addEventListener(
      "touchend",
      function (e) {
        if (x0 === null) return;
        var dx = e.changedTouches[0].clientX - x0;
        var dy = e.changedTouches[0].clientY - y0;
        x0 = null;
        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) go(index + (dx < 0 ? 1 : -1));
        else start();
      },
      { passive: true }
    );

    show(0);
    start();
  }

  // ——— Muncul saat di-scroll ———
  var items = [].slice.call(document.querySelectorAll("[data-reveal]"));
  if (items.length && !reduce && "IntersectionObserver" in window) {
    document.documentElement.classList.add("js-reveal");
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          en.target.classList.add("is-in");
          io.unobserve(en.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );
    items.forEach(function (el) {
      // Kartu dalam satu baris muncul berurutan.
      var sibs = el.parentElement ? [].slice.call(el.parentElement.children).filter(function (c) { return c.hasAttribute("data-reveal"); }) : [];
      var pos = sibs.indexOf(el);
      if (pos > 0) el.style.setProperty("--reveal-delay", (pos % 3) * 90 + "ms");
      io.observe(el);
    });
  }
})();
