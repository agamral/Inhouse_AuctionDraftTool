import { useState, useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { ref, get, set } from 'firebase/database'
import { auth } from '../firebase/auth'
import { db } from '../firebase/database'

export function useAuth() {
  const [user,         setUser]         = useState(undefined)
  const [isAdmin,      setIsAdmin]      = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [capitao,      setCapitao]      = useState(null)
  const [adminChecked, setAdminChecked] = useState(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser ?? null)

      if (firebaseUser) {
        try {
          // Salva perfil básico para gerenciamento
          await set(ref(db, `/users/${firebaseUser.uid}`), {
            email:    firebaseUser.email,
            name:     firebaseUser.displayName ?? firebaseUser.email,
            photoURL: firebaseUser.photoURL ?? null,
          })

          // ── Verificação de superadmin ────────────────────────────────────
          // Suporta tanto o path novo (/superAdmins) quanto o legado (/config/superAdmins)
          const [superNew, superLeg] = await Promise.all([
            get(ref(db, `/superAdmins/${firebaseUser.uid}`)),
            get(ref(db, `/config/superAdmins/${firebaseUser.uid}`)),
          ])
          const isSA = (superNew.exists()  && superNew.val()  === true)
                    || (superLeg.exists() && superLeg.val() === true)

          // ── Verificação de admin ─────────────────────────────────────────
          // Path legado: /config/admins/{uid}
          // Path novo:   /campeonatos/{id}/admins/{uid} (qualquer campeonato)
          let isAdm = isSA
          if (!isAdm) {
            const adminLeg = await get(ref(db, `/config/admins/${firebaseUser.uid}`))
            if (adminLeg.exists() && adminLeg.val() === true) {
              isAdm = true
            }
          }
          if (!isAdm) {
            // Verifica em todos os campeonatos
            const campSnap = await get(ref(db, '/campeonatos'))
            const campeonatos = campSnap.val() ?? {}
            isAdm = Object.keys(campeonatos).some(id =>
              campeonatos[id]?.admins?.[firebaseUser.uid] === true
            )
          }

          setIsSuperAdmin(isSA)
          setIsAdmin(isAdm)

          // ── Verificação de capitão ───────────────────────────────────────
          // Só verifica se não é admin
          if (!isAdm) {
            // Verifica no path legado (/teams)
            const teamsLeg = await get(ref(db, '/teams'))
            const teamsOld = teamsLeg.val() ?? {}
            const legEntry = Object.entries(teamsOld)
              .find(([, t]) => t.capitaoUid === firebaseUser.uid)

            if (legEntry) {
              setCapitao({ teamId: legEntry[0], ...legEntry[1] })
            } else {
              // Verifica em campeonatos ativos
              const campSnap = await get(ref(db, '/campeonatos'))
              const campeonatos = campSnap.val() ?? {}
              let found = null
              for (const [cid, camp] of Object.entries(campeonatos)) {
                if (!camp.info?.principal) continue
                const teams = camp.teams ?? {}
                const entry = Object.entries(teams)
                  .find(([, t]) => t.capitaoUid === firebaseUser.uid)
                if (entry) {
                  found = { teamId: entry[0], campeonatoId: cid, ...entry[1] }
                  break
                }
              }
              setCapitao(found)
            }
          } else {
            setCapitao(null)
          }
        } catch {
          setIsAdmin(false)
          setIsSuperAdmin(false)
          setCapitao(null)
        }
      } else {
        setIsAdmin(false)
        setIsSuperAdmin(false)
        setCapitao(null)
      }
      setAdminChecked(true)
    })
    return unsubscribe
  }, [])

  const loading = !adminChecked
  return { user, isAdmin, isSuperAdmin, capitao, loading }
}
