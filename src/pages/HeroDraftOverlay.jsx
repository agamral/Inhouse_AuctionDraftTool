import { useSearchParams } from 'react-router-dom'
import { useHeroDraft } from '../hooks/useHeroDraft'
import { HEROES } from '../utils/heroPool'
import { passoAtual, ACOES, STATUS_DRAFT } from '../utils/heroDraft'
import './HeroDraftOverlay.css'

// URL: /hero-draft/overlay?sessao=semifinal-1&obs=1
// Com ?obs=1 a navbar e o footer são escondidos via CSS global.
// Esta tela tem fundo transparente — funciona como Browser Source no OBS.
export default function HeroDraftOverlay() {
  const [params] = useSearchParams()
  const sessaoId = params.get('sessao') ?? 'default'

  const { estado, loading } = useHeroDraft(sessaoId)

  if (loading || !estado) return null
  if (estado.status === STATUS_DRAFT.AGUARDANDO) return null

  const passo = passoAtual(estado)

  return (
    <div className="hdo-root">

      {/* ── Time A — coluna esquerda ──────────────────────────────────────── */}
      <div className="hdo-time hdo-time--a" style={{ '--cor': estado.timeA.cor }}>
        <div className="hdo-time-header">
          <span className="hdo-time-nome">{estado.timeA.nome}</span>
        </div>

        <div className="hdo-picks">
          {Array.from({ length: 5 }).map((_, i) => (
            <OverlaySlot key={i} heroiId={estado.timeA.picks[i]} tipo="pick" cor={estado.timeA.cor} />
          ))}
        </div>

        <div className="hdo-bans">
          {Array.from({ length: 4 }).map((_, i) => (
            <OverlayBan key={i} heroiId={estado.timeA.bans[i]} />
          ))}
        </div>
      </div>

      {/* ── Centro ───────────────────────────────────────────────────────── */}
      <div className="hdo-centro">
        {estado.status === STATUS_DRAFT.RODANDO && passo ? (
          <>
            <div className="hdo-turno-acao" data-acao={passo.acao}>
              {passo.acao === ACOES.BAN ? 'BAN' : 'PICK'}
            </div>
            <div className="hdo-turno-time">Time {passo.time}</div>
          </>
        ) : (
          <div className="hdo-fim">FIM</div>
        )}
      </div>

      {/* ── Time B — coluna direita ───────────────────────────────────────── */}
      <div className="hdo-time hdo-time--b" style={{ '--cor': estado.timeB.cor }}>
        <div className="hdo-time-header">
          <span className="hdo-time-nome">{estado.timeB.nome}</span>
        </div>

        <div className="hdo-picks">
          {Array.from({ length: 5 }).map((_, i) => (
            <OverlaySlot key={i} heroiId={estado.timeB.picks[i]} tipo="pick" cor={estado.timeB.cor} />
          ))}
        </div>

        <div className="hdo-bans">
          {Array.from({ length: 4 }).map((_, i) => (
            <OverlayBan key={i} heroiId={estado.timeB.bans[i]} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Subcomponentes ─────────────────────────────────────────────────────────────

function OverlaySlot({ heroiId, tipo, cor }) {
  const heroi = heroiId ? HEROES.find((h) => h.id === heroiId) : null

  return (
    <div className={`hdo-slot ${heroi ? 'hdo-slot--preenchido' : 'hdo-slot--vazio'}`}
         style={{ '--cor': cor }}>
      {heroi && (
        <>
          <img src={heroi.iconeUrl} alt={heroi.nome}
               onError={(e) => { e.target.src = '/heroes/placeholder.png' }} />
          <span className="hdo-slot-nome">{heroi.nome}</span>
        </>
      )}
    </div>
  )
}

function OverlayBan({ heroiId }) {
  const heroi = heroiId ? HEROES.find((h) => h.id === heroiId) : null

  return (
    <div className={`hdo-ban ${heroi ? 'hdo-ban--preenchido' : 'hdo-ban--vazio'}`}>
      {heroi && (
        <>
          <img src={heroi.iconeUrl} alt={heroi.nome}
               onError={(e) => { e.target.src = '/heroes/placeholder.png' }} />
          <span className="hdo-ban-x">✕</span>
        </>
      )}
    </div>
  )
}
