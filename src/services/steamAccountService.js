import database from './database.js'

class SteamAccountService {
    constructor() {
        this.db = database
        this.statementsInitialized = false
        this.statements = {}
    }

    async initStatements() {
        if (this.statementsInitialized) return
        await this.db.ensureInitialized()
        this.statements = {
            insert: await this.db.prepare(`
                INSERT INTO steam_accounts (label, notes)
                VALUES (?, ?)
            `),
            update: await this.db.prepare(`
                UPDATE steam_accounts
                SET label = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `),
            delete: await this.db.prepare('DELETE FROM steam_accounts WHERE id = ?'),
            getById: await this.db.prepare('SELECT * FROM steam_accounts WHERE id = ?'),
            getAll: await this.db.prepare('SELECT * FROM steam_accounts ORDER BY label ASC'),
            getLinkedCharacters: await this.db.prepare('SELECT id FROM characters WHERE steam_account_id = ?'),
            reassignCharacters: await this.db.prepare('UPDATE characters SET steam_account_id = ? WHERE steam_account_id = ?'),
            clearCharacters: await this.db.prepare('UPDATE characters SET steam_account_id = NULL WHERE steam_account_id = ?')
        }
        this.statementsInitialized = true
    }

    async ensureInitialized() {
        if (!this.statementsInitialized) await this.initStatements()
    }

    async getAll() {
        await this.ensureInitialized()
        return this.statements.getAll.all()
    }

    async getById(id) {
        await this.ensureInitialized()
        return this.statements.getById.get(id) || null
    }

    async create(payload) {
        await this.ensureInitialized()
        const { label, notes = null } = payload || {}
        if (!label || !label.trim()) throw new Error('Label is required')
        try {
            const res = this.statements.insert.run(label.trim(), notes || null)
            return this.getById(res.lastInsertRowid)
        } catch (e) {
            if (String(e?.message || '').includes('UNIQUE')) {
                throw new Error('A Steam account with this label already exists')
            }
            throw e
        }
    }

    async update(id, partial) {
        await this.ensureInitialized()
        const existing = await this.getById(id)
        if (!existing) throw new Error('Steam account not found')
        const label = (partial?.label ?? existing.label)
        const notes = (partial?.notes ?? existing.notes)
        if (!label || !label.trim()) throw new Error('Label is required')
        try {
            this.statements.update.run(label.trim(), notes || null, id)
            return await this.getById(id)
        } catch (e) {
            if (String(e?.message || '').includes('UNIQUE')) {
                throw new Error('A Steam account with this label already exists')
            }
            throw e
        }
    }

    async delete(id, options = {}) {
        await this.ensureInitialized()
        const existing = await this.getById(id)
        if (!existing) return true
        const linked = this.statements.getLinkedCharacters.all(id)
        if (linked.length > 0) {
            if (options?.reassignToId) {
                if (options.reassignToId === id) return true
                this.statements.reassignCharacters.run(options.reassignToId, id)
            } else {
                this.statements.clearCharacters.run(id)
            }
        }
        const res = this.statements.delete.run(id)
        return res.changes > 0
    }
}

export default new SteamAccountService()


