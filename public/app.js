// ---------- Estado ----------
let catalog = [];       // [{codigoBarra, articulo, descripcion, precio1, precio2}]
let inventory = {};     // { key: {qty, minStock} }
let pendingImport = null;
let html5QrCode = null;
let currentUser = localStorage.getItem("libreria_user") || "";
let activeCategory = "";

const $ = (sel) => document.querySelector(sel);
const money = (n) => (n == null || n === "" ? "—" : "$" + Number(n).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
const norm = (s) => (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const keyOf = (p) => (p.codigoBarra && String(p.codigoBarra).trim()) || (p.articulo && String(p.articulo).trim());

// ---------- Arranque ----------
window.addEventListener("DOMContentLoaded", () => {
  loadFromLocalCache();
  setupTabs();
  setupSearch();
  setupScanner();
  setupImport();
  setupSync();
  setupUser();
  renderAlerts();
  renderCategoryChips();
  if (navigator.serviceWorker) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
  refreshFromServer(); // trae lo último en segundo plano
});

// ---------- Cache local (offline / arranque rápido) ----------
function loadFromLocalCache() {
  try {
    catalog = JSON.parse(localStorage.getItem("libreria_catalog") || "[]");
    inventory = JSON.parse(localStorage.getItem("libreria_inventory") || "{}");
  } catch {
    catalog = [];
    inventory = {};
  }
}
function saveLocalCache() {
  try {
    localStorage.setItem("libreria_catalog", JSON.stringify(catalog));
    localStorage.setItem("libreria_inventory", JSON.stringify(inventory));
  } catch (e) {
    // Catálogo muy grande para el almacenamiento local del navegador:
    // seguimos funcionando igual, solo que sin cache offline completa.
    console.warn("No se pudo guardar cache local:", e.message);
  }
}

function distinctCategories() {
  return [...new Set(catalog.map((p) => (p.categoria || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
}

function renderCategoryChips() {
  const cats = distinctCategories();
  const box = $("#categoryChips");
  if (!box) return;
  if (cats.length === 0) {
    box.innerHTML = "";
    return;
  }
  const all = [{ label: "Todos", value: "" }, ...cats.map((c) => ({ label: c, value: c }))];
  box.innerHTML = all
    .map((c) => `<button data-cat="${escapeHtml(c.value)}" class="${activeCategory === c.value ? "active" : ""}">${escapeHtml(c.label)}</button>`)
    .join("");
  box.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => {
      activeCategory = b.dataset.cat;
      renderCategoryChips();
      runSearch();
    });
  });
  const datalist = $("#categoryList");
  if (datalist) datalist.innerHTML = cats.map((c) => `<option value="${escapeHtml(c)}"></option>`).join("");
}

async function refreshFromServer() {
  $("#syncBtn").textContent = "…";
  try {
    const [c, i] = await Promise.all([
      fetch("/.netlify/functions/catalog-get").then((r) => r.json()),
      fetch("/.netlify/functions/inventory-get").then((r) => r.json()),
    ]);
    catalog = c.catalog || [];
    inventory = i.inventory || {};
    saveLocalCache();
    renderAlerts();
    renderCategoryChips();
    if ($("#searchInput").value.trim() || activeCategory) runSearch();
  } catch (e) {
    console.warn("No se pudo sincronizar:", e.message);
  } finally {
    $("#syncBtn").textContent = "⟳";
  }
}

function setupSync() {
  $("#syncBtn").addEventListener("click", refreshFromServer);
}

// ---------- Tabs ----------
function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
      btn.classList.add("active");
      $("#view-" + btn.dataset.view).classList.add("active");
      if (btn.dataset.view === "historial") renderHistory();
      if (btn.dataset.view === "alertas") renderAlerts();
    });
  });
}

