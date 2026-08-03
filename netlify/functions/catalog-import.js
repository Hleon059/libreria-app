const { getStore } = require("@netlify/blobs");

function keyOf(p) {
  return (p.codigoBarra && String(p.codigoBarra).trim()) || (p.articulo && String(p.articulo).trim());
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  try {
    const body = JSON.parse(event.body || "{}");
    const incoming = Array.isArray(body.products) ? body.products : [];
    const categoria = (body.categoria || "").toString().trim();
    if (incoming.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: "No se recibieron productos" }) };
    }

    const catalogStore = getStore("libreria");
    const invStore = getStore("libreria");

    const catalog = (await catalogStore.get("catalog", { type: "json" })) || [];
    const inventory = (await invStore.get("inventory", { type: "json" })) || {};

    const byKey = new Map(catalog.map((p) => [keyOf(p), p]));

    let added = 0;
    let updated = 0;

    for (const raw of incoming) {
      const key = keyOf(raw);
      if (!key) continue;
      const existing = byKey.get(key);
      if (existing) {
        existing.descripcion = raw.descripcion || existing.descripcion;
        existing.articulo = raw.articulo || existing.articulo;
        existing.codigoBarra = raw.codigoBarra || existing.codigoBarra;
        existing.precio1 = raw.precio1 ?? existing.precio1;
        existing.precio2 = raw.precio2 ?? existing.precio2;
        if (categoria) existing.categoria = categoria;
        updated++;
      } else {
        const nuevo = {
          codigoBarra: raw.codigoBarra || "",
          articulo: raw.articulo || "",
          descripcion: raw.descripcion || "",
          categoria: categoria || raw.categoria || "",
          precio1: raw.precio1 ?? null,
          precio2: raw.precio2 ?? null,
        };
        byKey.set(key, nuevo);
        catalog.push(nuevo);
        if (!inventory[key]) {
          inventory[key] = { qty: 0, minStock: 3 };
        }
        added++;
      }
    }

    await catalogStore.setJSON("catalog", catalog);
    await invStore.setJSON("inventory", inventory);

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ added, updated, total: catalog.length }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
