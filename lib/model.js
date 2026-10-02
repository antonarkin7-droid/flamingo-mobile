export const operationLabels = {
  income: "Выданные средства",
  reimbursement: "Возмещение перерасхода",
  purchase_return: "Возврат покупки",
  money_return: "Возврат денег организации",
  adjustment: "Корректировка",
};
/** @returns {import('./types').AdvanceState} */
export function initialState() {
  return {
    categories: ["АХЧ", "Мероприятие"],
    operations: [],
    batches: [],
    closed: [],
    settings: { organization: "", person: "", position: "", signature: "" },
  };
}
export function month(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}
export function date(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function cents(value) {
  const s = String(value).trim().replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(s))
    throw new Error("Введите сумму с точностью до копейки");
  const n = Math.round(Number(s) * 100);
  if (!Number.isSafeInteger(n) || Math.abs(n) > 1e11)
    throw new Error("Сумма слишком велика");
  return n;
}
export function cash(n) {
  return (n / 100).toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
export function expenses(state, period, category = "") {
  return state.batches
    .filter((b) => b.status === "confirmed")
    .flatMap((b) => b.entries.map((e) => ({ ...e, batchName: b.name })))
    .filter(
      (e) =>
        (!period || e.period === period) &&
        (!category || e.category === category),
    )
    // Stable sort preserves the document order within a day. Random IDs are
    // storage identifiers and must not change the numbering in the report.
    .sort((a, b) => a.date.localeCompare(b.date));
}
export function balance(state, period) {
  const entries = expenses(state);
  let opening = state.openingBalance && state.openingBalance.date.slice(0, 7) <= period
      ? state.openingBalance.amount : 0,
    received = 0,
    spent = 0,
    returned = 0,
    adjustments = 0,
    purchaseReturns = 0;
  for (const o of state.operations) {
    const delta = o.type === "money_return" ? -o.amount : o.amount;
    if (o.date.slice(0, 7) < period) opening += delta;
    else if (o.date.slice(0, 7) === period) {
      if (o.type === "money_return") returned += o.amount;
      else if (o.type === "adjustment") adjustments += o.amount;
      else if (o.type === "purchase_return") purchaseReturns += o.amount;
      else received += o.amount;
    }
  }
  for (const e of entries) {
    if (e.period < period) opening -= e.amount;
    else if (e.period === period) spent += e.amount;
  }
  return {
    opening,
    received,
    spent,
    returned,
    adjustments,
    purchaseReturns,
    closing:
      opening + received + purchaseReturns + adjustments - spent - returned,
  };
}
export function entryProblems(e) {
  const p = [];
  if (!date(e.date)) p.push("Дата оплаты");
  if (!month(e.period)) p.push("Отчётный месяц");
  if (date(e.date) && month(e.period) && e.date.slice(0, 7) > e.period)
    p.push("Дата оплаты позже отчётного месяца");
  if (!Number.isSafeInteger(e.amount) || e.amount <= 0) p.push("Сумма");
  if (!e.purpose?.trim()) p.push("Назначение платежа");
  if (!["receipt", "other"].includes(e.kind)) p.push("Тип документа");
  if (!e.files?.length) p.push("Подтверждающий документ");
  return p;
}
export function duplicateEntries(state) {
  const rows = expenses(state),
    found = [];
  for (let i = 0; i < rows.length; i++)
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i],
        b = rows[j];
      if (
        a.files.some((f) => b.files.includes(f)) ||
        (a.fiscalKey && a.fiscalKey === b.fiscalKey) ||
        (a.date === b.date &&
          a.amount === b.amount &&
          a.supplier &&
          a.supplier === b.supplier)
      )
        found.push([a.id, b.id]);
    }
  return found;
}
export function validateState(s, previous = initialState()) {
  if (
    !s ||
    !Array.isArray(s.categories) ||
    !Array.isArray(s.operations) ||
    !Array.isArray(s.batches) ||
    !Array.isArray(s.closed) ||
    !s.settings
  )
    throw new Error("Некорректные данные");
  if (
    s.operations.length > 10000 ||
    s.batches.length > 2000 ||
    s.categories.length > 200 ||
    JSON.stringify(s).length > 1400000
  )
    throw new Error("Достигнут лимит локальной версии");
  if (
    s.categories.some(
      (x) => typeof x !== "string" || !x.trim() || x.length > 100,
    ) ||
    new Set(s.categories).size !== s.categories.length
  )
    throw new Error("Названия статей должны быть уникальны");
  const ids = new Set();
  if (s.openingBalance !== undefined) {
    const start = s.openingBalance;
    if (!start || !date(start.date) || !start.date.endsWith("-01")
      || !Number.isSafeInteger(start.amount) || Math.abs(start.amount) > 1e11)
      throw new Error("Укажите первый день месяца и начальный остаток с точностью до копейки");
    if (s.operations.some((o) => o.date < start.date)
      || s.batches.some((b) => b.entries.some((e) => e.period && e.period < start.date.slice(0, 7))))
      throw new Error("Есть операции или расходы до начала учёта. Они уже должны быть учтены в начальном остатке: уберите их или выберите более раннюю дату начала");
  }
  const id = (x) => {
    if (typeof x !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(x) || ids.has(x))
      throw new Error("Повторный или неверный идентификатор");
    ids.add(x);
  };
  for (const o of s.operations) {
    id(o.id);
    if (
      !date(o.date) ||
      !Object.hasOwn(operationLabels, o.type) ||
      !Number.isSafeInteger(o.amount) ||
      Math.abs(o.amount) > 1e11 ||
      (o.type !== "adjustment" && o.amount <= 0) ||
      typeof o.note !== "string" ||
      o.note.length > 1000 ||
      (o.type === "adjustment" && !o.note.trim())
    )
      throw new Error("Проверьте операцию и причину корректировки");
  }
  for (const b of s.batches) {
    id(b.id);
    if (
      !["draft", "confirmed"].includes(b.status) ||
      typeof b.name !== "string" ||
      !b.name.trim() ||
      b.name.length > 200 ||
      !Array.isArray(b.entries) ||
      b.entries.length > 100
    )
      throw new Error("Некорректный пакет");
    for (const e of b.entries) {
      id(e.id);
      if (
        !Array.isArray(e.files) ||
        e.files.length > 30 ||
        e.files.some((f) => typeof f !== "string" || f.length > 80)
      )
        throw new Error("Некорректные вложения");
      for (const key of [
        "date",
        "period",
        "purpose",
        "supplier",
        "number",
        "category",
        "fiscalKey",
        "warning",
      ])
        if (typeof e[key] !== "string" || e[key].length > 2000)
          throw new Error("Некорректное поле документа");
      if (e.customer !== undefined && (typeof e.customer !== "string" || e.customer.length > 2000))
        throw new Error("Некорректный заказчик материалов");
      if (!Number.isSafeInteger(e.amount) || Math.abs(e.amount) > 1e11)
        throw new Error("Некорректная сумма");
      if (e.category && !s.categories.includes(e.category))
        throw new Error("Статья не найдена");
      if (b.status === "confirmed" && entryProblems(e).length)
        throw new Error("Пакет содержит незаполненные поля");
    }
  }
  if (
    s.closed.some((x) => !month(x)) ||
    new Set(s.closed).size !== s.closed.length
  )
    throw new Error("Некорректный закрытый месяц");
  for (const key of ["organization", "person", "position", "signature"])
    if (typeof s.settings[key] !== "string" || s.settings[key].length > 300)
      throw new Error("Проверьте реквизиты");
  if (s.settings.defaultCustomer !== undefined && (typeof s.settings.defaultCustomer !== "string" || s.settings.defaultCustomer.length > 300))
    throw new Error("Некорректный заказчик по умолчанию");
  if (s.settings.yandexClientId !== undefined && (typeof s.settings.yandexClientId !== "string" || !/^[a-zA-Z0-9-]{0,100}$/.test(s.settings.yandexClientId)))
    throw new Error("Некорректный Client ID Яндекс OAuth");
  // Reopening is a separate save; closed periods cannot be edited in the same request.
  for (const m of previous.closed) {
    if (JSON.stringify(balance(s, m)) !== JSON.stringify(balance(previous, m)))
      throw new Error(`Сначала откройте месяц ${m}`);
    const slice = (t) =>
      JSON.stringify({
        o: t.operations.filter((o) => o.date.slice(0, 7) === m),
        e: expenses(t, m),
      });
    if (slice(s) !== slice(previous))
      throw new Error(`Сначала откройте месяц ${m}`);
  }
  return s;
}
export function affectedMonths(previous, next) {
  const months = new Set(
    [...previous.operations, ...next.operations].map((o) => o.date.slice(0, 7)),
  );
  for (const e of [...expenses(previous), ...expenses(next)])
    months.add(e.period);
  for (const start of [previous.openingBalance, next.openingBalance])
    if (start) months.add(start.date.slice(0, 7));
  for (const m of [...previous.closed, ...next.closed]) months.add(m);
  return [...months]
    .sort()
    .filter(
      (m) =>
        JSON.stringify(balance(previous, m)) !==
        JSON.stringify(balance(next, m)),
    );
}

/** Move a whole batch without changing payment dates or confirmation status. */
export function moveBatchPeriod(state, batchId, target) {
  if (!month(target)) throw new Error("Выберите отчётный месяц пакета");
  const batch = state.batches.find((b) => b.id === batchId);
  if (!batch || !batch.entries.length) throw new Error("В пакете нет расходов");
  if (state.closed.includes(target) || batch.entries.some((e) => state.closed.includes(e.period)))
    throw new Error("Сначала откройте исходный и выбранный отчётные месяцы");
  if (batch.entries.some((e) => date(e.date) && e.date.slice(0, 7) > target))
    throw new Error("Дата оплаты позже выбранного отчётного месяца. Проверьте даты документов");
  return {
    ...state,
    batches: state.batches.map((b) => b.id === batchId
      ? { ...b, entries: b.entries.map((e) => ({ ...e, period: target })) }
      : b),
  };
}
