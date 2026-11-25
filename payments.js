(() => {
  const storageKey = "ve-collection-payment-tracker-v1";
  const quoteStorageKey = "ve-collection-payment-tracker-quotes-v1";
  const travellerList = document.querySelector("#traveller-list");
  const emptyState = document.querySelector("#empty-state");
  const dialog = document.querySelector("#traveller-dialog");
  const form = document.querySelector("#traveller-form");
  const installmentFields = document.querySelector("#installment-fields");
  const installmentTemplate = document.querySelector("#installment-template");
  const formError = document.querySelector("#form-error");
  const searchInput = document.querySelector("#search-travellers");
  const quoteFile = document.querySelector("#quote-file");
  const shareDialog = document.querySelector("#share-dialog");
  const shareForm = document.querySelector("#share-form");
  let travellers = loadTravellers();
  let quotes = loadQuotes();
  let editingId = null;
  let duplicateSource = null;
  let preferredQuoteId = travellers[0]?.quoteId || quotes[0]?.id || "";

  function loadTravellers() {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
      return Array.isArray(parsed) ? parsed.filter(isValidRecord) : [];
    } catch {
      return [];
    }
  }

  function isValidRecord(record) {
    return record && typeof record === "object" && typeof record.name === "string" && Array.isArray(record.installments);
  }

  function duplicateTravellerRecord(traveller) {
    const copy = JSON.parse(JSON.stringify(traveller));
    copy.id = "";
    copy.name = "";
    return copy;
  }

  function loadQuotes() {
    try {
      const parsed = JSON.parse(localStorage.getItem(quoteStorageKey) || "[]");
      return Array.isArray(parsed) ? parsed.filter((quote) => quote && typeof quote.id === "string" && typeof quote.reference === "string" && typeof quote.title === "string") : [];
    } catch {
      return [];
    }
  }

  function saveQuotes() {
    try {
      localStorage.setItem(quoteStorageKey, JSON.stringify(quotes));
      return true;
    } catch {
      announce("This browser could not save the quote. Check available storage and try again.");
      return false;
    }
  }

  function saveTravellers() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(travellers));
      return true;
    } catch {
      showError("This browser could not save the record. Check available storage and try again.");
      return false;
    }
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character]);
  }

  function cents(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number * 100) : 0;
  }

  function money(amountCents, currency) {
    const value = amountCents / 100;
    try {
      return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(value);
    } catch {
      return `${currency || ""} ${value.toFixed(2)}`.trim();
    }
  }

  function dateLabel(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return "Not set";
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? "Not set" : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date);
  }

  function validHttpsUrl(value) {
    if (!value) return false;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && Boolean(url.hostname);
    } catch {
      return false;
    }
  }

  function quoteIdFor(reference) {
    return String(reference || "").trim().toLocaleLowerCase();
  }

  function parseQuoteAmount(value) {
    const text = String(value || "").trim();
    const match = text.match(/\d[\d,]*(?:\.\d{1,2})?/);
    if (!match) return "";
    const amount = Number(match[0].replace(/,/g, ""));
    return Number.isFinite(amount) && amount >= 0 ? amount.toFixed(2) : "";
  }

  function quotePageUrl(siteUrl, reference) {
    if (!validHttpsUrl(siteUrl)) return "";
    try {
      const base = new URL(siteUrl);
      base.search = "";
      base.hash = "";
      base.pathname = `${base.pathname.replace(/\/$/, "")}/quote-${String(reference).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "client-quote"}.html`;
      return base.href;
    } catch {
      return "";
    }
  }

  function refreshQuoteOptions(selectedId = form.elements.quoteId.value) {
    const select = form.elements.quoteId;
    select.replaceChildren(new Option("Import or select a quote…", ""));
    quotes.forEach((quote) => select.add(new Option(`${quote.reference} · ${quote.title}`, quote.id)));
    select.value = quotes.some((quote) => quote.id === selectedId) ? selectedId : "";
    applySelectedQuote();
  }

  function applySelectedQuote() {
    const quote = quotes.find((item) => item.id === form.elements.quoteId.value);
    form.elements.quoteRef.value = quote?.reference || "";
    form.elements.quoteTitle.value = quote?.title || "";
    form.elements.quoteUrl.value = quote?.quoteUrl || "";
    if (quote?.currency) form.elements.currency.value = quote.currency;
    if (quote?.terms && !form.elements.terms.value.trim()) form.elements.terms.value = quote.terms;
    const previousPrefill = form.dataset.quotePrefill || "";
    if (!form.elements.total.value || (previousPrefill && form.elements.total.value === previousPrefill)) {
      form.elements.total.value = quote?.originalPerPerson || "";
    }
    form.dataset.quotePrefill = quote?.originalPerPerson || "";
    const priceNote = document.querySelector("#quote-price-note");
    if (quote?.originalPerPerson) {
      priceNote.textContent = `Imported per-person quote amount: ${money(cents(quote.originalPerPerson), quote.currency || form.elements.currency.value)}. The agreed total above is editable; update the instalments to match any agreed change.`;
      priceNote.hidden = false;
    } else if (quote?.originalPerPersonText) {
      priceNote.textContent = `Original per-person quote amount: ${quote.originalPerPersonText}. Enter the traveller’s agreed total below; the quoted group total is not applied automatically.`;
      priceNote.hidden = false;
    } else {
      priceNote.textContent = "No per-person amount could be read from this quote. Enter the agreed total for this traveller.";
      priceNote.hidden = !quote;
    }
    refreshScheduleTotal();
  }

  async function importQuote(file) {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      announce("Choose a quote file under 50 MB.");
      return;
    }
    try {
      const source = await file.text();
      let data;
      if (/^\s*</.test(source)) {
        const quoteData = source.match(/<script\b(?=[^>]*\bid=["']velvet-quote-data["'])[^>]*>([\s\S]*?)<\/script\s*>/i);
        if (!quoteData) throw new Error("The selected HTML does not contain a valid The VE Collection quote record.");
        data = JSON.parse(quoteData[1]);
        if (data.format !== "velvet-edge-client-quote") throw new Error("The selected page is not a valid The VE Collection quote.");
      } else {
        data = JSON.parse(source);
      }
      const reference = String(data.reference || "").trim();
      const title = String(data.title || "").trim();
      if (!reference || !title) throw new Error("This quote file is missing its quote reference or proposal title.");
      const id = quoteIdFor(reference);
      const currency = /^[A-Za-z]{3}$/.test(data.currency || "") ? data.currency.toUpperCase() : "";
      const quoteTerms = [
        data.bookingTerms ? `Booking terms\n${data.bookingTerms}` : "",
        data.paymentTerms ? `Payment terms\n${data.paymentTerms}` : "",
      ].filter(Boolean).join("\n\n");
      const quote = {
        id,
        reference,
        title,
        destination: String(data.location || "").trim(),
        currency,
        originalPerPerson: parseQuoteAmount(data.perPerson),
        originalPerPersonText: String(data.perPerson || "").trim(),
        quoteUrl: quotePageUrl(data.siteUrl, reference),
        terms: quoteTerms,
      };
      const existingIndex = quotes.findIndex((item) => item.id === id);
      if (existingIndex >= 0) quotes[existingIndex] = quote;
      else quotes.unshift(quote);
      if (!saveQuotes()) return;
      preferredQuoteId = id;
      refreshQuoteOptions(id);
      openEditor();
      announce(`Quote ${reference} imported. Add a traveller to attach them to this quote.`);
    } catch (error) {
      announce(error.message || "That file could not be read as a valid The VE Collection quote or draft.");
    } finally {
      quoteFile.value = "";
    }
  }

  function getBalances(traveller) {
    const total = cents(traveller.total);
    const paid = traveller.installments.reduce((sum, installment) => sum + Math.min(cents(installment.paid), cents(installment.amount)), 0);
    return { total, paid, outstanding: Math.max(0, total - paid) };
  }

  function installmentState(installment) {
    const amount = cents(installment.amount);
    const paid = Math.min(cents(installment.paid), amount);
    if (paid >= amount) return { label: "Paid", className: "paid", outstanding: 0 };
    const overdue = Boolean(installment.dueDate && installment.dueDate < localToday());
    if (overdue) return { label: paid > 0 ? "Overdue · partial" : "Overdue", className: "overdue", outstanding: amount - paid };
    if (paid > 0) return { label: "Partial", className: "partial", outstanding: amount - paid };
    return { label: "Unpaid", className: "", outstanding: amount };
  }

  function localToday() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  function travellerState(traveller) {
    const balance = getBalances(traveller);
    const overdue = traveller.installments.some((installment) => installmentState(installment).className === "overdue");
    if (balance.outstanding === 0) return { label: "Paid", className: "paid" };
    if (overdue) return { label: "Overdue", className: "overdue" };
    if (balance.paid > 0) return { label: "Part-paid", className: "partial" };
    return { label: "Unpaid", className: "" };
  }

  function currencyGroups(key) {
    const totals = new Map();
    travellers.forEach((traveller) => {
      const amount = getBalances(traveller)[key];
      totals.set(traveller.currency, (totals.get(traveller.currency) || 0) + amount);
    });
    if (totals.size === 0) return "—";
    return [...totals.entries()].map(([currency, amount]) => money(amount, currency)).join(" · ");
  }

  function nextDue(traveller) {
    const upcoming = traveller.installments
      .filter((installment) => installmentState(installment).outstanding > 0)
      .map((installment) => installment.dueDate)
      .filter(Boolean)
      .sort();
    return upcoming.length ? dateLabel(upcoming[0]) : "No balance due";
  }

  function installmentRows(traveller) {
    return traveller.installments.map((installment, index) => {
      const state = installmentState(installment);
      const url = validHttpsUrl(installment.url) ? installment.url : "";
      const linkActions = url
        ? `<button class="mini-action" type="button" data-action="copy-link" data-traveller="${escapeHtml(traveller.id)}" data-installment="${index}">Copy link</button><button class="mini-action" type="button" data-action="open-link" data-traveller="${escapeHtml(traveller.id)}" data-installment="${index}">Open link</button>`
        : `<span class="muted-cell">No link added</span>`;
      return `<tr><td>${escapeHtml(installment.label)}</td><td>${money(cents(installment.amount), traveller.currency)}</td><td>${dateLabel(installment.dueDate)}</td><td>${money(cents(installment.paid), traveller.currency)}${installment.paidDate ? `<br><small>Received ${dateLabel(installment.paidDate)}</small>` : ""}${installment.reference ? `<br><small>Ref ${escapeHtml(installment.reference)}</small>` : ""}</td><td><span class="status-pill status-pill--${state.className}">${escapeHtml(state.label)}</span></td><td class="schedule-actions">${linkActions}</td></tr>`;
    }).join("");
  }

  function adjustmentHistory(traveller) {
    const entries = Array.isArray(traveller.adjustments) ? traveller.adjustments.slice(-5).reverse() : [];
    if (!entries.length) return "";
    const scheduleText = (schedule) => (schedule || []).map((item) => `${item.label}: ${money(cents(item.amount), traveller.currency)} (${money(cents(item.paid), traveller.currency)} paid; due ${dateLabel(item.dueDate)})`).join(" · ");
    const rows = entries.map((entry) => `<li><strong>${escapeHtml(dateLabel(String(entry.recordedAt || "").slice(0, 10)))}</strong><span>${escapeHtml(entry.reason)}</span><small>Total: ${money(cents(entry.previousTotal), traveller.currency)} → ${money(cents(entry.currentTotal), traveller.currency)} · Paid: ${money(cents(entry.previousPaid), traveller.currency)} → ${money(cents(entry.currentPaid), traveller.currency)}</small><small>Before: ${escapeHtml(scheduleText(entry.previousSchedule))}</small><small>After: ${escapeHtml(scheduleText(entry.currentSchedule))}</small></li>`).join("");
    return `<section class="adjustment-history"><h4>Recent private payment adjustments</h4><ol>${rows}</ol></section>`;
  }

  function paymentFacts(traveller) {
    return JSON.stringify({
      total: traveller.total,
      currency: traveller.currency,
        installments: traveller.installments.map(({ label, amount, dueDate, paid, paidDate, reference }) => ({ label, amount, dueDate, paid, paidDate, reference })),
    });
  }

  function renderTraveller(traveller) {
    const balance = getBalances(traveller);
    const state = travellerState(traveller);
    const percent = balance.total ? Math.min(100, Math.round((balance.paid / balance.total) * 100)) : 0;
    const quote = quotes.find((item) => item.id === traveller.quoteId);
    const quoteReference = traveller.quoteRef || quote?.reference || "Unlinked quote";
    const quoteTitle = traveller.quoteTitle || quote?.title || "";
    const quoteHref = validHttpsUrl(traveller.quoteUrl || quote?.quoteUrl) ? traveller.quoteUrl || quote.quoteUrl : "";
    const quoteLink = quoteHref ? `<a href="${escapeHtml(quoteHref)}" target="_blank" rel="noopener noreferrer">Open quote</a>` : "";
    const originalPerPerson = traveller.originalQuotePerPerson || quote?.originalPerPerson || "";
    const quotedAmount = originalPerPerson ? ` · Quoted per person ${money(cents(originalPerPerson), traveller.currency)}` : "";
    const notes = traveller.notes ? `<p class="traveller-notes"><strong>Private note:</strong> ${escapeHtml(traveller.notes)}</p>` : "";
    const terms = traveller.terms ? `<p class="traveller-terms"><strong>Confirmed terms:</strong> ${escapeHtml(traveller.terms)}</p>` : `<p class="traveller-terms">Add confirmed booking, cancellation and refund terms before creating a customer summary.</p>`;
    return `<article class="traveller-card" data-traveller-card="${escapeHtml(traveller.id)}">
      <div class="traveller-card__top">
        <div class="traveller-card__name"><h3>${escapeHtml(traveller.name)}</h3><p>${traveller.installments.length} instalment${traveller.installments.length === 1 ? "" : "s"}</p><p class="quote-reference"><strong>${escapeHtml(quoteReference)}</strong>${quoteTitle ? ` · ${escapeHtml(quoteTitle)}` : ""}${quotedAmount}${quoteLink ? ` · ${quoteLink}` : ""}</p></div>
        <div class="traveller-metric"><span>Agreed total</span><strong>${money(balance.total, traveller.currency)}</strong></div>
        <div class="traveller-metric"><span>Paid</span><strong>${money(balance.paid, traveller.currency)}</strong></div>
        <div class="traveller-metric"><span>Outstanding</span><strong>${money(balance.outstanding, traveller.currency)}</strong></div>
        <div class="traveller-metric"><span>Next due</span><strong>${escapeHtml(nextDue(traveller))}</strong></div>
        <span class="status-pill status-pill--${state.className}">${escapeHtml(state.label)}</span>
      </div>
      <div class="traveller-progress"><div class="traveller-progress__labels"><span>${percent}% paid</span><span>${money(balance.outstanding, traveller.currency)} outstanding</span></div><div class="progress-track" role="progressbar" aria-label="Payment progress for ${escapeHtml(traveller.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div></div>
      <div class="traveller-card__details">
        <table class="schedule-table"><thead><tr><th>Payment</th><th>Amount</th><th>Due</th><th>Paid</th><th>Status</th><th>Payment link</th></tr></thead><tbody>${installmentRows(traveller)}</tbody></table>
        ${terms}${adjustmentHistory(traveller)}${notes}
        <div class="traveller-card__actions"><button class="mini-action" type="button" data-action="share" data-traveller="${escapeHtml(traveller.id)}">Create customer link</button><button class="mini-action" type="button" data-action="export" data-traveller="${escapeHtml(traveller.id)}">Download summary</button><button class="mini-action" type="button" data-action="duplicate" data-traveller="${escapeHtml(traveller.id)}">Duplicate payment</button><button class="mini-action" type="button" data-action="edit" data-traveller="${escapeHtml(traveller.id)}">Edit details</button><button class="mini-action mini-action--danger" type="button" data-action="delete" data-traveller="${escapeHtml(traveller.id)}">Remove</button></div>
      </div>
    </article>`;
  }

  function render() {
    const query = searchInput.value.trim().toLocaleLowerCase();
    const visible = travellers.filter((traveller) => [traveller.name, traveller.quoteRef, traveller.quoteTitle].some((value) => String(value || "").toLocaleLowerCase().includes(query)));
    travellerList.innerHTML = visible.map(renderTraveller).join("");
    emptyState.hidden = travellers.length > 0;
    if (travellers.length > 0 && visible.length === 0) {
      travellerList.innerHTML = '<p class="empty-state">No traveller matches that name.</p>';
    }
    document.querySelector("#stat-travellers").textContent = String(travellers.length);
    document.querySelector("#stat-collected").textContent = currencyGroups("paid");
    document.querySelector("#stat-outstanding").textContent = currencyGroups("outstanding");
    document.querySelector("#stat-overdue").textContent = String(travellers.filter((traveller) => travellerState(traveller).className === "overdue").length);
  }

  function showError(message) {
    formError.textContent = message;
    formError.hidden = false;
  }

  function clearError() {
    formError.textContent = "";
    formError.hidden = true;
  }

  function addInstallment(values = {}) {
    const row = installmentTemplate.content.firstElementChild.cloneNode(true);
    const index = installmentFields.children.length + 1;
    row.querySelector("legend").textContent = values.label || `Instalment ${index}`;
    row.querySelectorAll("[data-installment]").forEach((input) => {
      const key = input.dataset.installment;
      input.value = values[key] ?? (key === "paid" ? "0.00" : "");
      if (!values.id && key === "label" && !input.value) input.value = index === 1 ? "First deposit" : `Instalment ${index}`;
      input.addEventListener("input", () => {
        if (key === "label") row.querySelector("legend").textContent = input.value || `Instalment ${index}`;
        if (key === "amount" || key === "paid") refreshScheduleTotal();
      });
    });
    row.querySelector(".installment-remove").addEventListener("click", () => {
      if (installmentFields.children.length <= 1) {
        showError("Keep at least one payment instalment.");
        return;
      }
      row.remove();
      refreshScheduleTotal();
    });
    installmentFields.append(row);
    refreshScheduleTotal();
  }

  function refreshScheduleTotal() {
    const sum = [...installmentFields.querySelectorAll('[data-installment="amount"]')].reduce((total, input) => total + cents(input.value), 0);
    const currency = (form.elements.currency.value || "").toUpperCase();
    const totalDue = cents(form.elements.total.value);
    const target = document.querySelector("#schedule-total");
    const balanced = totalDue > 0 && sum === totalDue;
    target.textContent = `Schedule total: ${currency.length === 3 ? money(sum, currency) : (sum / 100).toFixed(2)}${totalDue ? ` of ${currency.length === 3 ? money(totalDue, currency) : (totalDue / 100).toFixed(2)}` : ""}`;
    target.classList.toggle("is-balanced", balanced);
    target.classList.toggle("is-unbalanced", sum > 0 && !balanced);
  }

  function clearForm() {
    form.reset();
    installmentFields.replaceChildren();
    clearError();
    editingId = null;
    duplicateSource = null;
    form.dataset.quotePrefill = "";
    document.querySelector("#adjustment-reason-field").hidden = true;
    document.querySelector("#adjustment-history").hidden = true;
    document.querySelector("#duplicate-warning").hidden = true;
    refreshQuoteOptions(preferredQuoteId);
    document.querySelector("#dialog-title").textContent = "Add a traveller";
    const submit = form.querySelector('[type="submit"]');
    submit.textContent = "Save traveller";
    addInstallment({ label: "First deposit" });
    refreshScheduleTotal();
  }

  function openEditor(traveller = null, options = {}) {
    const duplicate = options.duplicate === true;
    if (!quotes.length && !traveller) {
      announce("Import the sent quote or its JSON draft before adding travellers.");
      quoteFile.click();
      return;
    }
    clearForm();
    if (traveller) {
      duplicateSource = duplicate ? duplicateTravellerRecord(traveller) : null;
      editingId = duplicate ? null : traveller.id;
      preferredQuoteId = traveller.quoteId || "";
      refreshQuoteOptions(preferredQuoteId);
      document.querySelector("#dialog-title").textContent = duplicate ? "Duplicate traveller payment" : "Edit traveller";
      form.querySelector('[type="submit"]').textContent = duplicate ? "Save duplicate" : "Save changes";
      form.elements.name.value = duplicate ? "" : traveller.name;
      form.elements.total.value = traveller.total;
      form.elements.currency.value = traveller.currency;
      form.elements.quoteUrl.value = traveller.quoteUrl || "";
      form.elements.terms.value = traveller.terms || "";
      form.elements.notes.value = traveller.notes || "";
      form.elements.adjustmentReason.value = "";
      document.querySelector("#adjustment-reason-field").hidden = duplicate;
      const history = document.querySelector("#adjustment-history");
      history.innerHTML = adjustmentHistory(traveller);
      history.hidden = !traveller.adjustments?.length;
      document.querySelector("#duplicate-warning").hidden = !duplicate;
      installmentFields.replaceChildren();
      traveller.installments.forEach(addInstallment);
    }
    dialog.showModal();
    form.elements.name.focus();
  }

  function readInstallments() {
    return [...installmentFields.querySelectorAll(".installment-field")].map((row) => Object.fromEntries(
      [...row.querySelectorAll("[data-installment]")].map((input) => [input.dataset.installment, input.value.trim()]),
    ));
  }

  function validateAndBuildRecord() {
    const name = form.elements.name.value.trim();
    const total = form.elements.total.value;
    const currency = form.elements.currency.value.trim().toUpperCase();
    const terms = form.elements.terms.value.trim();
    const notes = form.elements.notes.value.trim();
    const quote = quotes.find((item) => item.id === form.elements.quoteId.value);
    const existingRecord = travellers.find((item) => item.id === editingId);
    const sourceRecord = existingRecord || duplicateSource;
    const quoteUrl = form.elements.quoteUrl.value.trim();
    const installments = readInstallments();
    if (!quote) return { error: "Import and select the quote this traveller belongs to." };
    if (quoteUrl && !validHttpsUrl(quoteUrl)) return { error: "The original quote link must be a valid HTTPS address." };
    if (!name) return { error: "Enter the traveller’s name." };
    if (!Number.isFinite(Number(total)) || cents(total) <= 0) return { error: "Enter a total amount greater than zero." };
    if (!/^[A-Z]{3}$/.test(currency)) return { error: "Enter a three-letter ISO currency code, such as GBP or EUR." };
    if (!installments.length) return { error: "Add at least one instalment." };
    for (const [index, installment] of installments.entries()) {
      if (!installment.label) return { error: `Give instalment ${index + 1} a name.` };
      if (!Number.isFinite(Number(installment.amount)) || cents(installment.amount) <= 0) return { error: `Enter an amount greater than zero for “${installment.label}”.` };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(installment.dueDate)) return { error: `Add a due date for “${installment.label}”.` };
      if (installment.url && !validHttpsUrl(installment.url)) return { error: `The payment link for “${installment.label}” must be a valid HTTPS address.` };
      if (!Number.isFinite(Number(installment.paid)) || cents(installment.paid) < 0 || cents(installment.paid) > cents(installment.amount)) return { error: `The amount paid for “${installment.label}” must be between zero and its instalment amount.` };
    }
    const scheduleTotal = installments.reduce((sum, installment) => sum + cents(installment.amount), 0);
    if (scheduleTotal !== cents(total)) return { error: `Instalments add up to ${money(scheduleTotal, currency)}; they must equal the total due of ${money(cents(total), currency)}.` };
    return {
      record: {
        id: editingId || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`),
        quoteId: quote.id,
        quoteRef: quote.reference,
        quoteTitle: quote.title,
        destination: quote.destination,
        quoteUrl,
        originalQuotePerPerson: sourceRecord?.originalQuotePerPerson || quote.originalPerPerson || "",
        originalQuotePerPersonText: sourceRecord?.originalQuotePerPersonText || quote.originalPerPersonText || "",
        name,
        total: (cents(total) / 100).toFixed(2),
        currency,
        terms,
        notes,
        adjustments: sourceRecord?.adjustments || [],
        installments: installments.map((installment) => ({
          label: installment.label,
          amount: (cents(installment.amount) / 100).toFixed(2),
          dueDate: installment.dueDate,
          url: installment.url,
          paid: (cents(installment.paid) / 100).toFixed(2),
          paidDate: installment.paidDate,
          reference: installment.reference,
        })),
      },
    };
  }

  function customerSummary(traveller) {
    const balance = getBalances(traveller);
    const quote = quotes.find((item) => item.id === traveller.quoteId);
    const quoteRef = traveller.quoteRef || quote?.reference || "";
    const quoteTitle = traveller.quoteTitle || quote?.title || "";
    const quoteUrl = traveller.quoteUrl || quote?.quoteUrl || "";
    const originalQuotePerPerson = traveller.originalQuotePerPerson || "";
    const quoteDetails = `<section class="quote"><strong>Quote ${escapeHtml(quoteRef)}</strong><br>${escapeHtml(quoteTitle)}${traveller.destination ? `<br>${escapeHtml(traveller.destination)}` : ""}${originalQuotePerPerson ? `<br>Original quote per person: ${escapeHtml(money(cents(originalQuotePerPerson), traveller.currency))}` : ""}${validHttpsUrl(quoteUrl) ? `<br><a href="${escapeHtml(quoteUrl)}" rel="noopener noreferrer">View your original travel quote</a>` : ""}</section>`;
    const rows = traveller.installments.map((installment) => {
      const link = validHttpsUrl(installment.url)
        ? `<a href="${escapeHtml(installment.url)}" rel="noopener noreferrer">Pay securely for ${escapeHtml(installment.label)}</a>`
        : "Payment link will be shared separately";
      return `<tr><td>${escapeHtml(installment.label)}</td><td>${escapeHtml(money(cents(installment.amount), traveller.currency))}</td><td>${escapeHtml(dateLabel(installment.dueDate))}</td><td>${link}</td></tr>`;
    }).join("");
    return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Payment summary | The VE Collection</title><style>*{box-sizing:border-box}body{margin:0;background:#f8f5ef;color:#171512;font:16px/1.65 Arial,sans-serif}.top{padding:14px max(22px,calc((100vw - 760px)/2));background:#171512;color:white;font-family:Georgia,serif;letter-spacing:.08em;text-transform:uppercase;display:flex;align-items:center;gap:12px}.top img{width:55px;height:45px;object-fit:contain}.top em{color:#c7a35a;font-style:normal}main{max-width:760px;margin:50px auto;padding:0 22px}.eyebrow{color:#8b703e;font-size:11px;font-weight:bold;letter-spacing:.18em;text-transform:uppercase}h1{font:400 clamp(38px,8vw,64px)/1 Georgia,serif}p{color:#625c53}.amount{padding:20px 0;border-top:1px solid #d6cdbd;border-bottom:1px solid #d6cdbd}.amount strong{font:400 34px Georgia,serif}.table-wrap{overflow-x:auto}table{width:100%;min-width:560px;margin:28px 0;border-collapse:collapse}th,td{padding:13px 10px;border-bottom:1px solid #ded8ce;text-align:left;font-size:14px}th{color:#706a61;font-size:11px;text-transform:uppercase}a{color:#594520;text-underline-offset:3px}.quote,.terms{margin:24px 0;padding:18px;background:#eee8dc;white-space:pre-line}.footer{margin-top:36px;padding-top:20px;border-top:1px solid #d6cdbd;color:#706a61;font-size:12px}.safety{font-size:12px}header.top,header.top em{color:#c7a35a}</style></head><body><header class="top"><img src="data:image/webp;base64,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" alt="The VE Collection logo">The VE <em>Collection</em></header><main><p class="eyebrow">Your personal payment schedule</p><h1>Hello, ${escapeHtml(traveller.name)}</h1><p>Here is your payment schedule for your The VE Collection arrangements.</p>${quoteDetails}<div class="amount"><p>Agreed total</p><strong>${escapeHtml(money(balance.total, traveller.currency))}</strong><p>${escapeHtml(money(balance.paid, traveller.currency))} received · ${escapeHtml(money(balance.outstanding, traveller.currency))} outstanding</p></div><div class="table-wrap"><table><thead><tr><th>Payment</th><th>Amount</th><th>Due date</th><th>Payment</th></tr></thead><tbody>${rows}</tbody></table></div><section class="terms"><strong>Booking, cancellation and refund terms</strong><br>${escapeHtml(traveller.terms)}</section><p class="safety">Use the secure payment link shown for each instalment. This summary does not collect card details. Your payment processor should provide confirmation or a receipt after payment.</p><footer class="footer"><strong style="color:#806022">The VE Collection</strong> · Thoughtfully tailored travel<br>Contact The VE Collection if any amount or due date does not match your travel quote.<br></footer></main></body></html>`;
  }

  function exportSummary(traveller) {
    if (!traveller.terms || !traveller.terms.trim()) {
      window.alert("Add the confirmed booking, cancellation and refund terms from this traveller’s quote before exporting their customer summary.");
      openEditor(traveller);
      form.elements.terms.focus();
      return;
    }
    const blob = new Blob([customerSummary(traveller)], { type: "text/html;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const download = document.createElement("a");
    const filename = traveller.name.normalize("NFKD").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "traveller";
    download.href = objectUrl;
    download.download = `ve-collection-payment-summary-${filename}.html`;
    document.body.append(download);
    download.click();
    download.remove();
    URL.revokeObjectURL(objectUrl);
  }

  function encodeBase64Url(bytes) {
    let binary = "";
    new Uint8Array(bytes).forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  async function deriveShareKey(passphrase, salt, usage) {
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 600000, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, [usage]);
  }

  function openShareDialog(traveller) {
    if (!traveller.quoteId || !traveller.quoteRef) {
      window.alert("Attach this traveller to an imported quote before creating a customer link.");
      openEditor(traveller);
      return;
    }
    if (!traveller.terms || !traveller.terms.trim()) {
      window.alert("Add the confirmed booking, cancellation and refund terms before creating a customer link.");
      openEditor(traveller);
      form.elements.terms.focus();
      return;
    }
    const missingLink = traveller.installments.find((installment) => !validHttpsUrl(installment.url));
    if (missingLink) {
      window.alert(`Add a valid HTTPS payment link for “${missingLink.label}” before creating a customer link.`);
      openEditor(traveller);
      return;
    }
    shareForm.reset();
    document.querySelector("#share-error").hidden = true;
    document.querySelector("#share-link-field").hidden = true;
    document.querySelector("#share-copy").hidden = true;
    document.querySelector("#share-warning").hidden = true;
    shareForm.querySelector(".share-generate").hidden = false;
    document.querySelector("#share-link").value = "";
    document.querySelector("#share-context").textContent = `${traveller.name} · Quote ${traveller.quoteRef} · ${traveller.quoteTitle}`;
    shareDialog.dataset.travellerId = traveller.id;
    shareDialog.showModal();
    shareForm.elements.passphrase.focus();
  }

  function sharePayload(traveller) {
    const balance = getBalances(traveller);
    return {
      version: 1,
      name: traveller.name,
      quoteRef: traveller.quoteRef,
      quoteTitle: traveller.quoteTitle,
      destination: traveller.destination || "",
      quoteUrl: traveller.quoteUrl || "",
      originalQuotePerPerson: traveller.originalQuotePerPerson || "",
      currency: traveller.currency,
      total: (balance.total / 100).toFixed(2),
      paid: (balance.paid / 100).toFixed(2),
      outstanding: (balance.outstanding / 100).toFixed(2),
      terms: traveller.terms,
      installments: traveller.installments.map((installment) => ({
        label: installment.label,
        amount: installment.amount,
        dueDate: installment.dueDate,
        paid: installment.paid,
        paidDate: installment.paidDate || "",
        url: installment.url,
      })),
    };
  }

  async function createShareLink(traveller, passphrase) {
    if (window.location.protocol !== "https:") throw new Error("Open the dashboard on its published HTTPS website before creating links. A local file address cannot be sent to a customer.");
    if (!crypto.subtle) throw new Error("Secure link creation requires a browser with Web Crypto support on HTTPS.");
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveShareKey(passphrase, salt, "encrypt");
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(sharePayload(traveller))));
    const fragment = ["vep1", encodeBase64Url(salt), encodeBase64Url(iv), encodeBase64Url(encrypted)].join(".");
    const shareUrl = new URL("payment-summary.html", window.location.href);
    shareUrl.hash = fragment;
    return shareUrl.href;
  }

  async function handleShareSubmit(event) {
    event.preventDefault();
    const message = document.querySelector("#share-error");
    const password = shareForm.elements.passphrase.value;
    const confirmation = shareForm.elements.confirmPassphrase.value;
    if (password.length < 12) {
      message.textContent = "Use a passphrase of at least 12 characters.";
      message.hidden = false;
      return;
    }
    if (password !== confirmation) {
      message.textContent = "The passphrases do not match.";
      message.hidden = false;
      return;
    }
    const traveller = travellers.find((item) => item.id === shareDialog.dataset.travellerId);
    if (!traveller) return;
    const submit = shareForm.querySelector('[type="submit"]');
    submit.disabled = true;
    submit.textContent = "Encrypting…";
    try {
      const link = await createShareLink(traveller, password);
      document.querySelector("#share-link").value = link;
      document.querySelector("#share-link-field").hidden = false;
      document.querySelector("#share-copy").hidden = false;
      document.querySelector("#share-warning").hidden = false;
      shareForm.querySelector(".share-generate").hidden = true;
      shareForm.elements.passphrase.value = "";
      shareForm.elements.confirmPassphrase.value = "";
    } catch (error) {
      message.textContent = error.message || "This browser could not create the encrypted link.";
      message.hidden = false;
    } finally {
      submit.disabled = false;
      submit.textContent = "Create encrypted link";
    }
  }

  function announce(message) {
    document.querySelector("#list-status").textContent = message;
  }

  document.querySelector("#import-quote").addEventListener("click", () => quoteFile.click());
  quoteFile.addEventListener("change", () => importQuote(quoteFile.files[0]));
  document.querySelector("#add-traveller").addEventListener("click", () => openEditor());
  document.querySelector("[data-empty-add]").addEventListener("click", () => openEditor());
  document.querySelector("#add-installment").addEventListener("click", () => addInstallment());
  form.elements.quoteId.addEventListener("change", () => {
    preferredQuoteId = form.elements.quoteId.value;
    applySelectedQuote();
  });
  document.querySelectorAll("[data-close-share]").forEach((button) => button.addEventListener("click", () => shareDialog.close()));
  shareForm.addEventListener("submit", handleShareSubmit);
  document.querySelector("#copy-share-link").addEventListener("click", async () => {
    const link = document.querySelector("#share-link").value;
    try {
      await navigator.clipboard.writeText(link);
      document.querySelector("#copy-share-link").textContent = "Copied";
    } catch {
      document.querySelector("#share-link").focus();
      document.querySelector("#share-link").select();
      window.prompt("Copy this encrypted customer link:", link);
    }
  });
  document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => dialog.close()));
  searchInput.addEventListener("input", render);
  form.elements.total.addEventListener("input", refreshScheduleTotal);
  form.elements.currency.addEventListener("input", refreshScheduleTotal);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearError();
    const result = validateAndBuildRecord();
    if (result.error) {
      showError(result.error);
      return;
    }
    const existingIndex = travellers.findIndex((traveller) => traveller.id === editingId);
    if (existingIndex >= 0) {
      const previousRecord = travellers[existingIndex];
      if (paymentFacts(previousRecord) !== paymentFacts(result.record)) {
        const reason = form.elements.adjustmentReason.value.trim();
        if (!reason) {
          showError("Add an internal reason for changing the agreed total, instalments or amount paid.");
          form.elements.adjustmentReason.focus();
          return;
        }
        const previousBalance = getBalances(previousRecord);
        const currentBalance = getBalances(result.record);
        result.record.adjustments = [...(previousRecord.adjustments || []), {
          recordedAt: new Date().toISOString(),
          reason,
          previousTotal: previousRecord.total,
          currentTotal: result.record.total,
          previousPaid: (previousBalance.paid / 100).toFixed(2),
          currentPaid: (currentBalance.paid / 100).toFixed(2),
          previousSchedule: previousRecord.installments.map(({ label, amount, paid, dueDate }) => ({ label, amount, paid, dueDate })),
          currentSchedule: result.record.installments.map(({ label, amount, paid, dueDate }) => ({ label, amount, paid, dueDate })),
        }].slice(-50);
      }
      travellers[existingIndex] = result.record;
    } else travellers.unshift(result.record);
    if (!saveTravellers()) return;
    dialog.close();
    clearForm();
    render();
    announce(`${result.record.name} saved.`);
  });
  travellerList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const traveller = travellers.find((item) => item.id === button.dataset.traveller);
    if (!traveller) return;
    const installment = traveller.installments[Number(button.dataset.installment)];
    switch (button.dataset.action) {
      case "edit":
        openEditor(traveller);
        break;
      case "duplicate":
        openEditor(traveller, { duplicate: true });
        break;
      case "delete":
        if (window.confirm(`Remove the payment record for ${traveller.name} from this browser?`)) {
          travellers = travellers.filter((item) => item.id !== traveller.id);
          if (saveTravellers()) {
            render();
            announce(`${traveller.name} removed.`);
          }
        }
        break;
      case "export":
        exportSummary(traveller);
        break;
      case "share":
        openShareDialog(traveller);
        break;
      case "copy-link":
        if (!installment || !validHttpsUrl(installment.url)) break;
        try {
          await navigator.clipboard.writeText(installment.url);
          announce(`Payment link copied for ${traveller.name}, ${installment.label}.`);
          button.textContent = "Copied";
          window.setTimeout(() => { if (button.isConnected) button.textContent = "Copy link"; }, 1800);
        } catch {
          window.prompt("Copy this verified HTTPS payment link:", installment.url);
        }
        break;
      case "open-link":
        if (installment && validHttpsUrl(installment.url)) window.open(installment.url, "_blank", "noopener,noreferrer");
        break;
      default:
        break;
    }
  });

  refreshQuoteOptions(preferredQuoteId);
  render();
})();

