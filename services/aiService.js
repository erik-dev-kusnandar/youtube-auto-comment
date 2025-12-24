const prompts = require("../prompts");

async function aiGenerate(type, payload) {
  const prompt = prompts[type](payload);
  return callLLM(prompt); // EXISTING FUNCTION
}

module.exports = { aiGenerate };
