import { html, mount, skRows, emptyState } from "../ui.js";
import { live } from "../page.js";

export default function admin(view) {
  const part = live(view, () => "/api/admin/users", {
    skeleton: () => html`<div class="card card--flush" aria-busy="true">${skRows(6)}</div>`,
    render(data) {
      mount(
        view,
        html`<div class="stack">
          <p class="muted">${data.total} pengguna terdaftar. Halaman ini hanya menampilkan jumlah data per akun — isi data keuangan pengguna lain tidak pernah ditampilkan.</p>
          <section class="card card--flush">
            ${data.users.length
              ? html`<div class="table-wrap"><table class="data" style="margin:0"><thead><tr><th>Email</th><th>Nama</th><th>Terdaftar</th><th>Dompet</th><th>Kategori</th><th>Transaksi</th></tr></thead>
                  <tbody>${data.users.map(
                    (u) => html`<tr><td>${u.email}</td><td style="text-align:left">${u.name || "—"}</td><td>${new Date(u.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</td>
                      <td class="num">${u._count.wallets}</td><td class="num">${u._count.categories}</td><td class="num">${u._count.transactions}</td></tr>`
                  )}</tbody></table></div>`
              : emptyState({ title: "Belum ada pengguna" })}
          </section>
        </div>`
      );
    },
  });
  return part;
}
