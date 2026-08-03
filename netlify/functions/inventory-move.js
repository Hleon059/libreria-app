const { getStore } = require("@netlify/blobs");

const MAX_MOVEMENTS = 5000;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  try {
    const body = JSON.parse(event.body || "{}");
    const { code, type, qty, note, user, minStock } = body;
    if (!code || !type) {
      return { statusCode: 400, body: JSON.stringify({ error: "Falta código o tipo de movimiento" }) };
    }

    const store = getStore("libreria");
    const inventory = (await store.get("inventory", { type: "json" })) || {};
    const movements = (await store.get("movements", { type: "json" })) || [];

    const current = inventory[code] || { qty: 0, minStock: 3 };
    const prevQty = current.qty || 0;
    let newQty = prevQty;
    const amount = Number(qty) || 0;

    if (type === "entrada") newQty = prevQty + amount;
    else if (type === "salida") newQty = Math.max(0, prevQty - amount);
    else if (type === "ajuste") newQty = Math.max(0, amount);

    current.qty = newQty;
    if (minStock !== undefined && minStock !== null && minStock !== "") {
      current.minStock = Number(minStock);
    }
    inventory[code] = current;

    const movement = {
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      code,
      type,
      qty: amount,
      prevQty,
      newQty,
      note: note || "",
      user: user || "Sin nombre",
      date: new Date().toISOString(),
    };
    movements.unshift(movement);
    if (movements.length > MAX_MOVEMENTS) movements.length = MAX_MOVEMENTS;

    await store.setJSON("inventory", inventory);
    await store.setJSON("movements", movements);

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inventory: current, movement }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