// ---------- Usuario ----------
function setupUser() {
  const names = ["Hector", "Mi señora", "Empleada"];
  const opts = $("#userOptions");
  names.forEach((n) => {
    const b = document.createElement("button");
    b.textContent = n;
    b.addEventListener("click", () => {
      opts.querySelectorAll("button").forEach((x) => x.classList.remove("selected"));
      b.classList.add("selected");
      $("#userCustom").value = "";
    });
    opts.appendChild(b);
  });
  $("#userConfirmBtn").addEventListener("click", () => {
    const custom = $("#userCustom").value.trim();
    const selected = opts.querySelector("button.selected");
    currentUser = custom || (selected ? selected.textContent : "") || "Sin nombre";
    localStorage.setItem("libreria_user", currentUser);
    $("#userModal").classList.add("hidden");
  });
  if (!currentUser) $("#userModal").classList.remove("hidden");
}
function ensureUser(cb) {
  if (currentUser) return cb();
  $("#userModal").classList.remove("hidden");
  const onConfirm = () => {
    $("#userConfirmBtn").removeEventListener("click", onConfirm);
    if (currentUser) cb();
  };
  $("#userConfirmBtn").addEventListener("click", onConfirm);
}

// ---------- Búsqueda ----------
function setupSearch() {
  $("#searchInput").addEventListener("input", debounce(runSearch, 120));
}
function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}
function runSearch() {
  const qRaw = $("#searchInput").value.trim();
  const list = $("#resultsList");
  const meta = $("#searchMeta");
  list.innerHTML = "";

  let base = catalog;
  if (activeCategory) base = base.filter((p) => (p.categoria || "") === activeCategory);

  if (!qRaw) {
    if (!activeCategory) {
      meta.textContent = catalog.length ? `${catalog.length} productos en catálogo` : "Todavía no hay catálogo cargado. Andá a Importar.";
      return;
    }
    meta.textContent = `${base.length} producto${base.length === 1 ? "" : "s"} en ${activeCategory}`;
    base.slice(0, 60).forEach((p) => list.appendChild(renderProductRow(p)));
    return;
  }

  const q = norm(qRaw);
  const isNumericish = /^[0-9\-]+$/.test(qRaw);
  let matches = base.filter((p) => {
    if (isNumericish) {
      const cb = (p.codigoBarra || "").toString();
      const art = (p.articulo || "").toString();
      if (cb.includes(qRaw) || art.includes(qRaw)) return true;
    }
    return norm(p.descripcion).includes(q) || norm(p.codigoBarra).includes(q) || norm(p.articulo).includes(q);
  });
  meta.textContent = `${matches.length} resultado${matches.length === 1 ? "" : "s"}`;
  matches.slice(0, 60).forEach((p) => list.appendChild(renderProductRow(p)));
  if (matches.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-state";
    li.textContent = "No se encontró ningún producto.";
    list.appendChild(li);
  }
}

function renderProductRow(p) {
  const key = keyOf(p);
  const inv = inventory[key] || { qty: 0, minStock: 3 };
  const low = inv.qty <= inv.minStock;
  const li = document.createElement("li");
  li.className = "product-row";
  li.innerHTML = `
    ${p.categoria ? `<span class="category-tag">${escapeHtml(p.categoria)}</span>` : ""}
    <div class="desc">${escapeHtml(p.descripcion || "(sin descripción)")}</div>
    <div class="meta-line">
      <span class="code">${escapeHtml(p.codigoBarra || p.articulo || "")}</span>
      <span class="stock-tag ${low ? "stock-low" : "stock-ok"}">Stock: ${inv.qty}</span>
    </div>
    <div class="prices">
      <span class="price-chip">May. ${money(p.precio1)}</span>
      <span class="price-chip retail">Min. ${money(p.precio2)}</span>
    </div>
  `;
  li.addEventListener("click", () => openProductModal(p));
  return li;
}

