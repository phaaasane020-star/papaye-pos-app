// Usage:  if (!(await confirmAction({ title: "Delete item?", message: "...", danger: true }))) return;
export function confirmAction({
  title = "Are you sure?",
  message = "",
  confirmText = "Yes, continue",
  cancelText = "Cancel",
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    const dlg = document.createElement("dialog");
    dlg.className = "m-auto w-[24rem] max-w-[94vw] rounded-2xl bg-paper p-6 text-ink";

    const form = document.createElement("form");
    form.method = "dialog";

    const h = document.createElement("h2");
    h.className = "text-lg font-bold";
    h.textContent = title;

    const p = document.createElement("p");
    p.className = "mt-1 text-sm text-mist";
    p.textContent = message;

    const row = document.createElement("div");
    row.className = "mt-5 flex gap-2";

    const no = document.createElement("button");
    no.type = "submit";
    no.value = "no";
    no.autofocus = true;
    no.className = "press flex-1 rounded-xl bg-mist/20 py-3 font-semibold";
    no.textContent = cancelText;

    const yes = document.createElement("button");
    yes.type = "submit";
    yes.value = "yes";
    yes.className = danger
      ? "press flex-1 rounded-xl bg-red-600 py-3 font-bold text-white"
      : "btn-gold flex-1 rounded-xl py-3 font-bold text-ink";
    yes.textContent = confirmText;

    row.append(no, yes);
    form.append(h, p, row);
    dlg.append(form);

    dlg.addEventListener("close", () => {
      const ok = dlg.returnValue === "yes";
      dlg.remove();
      resolve(ok);
    });

    document.body.appendChild(dlg);
    dlg.showModal();
  });
}