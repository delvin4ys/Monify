document.addEventListener("DOMContentLoaded", async function () {
  const me = await MonifyAuth.requireAuth();
  const ccy = (me.user && me.user.displayCurrency) || "IDR";

  MonifyLayout.renderSidebar(document.getElementById("sidebar-nav"), "liabilities");
  MonifyLayout.renderMobileNav(document.getElementById("mobile-nav"), "liabilities");

  const debtsList = document.getElementById("debts-list");
  const loansList = document.getElementById("loans-list");
  const errEl = document.getElementById("liab-err");

  const payModal = document.getElementById("pay-modal");
  const payAmountInput = document.getElementById("pay-amount");
  const payWalletSelect = document.getElementById("pay-wallet");
  const payDateInput = document.getElementById("pay-date");
  const payConfirmBtn = document.getElementById("pay-confirm");
  const payCancelBtn = document.getElementById("pay-cancel");
  const payErrEl = document.getElementById("pay-err");

  let activeTx = null;
  let wallets = [];

  async function loadData() {
    try {
      const data = await MonifyApi.fetchJson("/api/liabilities");
      renderList(debtsList, data.debts, "debt");
      renderList(loansList, data.loans, "loan");
      
      const totalDebts = data.debts.reduce((sum, t) => sum + (t.remainingAmount ?? t.amount), 0);
      const totalLoans = data.loans.reduce((sum, t) => sum + (t.remainingAmount ?? t.amount), 0);
      
      document.getElementById("total-debts-val").textContent = formatCurrency(totalDebts, ccy);
      document.getElementById("total-loans-val").textContent = formatCurrency(totalLoans, ccy);
    } catch (e) {
      errEl.textContent = e.message || "Gagal memuat data.";
      errEl.style.display = "block";
    }
  }
  function renderList(container, list, kind) {
    if (!list || list.length === 0) {
      container.innerHTML = `<div class="text-muted p-4 text-center border-dashed">Tidak ada ${kind === "debt" ? "hutang" : "piutang"} aktif.</div>`;
      return;
    }

    function walletLogoHtml(w) {
      if (!w) return `<span class="liab-card__logo-emoji" style="opacity: 0.3">🏦</span>`;
      
      // Prioritize official BCA logo if wallet name contains BCA
      if (w.name && w.name.toUpperCase().includes("BCA")) {
        return `<img class="liab-card__logo-img" src="/assets/logo/BCA.png" alt="" />`;
      }

      // Other wallet logos or emojis
      if (w.logo && typeof w.logo === "string" && w.logo.charAt(0) === "/") {
        return `<img class="liab-card__logo-img" src="${w.logo}" alt="" />`;
      }
      if (w.logo) {
        return `<span class="liab-card__logo-emoji">${w.logo}</span>`;
      }
      return `<span class="liab-card__logo-emoji" style="opacity: 0.3">💳</span>`;
    }

    container.innerHTML = list.map(t => {
      const remaining = t.remainingAmount ?? t.amount;
      const progress = Math.round(((t.amount - remaining) / t.amount) * 100);
      const dateStr = new Date(t.date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
      const cardClass = kind === "debt" ? "liab-card--debt" : "liab-card--loan";
      
      return `
        <div class="liab-card ${cardClass}">
          <div class="liab-card__header">
            <div class="liab-card__icon">${walletLogoHtml(t.wallet)}</div>
            <div class="liab-card__info">
              <div class="liab-card__title">${t.title}</div>
              <div class="liab-card__meta">${dateStr} • ${t.wallet.name}</div>
            </div>
          </div>
          
          <div class="liab-card__body">
            <div>
              <div class="liab-card__balance-label">Sisa Saldo</div>
              <div class="liab-card__balance-val">${formatCurrency(remaining, ccy)}</div>
            </div>
            <div class="liab-card__total">
              <div class="text-xs">Total Pinjaman</div>
              <div style="font-weight: 600; color: var(--text)">${formatCurrency(t.amount, ccy)}</div>
            </div>
          </div>
          
          <div class="liab-card__footer">
            <div class="liab-progress-container">
              <div class="liab-progress__label">
                <span>Progres Pelunasan</span>
                <span>${progress}%</span>
              </div>
              <div class="liab-progress">
                <div class="liab-progress__bar" style="width: ${progress}%"></div>
              </div>
            </div>
            
            <div class="liab-card__actions">
              <button type="button" class="btn btn--primary liab-btn--pay" onclick="window.openPaymentModal('${t.id}')">
                <span>Bayar / Cicil</span>
              </button>
              <a href="/transactions/edit?id=${t.id}" class="liab-btn--edit" title="Edit Transaksi">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </a>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  window.openPaymentModal = async function(id) {
    try {
      const res = await MonifyApi.fetchJson("/api/transactions/" + id);
      activeTx = res.transaction;
      
      document.getElementById("pay-title-hint").textContent = activeTx.title + " (Sisa: " + formatCurrency(activeTx.remainingAmount ?? activeTx.amount, ccy) + ")";
      payAmountInput.value = "";
      payDateInput.value = new Date().toISOString().slice(0, 10);
      
      if (wallets.length === 0) {
        const wRes = await MonifyApi.fetchJson("/api/wallets");
        wallets = (wRes.wallets || []).filter(w => w.active);
      }
      
      payWalletSelect.innerHTML = wallets.map(w => `<option value="${w.id}">${w.name} (${formatCurrency(w.balance, ccy)})</option>`).join("");
      
      payModal.style.display = "flex";
      payErrEl.style.display = "none";
    } catch (e) {
      alert("Gagal memuat data transaksi.");
    }
  };

  payCancelBtn.onclick = () => {
    payModal.style.display = "none";
    activeTx = null;
  };

  payConfirmBtn.onclick = async function() {
    if (!activeTx) return;
    payErrEl.style.display = "none";
    
    let amountRaw = payAmountInput.value.trim().replace(/\D/g, "");
    let amount = parseInt(amountRaw);
    
    if (!amount || amount <= 0) {
      payErrEl.textContent = "Masukkan jumlah yang valid.";
      payErrEl.style.display = "block";
      return;
    }

    try {
      await MonifyApi.fetchJson("/api/transactions/" + activeTx.id + "/payment", {
        method: "POST",
        body: JSON.stringify({
          amount: amount,
          walletId: payWalletSelect.value,
          date: payDateInput.value
        })
      });
      
      payModal.style.display = "none";
      activeTx = null;
      loadData(); // Refresh list
    } catch (e) {
      payErrEl.textContent = e.message || "Gagal memproses pembayaran.";
      payErrEl.style.display = "block";
    }
  };

  function formatCurrency(val, currency) {
    if (currency === "USD") {
      return "$" + (val / 100).toLocaleString("en-US", { minimumFractionDigits: 2 });
    }
    return "Rp " + val.toLocaleString("id-ID");
  }

  // Handle format as you type for payAmount
  payAmountInput.oninput = function() {
    let val = payAmountInput.value.replace(/\D/g, "");
    if (val) {
      payAmountInput.value = parseInt(val).toLocaleString("id-ID");
    }
  };

  await loadData();
});
