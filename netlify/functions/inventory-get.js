const { getStore } = require("@netlify/blobs");

exports.handler = async () => {
  try {
    const store = getStore("libreria");
    const inventory = (await store.get("inventory", { type: "json" })) || {};
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inventory }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