function escapeHtml(s) {
  return (s || "").toString().replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- Detalle de producto / stock ----------
function openProductModal(p) {
  const key = keyOf(p);
  const inv = inventory[key] || { qty: 0, minStock: 3 };
  const modal = $("#productModal");
  $("#modalContent").innerHTML = `
    <div class="modal-h1">${escapeHtml(p.descripcion || "(sin descripción)")}</div>
    <div class="modal-code">Código: ${escapeHtml(p.codigoBarra || "—")} · Artículo: ${escapeHtml(p.articulo || "—")}</div>
    <div class="modal-prices">
      <div class="modal-price-box"><div class="label">Mayorista</div><div class="value">${money(p.precio1)}</div></div>
      <div class="modal-price-box"><div class="label">Minorista</div><div class="value">${money(p.precio2)}</div></div>
    </div>
    <div class="stock-block">
      <div class="stock-row">
        <div>
          <div class="label" style="font-size:11px;color:var(--ink-soft);text-transform:uppercase;">Stock actual</div>
          <div class="stock-qty">${inv.qty}</div>
        </div>
        <div class="stepper">
          <button class="minus" id="btnMinus">−</button>
          <button class="plus" id="btnPlus">+</button>
        </div>
      </div>
      <div class="form-row">
        <input id="moveQty" type="number" inputmode="numeric" placeholder="Cantidad" min="0" />
        <select id="moveType">
          <option value="entrada">Entrada (compra)</option>
          <option value="salida">Salida (venta)</option>
          <option value="ajuste">Ajuste (fijar stock)</option>
        </select>
      </div>
      <div class="form-row">
        <input id="moveNote" type="text" placeholder="Nota (opcional)" />
      </div>
      <div class="form-row">
        <input id="minStockInput" type="number" min="0" value="${inv.minStock ?? 3}" placeholder="Mínimo de stock" />
      </div>
      <div class="form-row">
        <button class="btn btn-primary" id="registerMoveBtn">Registrar movimiento</button>
      </div>
    </div>
    <div id="productHistory"></div>
  `;
  modal.classList.remove("hidden");

  $("#btnPlus").addEventListener("click", () => quickMove(p, key, "entrada", 1));
  $("#btnMinus").addEventListener("click", () => quickMove(p, key, "salida", 1));
  $("#registerMoveBtn").addEventListener("click", () => {
    const qty = Number($("#moveQty").value || 0);
    const type = $("#moveType").value;
    const note = $("#moveNote").value;
    const minStock = $("#minStockInput").value;
    if (type !== "ajuste" && qty <= 0) {
      alert("Ingresá una cantidad mayor a 0.");
      return;
    }
    quickMove(p, key, type, qty, note, minStock);
  });

  loadProductHistory(key);
}

async function quickMove(p, key, type, qty, note = "", minStock = undefined) {
  ensureUser(async () => {
    try {
      const res = await fetch("/.netlify/functions/inventory-move", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: key, type, qty, note, user: currentUser, minStock }),
      });
      const data = await res.json();
      if (data.inventory) {
        inventory[key] = data.inventory;
        saveLocalCache();
        openProductModal(p); // refresca el modal con el nuevo stock
        runSearch();
        renderAlerts();
      }
    } catch (e) {
      alert("No se pudo registrar el movimiento. Revisá tu conexión.");
    }
  });
}

async function loadProductHistory(key) {
  const box = $("#productHistory");
  box.innerHTML = `<p class="view-hint">Cargando historial…</p>`;
  try {
    const res = await fetch("/.netlify/functions/movements-get?code=" + encodeURIComponent(key) + "&limit=20");
    const data = await res.json();
    if (!data.movements || data.movements.length === 0) {
      box.innerHTML = `<p class="view-hint">Sin movimientos registrados todavía.</p>`;
      return;
    }
    box.innerHTML = data.movements.map(movementHtml).join("");
  } catch {
    box.innerHTML = "";
  }
}

function movementHtml(m) {
  const labels = { entrada: "Entrada", salida: "Salida", ajuste: "Ajuste" };
  return `<div class="history-item">
    <div class="h-top"><span>${labels[m.type] || m.type} ${m.type !== "ajuste" ? "· " + m.qty : ""}</span><span>${m.prevQty} → ${m.newQty}</span></div>
    <div class="h-meta">${new Date(m.date).toLocaleString("es-AR")} · ${escapeHtml(m.user)}${m.note ? " · " + escapeHtml(m.note) : ""}</div>
  </div>`;
}

