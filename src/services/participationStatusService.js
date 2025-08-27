import database from './database.js'

class ParticipationStatusService {
  constructor() {
    this.db = database
    this.statements = {}
    this.initialized = false
  }

  async ensureInitialized() {
    if (this.initialized) return
    await this.db.ensureInitialized()
    this.statements = {
      getAll: await this.db.prepare('SELECT * FROM participation_statuses ORDER BY sort_order ASC, name ASC'),
      getById: await this.db.prepare('SELECT * FROM participation_statuses WHERE id = ?'),
      getByName: await this.db.prepare('SELECT * FROM participation_statuses WHERE name = ?'),
      insert: await this.db.prepare(`INSERT INTO participation_statuses (name, slug, color_bg, color_text, sort_order, is_absent, is_default) VALUES (?, ?, ?, ?, ?, ?, ?)`),
      update: await this.db.prepare(`UPDATE participation_statuses SET name = ?, slug = ?, color_bg = ?, color_text = ?, sort_order = ?, is_absent = ?, is_default = ? WHERE id = ?`),
      delete: await this.db.prepare('DELETE FROM participation_statuses WHERE id = ?'),
      remapEvents: await this.db.prepare('UPDATE events SET participation_status = ? WHERE participation_status = ?')
    }
    this.initialized = true
  }

  async getAll() {
    await this.ensureInitialized()
    return this.statements.getAll.all()
  }

  async create(data) {
    await this.ensureInitialized()
    const { name, slug, color_bg, color_text, sort_order = 0, is_absent = false, is_default = false } = data
    const res = this.statements.insert.run(String(name).trim(), String(slug).trim(), color_bg, color_text, sort_order, is_absent ? 1 : 0, is_default ? 1 : 0)
    return this.statements.getById.get(res.lastInsertRowid)
  }

  async update(id, data) {
    await this.ensureInitialized()
    const existing = this.statements.getById.get(id)
    if (!existing) return null
    const merged = { ...existing, ...data }
    this.statements.update.run(merged.name, merged.slug, merged.color_bg, merged.color_text, merged.sort_order, merged.is_absent ? 1 : 0, merged.is_default ? 1 : 0, id)
    return this.statements.getById.get(id)
  }

  async delete(id, replaceWithName = null) {
    await this.ensureInitialized()
    const existing = this.statements.getById.get(id)
    if (!existing) return false
    if (existing.is_default) throw new Error('Cannot delete a default status')
    if (replaceWithName) {
      this.statements.remapEvents.run(replaceWithName, existing.name)
    }
    this.statements.delete.run(id)
    return true
  }
}

export default new ParticipationStatusService()


