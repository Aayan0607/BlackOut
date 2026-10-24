import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { A, heads, mergeWorkspace, validateWorkspace, type WorkspaceDoc } from '../core/model'
import type { ReceiverState } from '../core/transfer'

interface SavedWorkspace {
  id: string
  name: string
  bytes: Uint8Array
  updatedAt: string
}
export interface Receipt {
  workspaceId: string
  sender: string
  receivedAt: string
  sameBefore: boolean
  matchedHeads: string
}
interface Database extends DBSchema {
  workspaces: { key: string; value: SavedWorkspace }
  settings: { key: string; value: string }
  receiver: { key: string; value: ReceiverState }
  receipts: { key: string; value: Receipt }
}
export class Repository {
  private db: Promise<IDBPDatabase<Database>>
  // Different app sessions use different actors, including tabs sharing the same database.
  readonly actorId = crypto.randomUUID().replaceAll('-', '')
  constructor(name = 'blackout-v1') {
    this.db = openDB<Database>(name, 1, {
      upgrade(db) {
        db.createObjectStore('workspaces', { keyPath: 'id' })
        db.createObjectStore('settings')
        db.createObjectStore('receiver')
        db.createObjectStore('receipts')
      },
    })
  }
  async list() {
    return (await (await this.db).getAll('workspaces'))
      .map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }
  async load(id: string): Promise<WorkspaceDoc | null> {
    const row = await (await this.db).get('workspaces', id)
    if (!row) return null
    const doc = A.load<import('../core/model').Workspace>(row.bytes, this.actorId)
    validateWorkspace(doc)
    return doc
  }
  async insert(doc: WorkspaceDoc) {
    validateWorkspace(doc)
    const tx = (await this.db).transaction('workspaces', 'readwrite')
    if (await tx.store.get(doc.id)) {
      tx.abort()
      throw new Error('This expedition already exists. Import updates to merge it.')
    }
    await tx.store.add({
      id: doc.id,
      name: doc.name,
      bytes: A.save(doc),
      updatedAt: new Date().toISOString(),
    })
    await tx.done
  }
  async mutate(id: string, change: (current: WorkspaceDoc) => WorkspaceDoc): Promise<WorkspaceDoc> {
    const tx = (await this.db).transaction('workspaces', 'readwrite')
    const row = await tx.store.get(id)
    if (!row) throw new Error('Expedition not found on this device.')
    // Read + modify + save in one transaction prevents stale tabs overwriting newer state.
    const result = change(A.load(row.bytes, this.actorId))
    validateWorkspace(result)
    await tx.store.put({
      id: result.id,
      name: result.name,
      bytes: A.save(result),
      updatedAt: new Date().toISOString(),
    })
    await tx.done
    return result
  }
  async import(doc: WorkspaceDoc, sender: string): Promise<Receipt> {
    validateWorkspace(doc)
    const tx = (await this.db).transaction(['workspaces', 'receipts', 'settings'], 'readwrite')
    const row = await tx.objectStore('workspaces').get(doc.id)
    const local = row ? A.load<import('../core/model').Workspace>(row.bytes, this.actorId) : null
    const sameBefore = !!local && heads(local) === heads(doc)
    const merged = local ? mergeWorkspace(local, doc) : A.clone(doc, this.actorId)
    const receipt = {
      workspaceId: doc.id,
      sender,
      receivedAt: new Date().toISOString(),
      sameBefore,
      matchedHeads: heads(merged) === heads(doc) ? heads(merged) : '',
    }
    await tx.objectStore('workspaces').put({
      id: merged.id,
      name: merged.name,
      bytes: A.save(merged),
      updatedAt: receipt.receivedAt,
    })
    await tx.objectStore('receipts').put(receipt, doc.id)
    await tx.objectStore('settings').put(doc.id, 'active')
    await tx.done
    return receipt
  }
  async getSetting(key: string) {
    return (await this.db).get('settings', key)
  }
  async setSetting(key: string, value: string) {
    return (await this.db).put('settings', value, key)
  }
  async getReceiver() {
    return (await this.db).get('receiver', 'pending')
  }
  async saveReceiver(state: ReceiverState) {
    return (await this.db).put('receiver', state, 'pending')
  }
  async clearReceiver() {
    return (await this.db).delete('receiver', 'pending')
  }
  async getReceipt(id: string) {
    return (await this.db).get('receipts', id)
  }
  async close() {
    ;(await this.db).close()
  }
}