$("#closeModalBtn")?.addEventListener("click", () => $("#productModal").classList.add("hidden"));

// ---------- Alertas de stock bajo ----------
function renderAlerts() {
  const list = $("#alertsList");
  list.innerHTML = "";
  const byKey = new Map(catalog.map((p) => [keyOf(p), p]));
  const low = Object.entries(inventory)
    .filter(([, v]) => v.qty <= (v.minStock ?? 3))
    .map(([k, v]) => ({ p: byKey.get(k) || { descripcion: k, codigoBarra: k }, inv: v }))
    .sort((a, b) => a.inv.qty - b.inv.qty);

  if (low.length === 0) {
    list.innerHTML = `<li class="empty-state">No hay productos con stock bajo. 🎉</li>`;
    return;
  }
  low.forEach(({ p }) => list.appendChild(renderProductRow(p)));
}

// ---------- Historial general ----------
async function renderHistory() {
  const list = $("#historyList");
  list.innerHTML = `<li class="empty-state">Cargando…</li>`;
  try {
    const res = await fetch("/.netlify/functions/movements-get?limit=100");
    const data = await res.json();
    const byKey = new Map(catalog.map((p) => [keyOf(p), p]));
    if (!data.movements || data.movements.length === 0) {
      list.innerHTML = `<li class="empty-state">Sin movimientos todavía.</li>`;
      return;
    }
    list.innerHTML = data.movements
      .map((m) => {
        const p = byKey.get(m.code);
        const name = p ? p.descripcion : m.code;
        return `<li class="product-row" style="cursor:default;">
          <div class="desc">${escapeHtml(name)}</div>
          ${movementHtml(m)}
        </li>`;
      })
      .join("");
  } catch {
    list.innerHTML = `<li class="empty-state">No se pudo cargar el historial.</li>`;
  }
}

// ---------- Escáner de código de barras ----------
function setupScanner() {
  $("#scanBtn").addEventListener("click", async () => {
    $("#scanModal").classList.remove("hidden");
    html5QrCode = new Html5Qrcode("scanRegion");
    try {
      await html5QrCode.start(
        { facingMode: "environment" },
        { fps: 12, qrbox: { width: 260, height: 140 } },
        (decodedText) => {
          $("#searchInput").value = decodedText;
          runSearch();
          stopScanner();
        },
        () => {}
      );
    } catch (e) {
      alert("No se pudo acceder a la cámara. Revisá los permisos del navegador.");
      stopScanner();
    }
  });
  $("#closeScanBtn").addEventListener("click", stopScanner);
}
function stopScanner() {
  $("#scanModal").classList.add("hidden");
  if (html5QrCode) {
    html5QrCode.stop().then(() => html5QrCode.clear()).catch(() => {});
    html5QrCode = null;
  }
}

// ---------- Importar lista de precios ----------
function setupImport() {
  $("#fileDrop").addEventListener("click", () => $("#fileInput").click());
  $("#fileInput").addEventListener("change", handleImportFile);
  $("#cancelImportBtn").addEventListener("click", () => {
    pendingImport = null;
    $("#importPreview").classList.add("hidden");
    $("#fileDropLabel").textContent = "Tocá para elegir el archivo";
  });
  $("#confirmImportBtn").addEventListener("click", submitImport);
}

