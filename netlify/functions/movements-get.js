const { getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  try {
    const store = getStore("libreria");
    const movements = (await store.get("movements", { type: "json" })) || [];
    const code = event.queryStringParameters && event.queryStringParameters.code;
    const limit = Number((event.queryStringParameters && event.queryStringParameters.limit) || 200);

    let result = movements;
    if (code) result = result.filter((m) => m.code === code);
    result = result.slice(0, limit);

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ movements: result }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
