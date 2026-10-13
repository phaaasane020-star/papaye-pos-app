const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => "GH₵ " + Number(n).toFixed(2);

// ---------- Paper width (remembered on this device) ----------
const PAPER_KEY = "papaye_paper";

export function getPaperWidth() {
  try {
    return localStorage.getItem(PAPER_KEY) === "58mm" ? "58mm" : "80mm";
  } catch {
    return "80mm";
  }
}

export function setPaperWidth(width) {
  try {
    localStorage.setItem(PAPER_KEY, width === "58mm" ? "58mm" : "80mm");
  } catch {}
}

// ---------- The receipt itself ----------
export function receiptHTML(sale, width = "80mm") {
  const narrow = width === "58mm";
  const pad = narrow ? "2.5mm" : "4mm";
  const fs = narrow ? 10.5 : 12;
  const fsBrand = narrow ? 15 : 19;
  const fsTotal = narrow ? 13 : 15;

  const d = new Date(sale.time);
  const date = d.toLocaleDateString("en-GB");
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  const count = sale.items.reduce((n, i) => n + i.qty, 0);
  const hasCustom = sale.items.some((i) => i.custom);

  const rows = sale.items
    .map(
      (i) => `
      <div class="item">
        <div class="name">${esc(i.name)}${i.custom ? " *" : ""}</div>
        <div class="row"><span>${i.qty} x ${Number(i.price).toFixed(2)}</span><span>${(i.qty * i.price).toFixed(2)}</span></div>
      </div>`
    )
    .join("");

  const payLines =
    sale.method === "cash"
      ? `<div class="row"><span>Paid by</span><span>CASH</span></div>
         <div class="row"><span>Amount received</span><span>${money(sale.tendered)}</span></div>
         <div class="row bold"><span>Change</span><span>${money(sale.change)}</span></div>`
      : `<div class="row"><span>Paid by</span><span>MOBILE MONEY</span></div>
         <div class="row"><span>Amount paid</span><span>${money(sale.total)}</span></div>`;

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(sale.id)}</title>
<style>
  @page { size: ${width} auto; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #fff; }
  body { width: ${width}; font-family: "Courier New", Courier, monospace; font-size: ${fs}px; line-height: 1.4; color: #000; }
  #receipt { padding: ${pad} ${pad} 6mm; }
  .c { text-align: center; }
  .brand { font-size: ${fsBrand}px; font-weight: 800; letter-spacing: 1px; line-height: 1.15; }
  .muted { font-size: ${fs - 1}px; }
  .row { display: flex; justify-content: space-between; gap: 6px; }
  .item { margin-top: 5px; }
  .name { font-weight: 700; word-break: break-word; }
  .bold { font-weight: 800; }
  .total { font-size: ${fsTotal}px; font-weight: 800; }
  .dash { border-top: 1px dashed #000; margin: 7px 0; }
  .dbl { border-top: 3px double #000; margin: 7px 0; }
  .title { font-weight: 800; letter-spacing: 2px; margin: 4px 0; }
</style></head>
<body>
<div id="receipt">
  <div class="c brand">PAPAYE<br>FAST FOOD</div>
  <div class="c muted" style="margin-top:3px">Hospital Junction, Breman Asikuma</div>
  <div class="c muted">Tel: 0553895005 / 0558543328</div>

  <div class="dbl"></div>
  <div class="c title">SALES RECEIPT</div>
  <div class="dash"></div>

  <div class="row"><span>Receipt No.</span><span class="bold">${esc(sale.id)}</span></div>
  <div class="row"><span>Date</span><span>${esc(date)}</span></div>
  <div class="row"><span>Time</span><span>${esc(time)}</span></div>
  <div class="row"><span>Cashier</span><span>${esc(sale.cashier)}</span></div>

  <div class="dash"></div>
  <div class="row bold"><span>ITEM</span><span>AMOUNT</span></div>
  ${rows}

  <div class="dash"></div>
  <div class="row"><span>Items</span><span>${count}</span></div>
  <div class="row total" style="margin-top:3px"><span>TOTAL</span><span>${money(sale.total)}</span></div>

  <div class="dash"></div>
  ${payLines}

  <div class="dbl"></div>
  <div class="c bold">THANK YOU!</div>
  <div class="c">Please come again</div>
  ${hasCustom ? '<div class="c muted" style="margin-top:6px">* custom item</div>' : ""}
</div>
</body></html>`;
}

// ---------- On-screen preview (used on the "Payment Successful" screen) ----------
export function mountPreview(iframe, sale, width = getPaperWidth()) {
  iframe.style.width = width;
  iframe.style.height = "360px";
  iframe.onload = () => {
    const r = iframe.contentDocument && iframe.contentDocument.getElementById("receipt");
    if (r) iframe.style.height = r.offsetHeight + "px";
  };
  iframe.srcdoc = receiptHTML(sale, width);
}

// ---------- Printing: the sheet is cut to the receipt's real length ----------
// (second argument is kept so older pages that pass a width still work; the saved paper setting wins)
export function printReceipt(sale) {
  const width = getPaperWidth();

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = `position:fixed;left:-9999px;top:0;width:${width};height:1400px;border:0;`;
  document.body.appendChild(iframe);

  iframe.onload = () => {
    const win = iframe.contentWindow;
    const doc = win.document;

    // Measure the receipt, then set the page to exactly that size
    const el = doc.getElementById("receipt");
    const px = el ? el.offsetHeight : 600;
    const mm = Math.ceil((px * 25.4) / 96) + 2;

    const style = doc.createElement("style");
    style.textContent = `@page { size: ${width} ${mm}mm; margin: 0; } html, body { height: ${mm}mm; overflow: hidden; }`;
    doc.head.appendChild(style);

    win.onafterprint = () => iframe.remove();
    win.focus();
    win.print();
  };

  iframe.srcdoc = receiptHTML(sale, width);
}