async function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  $("#fileDropLabel").textContent = "Leyendo " + file.name + "…";
  $("#importResult").innerHTML = "";
  $("#importPreview").classList.add("hidden");
  try {
    if (typeof XLSX === "undefined") {
      throw new Error("No se pudo cargar la librería para leer Excel (XLSX). Revisá tu conexión a internet y volvé a intentar.");
    }
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
    const parsed = parseCatalogRows(rows);
    if (parsed.length === 0) {
      $("#fileDropLabel").textContent = "Tocá para elegir el archivo";
      $("#importResult").innerHTML = `<p style="color:var(--bad)">No se pudo interpretar el archivo. Revisá que tenga columnas ARTICULO, CODIGO, DESCRIPCION, PRECIO1, PRECIO2.</p>`;
      return;
    }
    pendingImport = parsed;
    $("#fileDropLabel").textContent = file.name;
    $("#importSummary").textContent = `Se detectaron ${parsed.length} productos en el archivo. Al confirmar, se actualizarán los precios existentes y se agregarán los nuevos.`;
    $("#importPreview").classList.remove("hidden");
    renderCategoryChips(); // refresca el datalist de categorías sugeridas
  } catch (err) {
    $("#fileDropLabel").textContent = "Tocá para elegir el archivo";
    $("#importResult").innerHTML = `<p style="color:var(--bad)">Error al leer el archivo: ${escapeHtml(err.message)}</p>`;
  }
}

// Busca la fila de encabezado (ARTICULO / CODIGO / DESCRIPCION / PRECIO1 / PRECIO2)
// y mapea el resto de las filas por posición de columna, sin asumir un layout fijo.
function parseCatalogRows(rows) {
  let headerIdx = -1;
  let colMap = {};
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const found = {};
    row.forEach((cell, ci) => {
      const c = norm(cell).replace(/\s+/g, "");
      if (c === "articulo") found.articulo = ci;
      if (c === "codigo") found.codigoBarra = ci;
      if (c.startsWith("descripcion")) found.descripcion = ci;
      if (c === "precio1") found.precio1 = ci;
      if (c === "precio2") found.precio2 = ci;
      if (c === "rubro" || c === "categoria") found.categoria = ci;
    });
    if (found.codigoBarra !== undefined && found.descripcion !== undefined) {
      headerIdx = i;
      colMap = found;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const out = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const descripcion = colMap.descripcion !== undefined ? row[colMap.descripcion] : "";
    const codigoBarra = colMap.codigoBarra !== undefined ? row[colMap.codigoBarra] : "";
    if (!descripcion && !codigoBarra) continue;
    if (/^page\s/i.test((row[0] || "").toString())) continue;
    out.push({
      articulo: colMap.articulo !== undefined ? String(row[colMap.articulo] || "").trim() : "",
      codigoBarra: String(codigoBarra || "").trim(),
      descripcion: String(descripcion || "").trim(),
      categoria: colMap.categoria !== undefined ? String(row[colMap.categoria] || "").trim() : "",
      precio1: colMap.precio1 !== undefined ? toNumber(row[colMap.precio1]) : null,
      precio2: colMap.precio2 !== undefined ? toNumber(row[colMap.precio2]) : null,
    });
  }
  return out;
}
function toNumber(v) {
  if (v === "" || v == null) return null;
  const n = Number(String(v).toString().replace(",", "."));
  return isNaN(n) ? null : n;
}

async function submitImport() {
  if (!pendingImport) return;
  $("#confirmImportBtn").disabled = true;
  $("#confirmImportBtn").textContent = "Actualizando…";
  try {
    const categoria = $("#importCategory").value.trim();
    const res = await fetch("/.netlify/functions/catalog-import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ products: pendingImport, categoria }),
    });
    const data = await res.json();
    $("#importResult").innerHTML = `<p style="color:var(--good)">Listo: ${data.added} productos nuevos, ${data.updated} actualizados. Catálogo total: ${data.total}.</p>`;
    pendingImport = null;
    $("#importPreview").classList.add("hidden");
    $("#fileDropLabel").textContent = "Tocá para elegir el archivo";
    $("#importCategory").value = "";
    await refreshFromServer();
  } catch (e) {
    $("#importResult").innerHTML = `<p style="color:var(--bad)">Error al importar. Probá de nuevo.</p>`;
  } finally {
    $("#confirmImportBtn").disabled = false;
    $("#confirmImportBtn").textContent = "Confirmar actualización";
  }
}
