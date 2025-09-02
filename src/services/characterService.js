import database from './database.js'

class CharacterService {
    constructor() {
        this.db = database
        this.statementsInitialized = false
        this.statements = {}
    }

    async initStatements() {
        if (this.statementsInitialized) return
        
        // Ensure database is initialized
        await this.db.ensureInitialized()
        
        // Prepare all SQL statements for better performance
        this.statements = {
            insert: await this.db.prepare(`
                INSERT INTO characters (name, server_name, server_timezone, faction, company, steam_account_id, active_status, notes, avatar_path)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `),
            update: await this.db.prepare(`
                UPDATE characters 
                SET name = ?, server_name = ?, server_timezone = ?, faction = ?, company = ?, steam_account_id = ?, active_status = ?, notes = ?, avatar_path = ?
                WHERE id = ?
            `),
            delete: await this.db.prepare('DELETE FROM characters WHERE id = ?'),
            getById: await this.db.prepare(`
                SELECT c.*, sa.label AS steam_label
                FROM characters c
                LEFT JOIN steam_accounts sa ON sa.id = c.steam_account_id
                WHERE c.id = ?
            `),
            getAll: await this.db.prepare(`
                SELECT c.*, sa.label AS steam_label
                FROM characters c
                LEFT JOIN steam_accounts sa ON sa.id = c.steam_account_id
                ORDER BY c.active_status DESC, c.name ASC
            `),
            getActive: await this.db.prepare(`
                SELECT c.*, sa.label AS steam_label
                FROM characters c
                LEFT JOIN steam_accounts sa ON sa.id = c.steam_account_id
                WHERE c.active_status = 1
                ORDER BY c.name ASC
            `),
            getByServer: await this.db.prepare('SELECT * FROM characters WHERE server_name = ? ORDER BY name ASC'),
            getByFaction: await this.db.prepare('SELECT * FROM characters WHERE faction = ? ORDER BY name ASC'),
            updateActiveStatus: await this.db.prepare('UPDATE characters SET active_status = ? WHERE id = ?'),
            getServerList: await this.db.prepare('SELECT DISTINCT server_name FROM characters ORDER BY server_name ASC'),
            getCharacterCount: await this.db.prepare('SELECT COUNT(*) as count FROM characters'),
            getActiveCharacterCount: await this.db.prepare('SELECT COUNT(*) as count FROM characters WHERE active_status = 1'),
            searchCharacters: await this.db.prepare(`
                SELECT * FROM characters 
                WHERE name LIKE ? OR server_name LIKE ? OR company LIKE ? 
                ORDER BY active_status DESC, name ASC
            `),
            getCharactersByIds: await this.db.prepare(`
                SELECT * FROM characters 
                WHERE id IN (${Array(50).fill('?').join(',')})
                ORDER BY name ASC
            `)
        }
        
        this.statementsInitialized = true
    }

    // Ensure statements are initialized
    async ensureInitialized() {
        if (!this.statementsInitialized) {
            await this.initStatements()
        }
    }

	    // Create a new character
	    async create(characterData) {
	        await this.ensureInitialized()
	        try {
	            const raw = characterData || {}
	            const name = raw.name
	            const serverName = raw.serverName ?? raw.server_name
	            const serverTimezone = raw.serverTimezone ?? raw.server_timezone
	            const faction = raw.faction
	            const company = Object.prototype.hasOwnProperty.call(raw, 'company') ? raw.company : null
	            const steamAccountId = Object.prototype.hasOwnProperty.call(raw, 'steam_account_id')
	                ? raw.steam_account_id
	                : (Object.prototype.hasOwnProperty.call(raw, 'steamAccountId') ? raw.steamAccountId : null)
	            const activeStatus = Object.prototype.hasOwnProperty.call(raw, 'activeStatus')
	                ? raw.activeStatus
	                : (Object.prototype.hasOwnProperty.call(raw, 'active_status') ? raw.active_status : true)
	            const notes = Object.prototype.hasOwnProperty.call(raw, 'notes') ? raw.notes : null
	            const avatarPath = raw.avatarPath ?? raw.avatar_path ?? null

	            // Validate required fields
	            if (!name || !serverName || !serverTimezone) {
	                throw new Error('Name, server name, and server timezone are required')
	            }

            // Validate faction (allow Factionless default)
            if (faction && !['Factionless', 'Marauders', 'Covenant', 'Syndicate'].includes(faction)) {
                throw new Error('Invalid faction. Must be one of: Factionless, Marauders, Covenant, Syndicate')
            }

	            const result = this.statements.insert.run(
	                name,
	                serverName,
	                serverTimezone,
	                faction,
	                company,
	                steamAccountId,
	                activeStatus ? 1 : 0,
	                notes,
	                avatarPath
	            )

	            const character = await this.getById(result.lastInsertRowid)
	            return character
	        } catch (error) {
	            console.error('Error creating character:', error)
	            throw error
	        }
	    }

