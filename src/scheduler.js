import cron from "node-cron"
import { config }           from "./config.js"
import { logger }           from "./logger.js"
import { getTodosUsuarios, getLancamentosPorMes, getMeta, getSomaPorTipo, mesAtual } from "./database.js"
import { fmtRelatorioMensal, obterNomeExibicaoUsuario } from "./formatters.js"
import { enviar }             from "./commands.js"
import { executarBackup }     from "./backup.js"

let sockRef = null

export function iniciarScheduler(sock) {
  sockRef = sock

  // ── Lembrete mensal — último dia do mês ──────────────────────────────────
  cron.schedule(`0 ${config.horaLembreteMensal} * * *`, async () => {
    const hoje  = new Date()
    const amanha = new Date(hoje)
    amanha.setDate(amanha.getDate() + 1)
    if (amanha.getMonth() === hoje.getMonth()) return  // não é o último dia

    logger.info("Disparando lembrete mensal automático")
    const mes      = mesAtual()
    const usuarios = getTodosUsuarios()

    for (const u of usuarios) {
      try {
        const todos    = getLancamentosPorMes(u.id, mes)
        const entradas = todos.filter(l => l.tipo === "entrada")
        const gastos   = todos.filter(l => l.tipo === "gasto")
        const meta     = getMeta(u.id)
        const nome = obterNomeExibicaoUsuario(u) ?? "Usuário"
        const { texto } = fmtRelatorioMensal(nome, entradas, gastos, meta)
        await enviar(sockRef, config.grupoPermitido,
          `📅 *LEMBRETE — Fim do mês, ${nome}!*\n\n${texto}`)
      } catch (err) {
        logger.error({ err: err.message, usuario: u.id }, "Erro no lembrete mensal")
      }
    }
  }, { timezone: "America/Sao_Paulo" })

  // ── Alerta semanal de meta — segunda-feira às 9h ─────────────────────────
  cron.schedule("0 9 * * 1", async () => {
    const mes      = mesAtual()
    const usuarios = getTodosUsuarios()
    for (const u of usuarios) {
      try {
        const meta = getMeta(u.id)
        if (!meta) continue
        const totalG = getSomaPorTipo(u.id, "gasto", mes)
        const pct    = Math.round((totalG / meta) * 100)
        if (pct < 50) continue
        const nome = obterNomeExibicaoUsuario(u) ?? "Usuário"
        await enviar(sockRef, config.grupoPermitido,
          `🎯 *${nome}*, você já usou *${pct}%* da meta mensal (R$ ${meta.toFixed(2)}).`)
      } catch (err) {
        logger.error({ err: err.message }, "Erro no alerta semanal de meta")
      }
    }
  }, { timezone: "America/Sao_Paulo" })

  // ── Backup diário — todo dia às 3h ───────────────────────────────────────
  cron.schedule("0 3 * * *", async () => {
    try {
      const arquivo = await executarBackup()
      logger.info({ arquivo }, "Backup automático concluído")
    } catch (err) {
      logger.error({ err: err.message }, "Falha no backup automático")
    }
  }, { timezone: "America/Sao_Paulo" })

  logger.info("Scheduler iniciado — lembretes e backup automáticos ativados")
}
