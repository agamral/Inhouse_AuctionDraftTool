import { useState, useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { ref, get, set } from 'firebase/database'
import { auth } from '../firebase/auth'
import { db } from '../firebase/database'

export function useAuth() {
  const [user, setUser] = useState(undefined)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [adminChecked, setAdminChecked] = useState(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser ?? null)
      if (firebaseUser) {
        try {
          // Salva perfil do usuário para o super admin poder gerenciar
          await set(ref(db, `/users/${firebaseUser.uid}`), {
            email: firebaseUser.email,
            name: firebaseUser.displayName ?? firebaseUser.email,
            photoURL: firebaseUser.photoURL ?? null,
          })

          const [adminSnap, superSnap] = await Promise.all([
            get(ref(db, `/config/admins/${firebaseUser.uid}`)),
            get(ref(db, `/config/superAdmins/${firebaseUser.uid}`)),
          ])
          setIsSuperAdmin(superSnap.exists() && superSnap.val() === true)
          setIsAdmin(adminSnap.exists() && adminSnap.val() === true
            || superSnap.exists() && superSnap.val() === true)
        } catch {
          setIsAdmin(false)
          setIsSuperAdmin(false)
        }
      } else {
        setIsAdmin(false)
        setIsSuperAdmin(false)
      }
      setAdminChecked(true)
    })
    return unsubscribe
  }, [])

  const loading = !adminChecked

  return { user, isAdmin, isSuperAdmin, loading }
}
