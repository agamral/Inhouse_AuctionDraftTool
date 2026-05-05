import { useHeroDraft } from '../hooks/useHeroDraft'

const HERO_DRAFT_PATH = 'showmatch/sessaoAtiva/heroDraft'

export default function ShowmatchEspectador() {
  const { estado, loading } = useHeroDraft(null, null, HERO_DRAFT_PATH)

  if (loading) return <main className="page"><p style={{ color: 'var(--text2)' }}>Carregando...</p></main>
  if (!estado) return (
    <main className="page" style={{ textAlign: 'center', paddingTop: 60 }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>&#x26A1;</div>
      <h2 style={{ fontFamily: "'Rajdhani', sans-serif", color: 'var(--text)', fontSize: 24 }}>Showmatch</h2>
      <p style={{ color: 'var(--text2)', fontSize: 14 }}>Nenhuma sessão ativa no momento.</p>
    </main>
  )

  const timeA = estado.timeA ?? {}
  const timeB = estado.timeB ?? {}

  return (
    <main className="page">
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <span style={{ fontSize: 11, fontFamily: "'Barlow Condensed'", letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--red)', background: 'rgba(224,85,85,0.1)', border: '1px solid rgba(224,85,85,0.3)', borderRadius: 4, padding: '3px 12px' }}>
          &#x26A1; SHOWMATCH AO VIVO
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 700, margin: '0 auto' }}>
        {[{ time: timeA, lado: 'A', cor: 'var(--blue)' }, { time: timeB, lado: 'B', cor: 'var(--gold)' }].map(({ time, lado, cor }) => (
          <div key={lado} style={{ background: 'var(--bg2)', border: `1px solid ${cor}44`, borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 18, color: cor, marginBottom: 12 }}>
              {time.nome ?? `Time ${lado}`}
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Picks</div>
              {(time.picks ?? []).length === 0
                ? <div style={{ fontSize: 12, color: 'var(--text3)' }}>&mdash;</div>
                : (time.picks ?? []).map((h, i) => <div key={i} style={{ fontSize: 13, color: 'var(--text)', padding: '2px 0' }}>&#x2705; {h}</div>)
              }
            </div>
            {(time.bans ?? []).length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Bans</div>
                {(time.bans ?? []).map((h, i) => <div key={i} style={{ fontSize: 13, color: 'var(--red)', padding: '2px 0' }}>&#x1F6AB; {h}</div>)}
              </div>
            )}
            {(time.jogadores ?? []).length > 0 && (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Jogadores</div>
                {time.jogadores.map((j, i) => <div key={i} style={{ fontSize: 12, color: 'var(--text2)', padding: '1px 0' }}>&middot; {j}</div>)}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text3)' }}>
        Status: {estado.status ?? '&mdash;'} &middot; Passo {(estado.passoAtual ?? 0) + 1}
      </div>
    </main>
  )
}
