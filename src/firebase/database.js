// TODO: conectar Firebase — operações reais do Realtime DB
import { getDatabase } from 'firebase/database'
import { app } from './config'

export const db = getDatabase(app)
