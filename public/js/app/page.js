/**
 * Pola pemuatan data halaman — memisahkan tiga state dengan tegas:
 *   loading  -> skeleton yang menyerupai layout akhir (hanya bila belum ada data)
 *   error    -> pesan + tombol coba lagi (hanya bila tidak ada data untuk ditampilkan)
 *   data     -> render(data); state kosong ditentukan oleh render itu sendiri
 */
import { mount, errorState } from "./ui.js";
import { watch, peek } from "./store.js";

/**
 * @param {HTMLElement} el
 * @param {() => string} getUrl  URL data saat ini (boleh berubah saat filter berganti)
 * @param {{ skeleton: () => any, render: (data: any) => void }} opts
 */
export function live(el, getUrl, { skeleton, render }) {
  let stop = null;
  let shownUrl = null;
  const load = () => {
    if (stop) stop();
    const url = getUrl();
    const same = url === shownUrl;
    if (peek(url) === undefined && !same) mount(el, skeleton());
    stop = watch(
      url,
      (data) => {
        shownUrl = url;
        render(data);
      },
      (err) => {
        shownUrl = null;
        mount(el, errorState(err));
        const retry = el.querySelector("[data-retry]");
        if (retry) retry.onclick = load;
      },
      { silent: same }
    );
  };
  load();
  return { refresh: load, destroy: () => stop && stop() };
}

/** Gabungkan beberapa bagian halaman menjadi satu objek { refresh, destroy }. */
export function combine(...parts) {
  const list = parts.filter(Boolean);
  return {
    refresh: () => list.forEach((p) => p.refresh && p.refresh()),
    destroy: () => list.forEach((p) => p.destroy && p.destroy()),
  };
}
