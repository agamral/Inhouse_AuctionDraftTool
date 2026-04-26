import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, signInWithEmailAndPassword, updatePassword } from 'firebase/auth'
import { app } from './config'

export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()

export function loginWithGoogle() {
  return signInWithPopup(auth, googleProvider)
}

export function loginCapitao(email, password) {
  return signInWithEmailAndPassword(auth, email, password)
}

export function trocarSenha(novaSenha) {
  if (!auth.currentUser) throw new Error('Não autenticado')
  return updatePassword(auth.currentUser, novaSenha)
}

/**
 * Atualiza apenas a senha no Firebase Auth.
 * O email de contato real é salvo no banco (não no Auth) para evitar
 * o requisito de verificação do Firebase ao trocar email.
 */
export async function atualizarSenha(novaSenha) {
  if (!auth.currentUser) throw new Error('Não autenticado')
  await updatePassword(auth.currentUser, novaSenha)
}

/** Gera email sintético a partir de battletag ou string aleatória. */
export function gerarEmailSintetico(battletag) {
  const base = battletag
    ? battletag.replace('#', '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
    : Math.random().toString(36).slice(2, 10)
  return `${base}@copa.inhouse`
}

export function emailEhSintetico(email) {
  return email?.endsWith('@copa.inhouse') ?? false
}

export function logout() {
  return signOut(auth)
}

/**
 * Cria uma conta Firebase (email+senha) para um capitão sem afetar a sessão do admin.
 * Usa a REST API diretamente em vez do SDK para evitar trocar o usuário logado.
 */
export async function criarContaCapitao(email, password) {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  )
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.localId // UID do novo usuário
}
