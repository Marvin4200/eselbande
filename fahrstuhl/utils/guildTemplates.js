/**
 * Guild Template System - Pre-configured guild settings templates
 */

class GuildTemplates {
    constructor(config = {}) {
        this.templates = new Map(); // templateName -> template config
        this.defaultTemplate = null;
    }

    /**
     * Create a new template
     * @param {string} name - Template name
     * @param {Object} config - Template configuration
     */
    createTemplate(name, config) {
        this.templates.set(name, {
            name,
            config,
            createdAt: new Date().toISOString(),
            usageCount: 0
        });
    }

    /**
     * Apply template to guild
     * @param {string} templateName - Template name
     * @param {string} guildId - Guild ID
     * @returns {Object} - Applied configuration
     */
    applyTemplate(templateName, guildId) {
        const template = this.templates.get(templateName);
        if (!template) return null;

        template.usageCount++;
        return {
            guildId,
            appliedTemplate: templateName,
            config: JSON.parse(JSON.stringify(template.config)), // Deep copy
            appliedAt: new Date().toISOString()
        };
    }

    /**
     * List all templates
     * @returns {Array<Object>}
     */
    listTemplates() {
        return Array.from(this.templates.values()).map(t => ({
            name: t.name,
            createdAt: t.createdAt,
            usageCount: t.usageCount
        }));
    }

    /**
     * Delete template
     * @param {string} name - Template name
     */
    deleteTemplate(name) {
        this.templates.delete(name);
    }

    /**
     * Set default template
     * @param {string} name - Template name
     */
    setDefault(name) {
        if (this.templates.has(name)) {
            this.defaultTemplate = name;
        }
    }

    /**
     * Get default template
     * @returns {Object}
     */
    getDefault() {
        if (!this.defaultTemplate) return null;
        return this.templates.get(this.defaultTemplate);
    }

    /**
     * Clone template
     * @param {string} sourceName - Source template
     * @param {string} newName - New template name
     */
    cloneTemplate(sourceName, newName) {
        const source = this.templates.get(sourceName);
        if (!source) return false;

        this.templates.set(newName, {
            name: newName,
            config: JSON.parse(JSON.stringify(source.config)),
            createdAt: new Date().toISOString(),
            usageCount: 0
        });

        return true;
    }
}

module.exports = GuildTemplates;
