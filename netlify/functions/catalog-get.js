const { getStore } = require("@netlify/blobs");

exports.handler = async () => {
  try {
    const store = getStore("libreria");
    const catalog = (await store.get("catalog", { type: "json" })) || [];
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ catalog }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