	    // Update an existing character
	    async update(id, characterData) {
	        await this.ensureInitialized()
	        try {
	            const existing = await this.getById(id)
	            if (!existing) {
	                throw new Error('Character not found')
	            }

	            const raw = characterData || {}
	            const name = raw.name ?? existing.name
	            const serverName = (raw.serverName ?? raw.server_name) ?? existing.server_name
	            const serverTimezone = (raw.serverTimezone ?? raw.server_timezone) ?? existing.server_timezone
	            const faction = raw.faction ?? existing.faction
	            const company = Object.prototype.hasOwnProperty.call(raw, 'company') ? raw.company : existing.company
	            const steamAccountId = Object.prototype.hasOwnProperty.call(raw, 'steam_account_id')
	                ? raw.steam_account_id
	                : (Object.prototype.hasOwnProperty.call(raw, 'steamAccountId') ? raw.steamAccountId : existing.steam_account_id)
	            const activeStatus = Object.prototype.hasOwnProperty.call(raw, 'activeStatus')
	                ? raw.activeStatus
	                : (Object.prototype.hasOwnProperty.call(raw, 'active_status') ? raw.active_status : existing.active_status)
	            const notes = Object.prototype.hasOwnProperty.call(raw, 'notes') ? raw.notes : existing.notes
	            const avatarPath = (raw.avatarPath ?? raw.avatar_path) ?? existing.avatar_path

            // Validate faction (allow Factionless default)
            if (faction && !['Factionless', 'Marauders', 'Covenant', 'Syndicate'].includes(faction)) {
                throw new Error('Invalid faction. Must be one of: Factionless, Marauders, Covenant, Syndicate')
            }

	            this.statements.update.run(
	                name,
	                serverName,
	                serverTimezone,
	                faction,
	                company,
	                steamAccountId,
	                activeStatus ? 1 : 0,
	                notes,
	                avatarPath,
	                id
	            )

	            return await this.getById(id)
	        } catch (error) {
	            console.error('Error updating character:', error)
	            throw error
	        }
	    }

    // Delete a character
    async delete(id) {
        await this.ensureInitialized()
        try {
            const existing = await this.getById(id)
            if (!existing) {
                throw new Error('Character not found')
            }

            const result = this.statements.delete.run(id)
            return result.changes > 0
        } catch (error) {
            console.error('Error deleting character:', error)
            throw error
        }
    }

    // Get character by ID
    async getById(id) {
        await this.ensureInitialized()
        try {
            return this.statements.getById.get(id)
        } catch (error) {
            console.error('Error getting character by ID:', error)
            return null
        }
    }

    // Get all characters
    async getAll() {
        await this.ensureInitialized()
        try {
            return this.statements.getAll.all()
        } catch (error) {
            console.error('Error getting all characters:', error)
            return []
        }
    }

    // Get active characters only
    getActive() {
        try {
            return this.statements.getActive.all()
        } catch (error) {
            console.error('Error getting active characters:', error)
            return []
        }
    }

    // Get characters by server
    getByServer(serverName) {
        try {
            return this.statements.getByServer.all(serverName)
        } catch (error) {
            console.error('Error getting characters by server:', error)
            return []
        }
    }

    // Get characters by faction
    getByFaction(faction) {
        try {
            return this.statements.getByFaction.all(faction)
        } catch (error) {
            console.error('Error getting characters by faction:', error)
            return []
        }
    }

    // Update character active status
    async updateActiveStatus(id, activeStatus) {
        try {
            const result = this.statements.updateActiveStatus.run(activeStatus ? 1 : 0, id)
            return result.changes > 0
        } catch (error) {
            console.error('Error updating character active status:', error)
            throw error
        }
    }

