import database from './database.js'

class ParticipationStatusService {
    constructor() {
        this.db = database
        this.statementsInitialized = false
        this.statements = {}
    }

    async ensureInitialized() {
        await this.db.ensureInitialized()
        if (this.statementsInitialized) return
        this.statements = {
            getAll: await this.db.prepare(`
                SELECT * FROM participation_statuses ORDER BY sort_order ASC, name ASC
            `),
            getById: await this.db.prepare(`
                SELECT * FROM participation_statuses WHERE id = ?
            `),
            getBySlug: await this.db.prepare(`
                SELECT * FROM participation_statuses WHERE slug = ?
            `),
            insert: await this.db.prepare(`
                INSERT INTO participation_statuses (name, slug, color_bg, color_text, sort_order, is_absent)
                VALUES (?, ?, ?, ?, ?, ?)
            `),
            update: await this.db.prepare(`
                UPDATE participation_statuses SET name = ?, slug = ?, color_bg = ?, color_text = ?, sort_order = ?, is_absent = ? WHERE id = ?
            `),
            delete: await this.db.prepare(`
                DELETE FROM participation_statuses WHERE id = ?
            `),
            remapEvents: await this.db.prepare(`
                UPDATE events SET participation_status = ? WHERE participation_status = ?
            `)
        }
        this.statementsInitialized = true
    }

    async getAll() {
        await this.ensureInitialized()
        return this.statements.getAll.all()
    }

    async create({ name, slug, color_bg, color_text, sort_order = 0, is_absent = 0 }) {
        await this.ensureInitialized()
        const res = this.statements.insert.run(name, slug, color_bg, color_text, sort_order, is_absent ? 1 : 0)
        if (res.changes > 0) return this.getById(res.lastInsertRowid)
        return null
    }

    async update(id, { name, slug, color_bg, color_text, sort_order = 0, is_absent = 0 }) {
        await this.ensureInitialized()
        const res = this.statements.update.run(name, slug, color_bg, color_text, sort_order, is_absent ? 1 : 0, id)
        if (res.changes > 0) return this.getById(id)
        return null
    }

    async delete(id, options = {}) {
        await this.ensureInitialized()
        // Optional remap before delete
        const { remapFromName, remapToName } = options
        if (remapFromName && remapToName) {
            try { this.statements.remapEvents.run(remapToName, remapFromName) } catch {}
        }
        const res = this.statements.delete.run(id)
        return res.changes > 0
    }

    async getById(id) { await this.ensureInitialized(); return this.statements.getById.get(id) || null }
    async getBySlug(slug) { await this.ensureInitialized(); return this.statements.getBySlug.get(slug) || null }
}

export default new ParticipationStatusService()
