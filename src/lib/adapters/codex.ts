import { getStore } from "../store"
import { cliAdapter } from "./cli"

export const codexAdapter = cliAdapter(
  "codex",
  ["codex"],
  (ctx) => ["exec", "--json", "--model", ctx.model, ctx.prompt],
  () => {
    const settings = getStore().snapshot().settings
    const key =
      settings.starimgApiKey ||
      process.env.STARIMG_API_KEY ||
      settings.openaiApiKey ||
      process.env.OPENAI_API_KEY ||
      ""
    const base =
      settings.starimgBaseUrl ||
      process.env.STARIMG_BASE_URL ||
      "https://ai.starimg.com/v1"
    return {
      OPENAI_API_KEY: key,
      OPENAI_BASE_URL: base,
      CODEX_API_KEY: key,
    }
  }
)
