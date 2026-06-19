import { AI_INTERPRETER_JSON_SCHEMA } from "../aiSchemas.js"
import {
  AI_INTERPRETER_SYSTEM_PROMPT,
  criarEntradaAI,
} from "../aiPrompts.js"
import { criarErroHttpProvider } from "./providerUtils.js"

function extrairTextoRespostaOpenAI(resposta) {
  if (typeof resposta?.output_text === "string") return resposta.output_text

  for (const item of resposta?.output ?? []) {
    for (const conteudo of item?.content ?? []) {
      if (conteudo?.type === "output_text" && typeof conteudo.text === "string") {
        return conteudo.text
      }
    }
  }
  return null
}

export async function chamarOpenAIProvider({
  mensagem,
  contextoMinimo,
  providerConfig,
  fetchImpl,
  signal,
}) {
  const resposta = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${providerConfig.apiKey}`,
      "Content-Type": "application/json",
    },
    signal,
    body: JSON.stringify({
      model: providerConfig.model,
      input: [
        { role: "system", content: AI_INTERPRETER_SYSTEM_PROMPT },
        { role: "user", content: criarEntradaAI(mensagem, contextoMinimo) },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "bot_financas_interpretation",
          schema: AI_INTERPRETER_JSON_SCHEMA,
          strict: true,
        },
      },
      max_output_tokens: 700,
      store: false,
    }),
  })

  if (!resposta.ok) {
    throw await criarErroHttpProvider(resposta, { provider: "openai" })
  }

  const payload = await resposta.json()
  return extrairTextoRespostaOpenAI(payload)
}