    // Get list of unique servers
    getServerList() {
        try {
            return this.statements.getServerList.all().map(row => row.server_name)
        } catch (error) {
            console.error('Error getting server list:', error)
            return []
        }
    }

    // Get character statistics
    getStatistics() {
        try {
            const total = this.statements.getCharacterCount.get()
            const active = this.statements.getActiveCharacterCount.get()
            
            return {
                total: total.count,
                active: active.count,
                inactive: total.count - active.count
            }
        } catch (error) {
            console.error('Error getting character statistics:', error)
            return { total: 0, active: 0, inactive: 0 }
        }
    }

    // Search characters
    search(searchTerm) {
        try {
            const term = `%${searchTerm}%`
            return this.statements.searchCharacters.all(term, term, term)
        } catch (error) {
            console.error('Error searching characters:', error)
            return []
        }
    }

    // Get characters by multiple IDs
    getByIds(ids) {
        try {
            if (!ids || ids.length === 0) {
                return []
            }

            // For simplicity, we'll use individual queries if too many IDs
            if (ids.length > 50) {
                return ids.map(id => this.getById(id)).filter(char => char !== null)
            }

            // Pad the array to 50 items (max supported by prepared statement)
            const paddedIds = [...ids, ...Array(50 - ids.length).fill(null)]
            const results = this.statements.getCharactersByIds.all(...paddedIds)
            
            return results.filter(char => char !== null)
        } catch (error) {
            console.error('Error getting characters by IDs:', error)
            return []
        }
    }

    // Get character with server time information
    async getCharacterWithServerTime(id) {
        try {
            const character = await this.getById(id)
            if (!character) {
                return null
            }

            // Import TimeZoneService dynamically to avoid circular dependencies
            const { default: TimeZoneService } = await import('./timezone.js')
            
            return {
                ...character,
                serverTime: TimeZoneService.getServerTime(character.server_name),
                serverTimeString: TimeZoneService.getServerTimeString(character.server_name),
                nextDailyReset: TimeZoneService.getNextResetTime(character.server_name, 'daily'),
                nextWeeklyReset: TimeZoneService.getNextResetTime(character.server_name, 'weekly'),
                timeUntilDailyReset: TimeZoneService.getTimeUntilReset(character.server_name, 'daily'),
                timeUntilWeeklyReset: TimeZoneService.getTimeUntilReset(character.server_name, 'weekly')
            }
        } catch (error) {
            console.error('Error getting character with server time:', error)
            return null
        }
    }

    // Get all characters with server time information
    async getAllWithServerTime() {
        try {
            const characters = await this.getAll()
            return await Promise.all(characters.map(async character => {
                try {
                    return await this.getCharacterWithServerTime(character.id)
                } catch (error) {
                    console.error(`Error getting server time for character ${character.id}:`, error)
                    return character
                }
            }))
        } catch (error) {
            console.error('Error getting all characters with server time:', error)
            return []
        }
    }

    // Export character data
    exportCharacters() {
        try {
            const characters = this.getAll()
            return {
                exportDate: new Date().toISOString(),
                characters: characters
            }
        } catch (error) {
            console.error('Error exporting characters:', error)
            return { exportDate: new Date().toISOString(), characters: [] }
        }
    }

    // Import character data
    async importCharacters(importData) {
        try {
            const { characters } = importData
            if (!characters || !Array.isArray(characters)) {
                throw new Error('Invalid import data format')
            }

            const imported = []
            const errors = []

            for (const characterData of characters) {
                try {
                    const character = await this.create({
                        name: characterData.name,
                        serverName: characterData.server_name,
                        serverTimezone: characterData.server_timezone,
                        faction: characterData.faction,
                        company: characterData.company,
                        activeStatus: characterData.active_status,
                        notes: characterData.notes,
                        avatarPath: characterData.avatar_path
                    })
                    imported.push(character)
                } catch (error) {
                    errors.push({ character: characterData.name, error: error.message })
                }
            }

            return { imported, errors }
        } catch (error) {
            console.error('Error importing characters:', error)
            throw error
        }
    }
}

// Export singleton instance
const characterService = new CharacterService()
export default characterService 