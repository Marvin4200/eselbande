// Command alias system - allow multiple names for the same command

class CommandAliasManager {
    constructor() {
        this.aliases = new Map(); // Map of alias -> actual command name
        this.commands = new Map(); // Map of command name -> command handler
    }

    // Register a new command
    registerCommand(commandName, handler) {
        this.commands.set(commandName.toLowerCase(), handler);
    }

    // Register an alias for a command
    registerAlias(alias, targetCommand) {
        const normalizedAlias = alias.toLowerCase();
        const normalizedCommand = targetCommand.toLowerCase();

        if (!this.commands.has(normalizedCommand)) {
            throw new Error(`Target command "${targetCommand}" not found`);
        }

        this.aliases.set(normalizedAlias, normalizedCommand);
    }

    // Register multiple aliases at once
    registerAliases(targetCommand, aliasesList) {
        const normalizedCommand = targetCommand.toLowerCase();

        if (!this.commands.has(normalizedCommand)) {
            throw new Error(`Target command "${targetCommand}" not found`);
        }

        for (const alias of aliasesList) {
            this.aliases.set(alias.toLowerCase(), normalizedCommand);
        }
    }

    // Get the actual command name from an alias (or return the input if it's a command)
    resolveCommand(input) {
        const normalized = input.toLowerCase();
        return this.aliases.get(normalized) || normalized;
    }

    // Check if a command or alias exists
    hasCommand(input) {
        const commandName = this.resolveCommand(input);
        return this.commands.has(commandName);
    }

    // Get command handler
    getHandler(input) {
        const commandName = this.resolveCommand(input);
        return this.commands.get(commandName);
    }

    // Get all aliases for a command
    getAliasesForCommand(commandName) {
        const normalized = commandName.toLowerCase();
        return Array.from(this.aliases.entries())
            .filter(([, target]) => target === normalized)
            .map(([alias]) => alias);
    }

    // Get all aliases
    getAllAliases() {
        return Object.fromEntries(this.aliases);
    }

    // Remove an alias
    removeAlias(alias) {
        this.aliases.delete(alias.toLowerCase());
    }

    // Clear all aliases
    clearAliases() {
        this.aliases.clear();
    }

    // List all commands with their aliases
    listAll() {
        const result = {};
        for (const [command] of this.commands) {
            const aliases = this.getAliasesForCommand(command);
            result[command] = aliases.length > 0 ? aliases : [];
        }
        return result;
    }
}

// Example: Create the manager and setup common troll command aliases
function setupCommandAliases() {
    const aliasManager = new CommandAliasManager();

    // Register main commands
    aliasManager.registerCommand('fahrstuhl', null); // Will be set from actual handler
    aliasManager.registerCommand('geist', null);
    aliasManager.registerCommand('stille', null);
    aliasManager.registerCommand('taubheit', null);
    aliasManager.registerCommand('spiegel', null);
    aliasManager.registerCommand('info', null);
    aliasManager.registerCommand('help', null);
    aliasManager.registerCommand('stop', null);
    aliasManager.registerCommand('settrollrole', null);

    // Register aliases for common variations
    aliasManager.registerAliases('fahrstuhl', ['f', 'elevator', 'lift', 'ec']);
    aliasManager.registerAliases('geist', ['g', 'ghost', 'visit']);
    aliasManager.registerAliases('stille', ['s', 'silent', 'quiet', 'mute']);
    aliasManager.registerAliases('taubheit', ['d', 'deaf', 'deafen']);
    aliasManager.registerAliases('spiegel', ['m', 'mirror']);
    aliasManager.registerAliases('help', ['h', 'hilfe', '?']);
    aliasManager.registerAliases('stop', ['halt', 'cancel', 'abort']);
    aliasManager.registerAliases('info', ['i', 'status', 'stats']);

    return aliasManager;
}

module.exports = {
    CommandAliasManager,
    setupCommandAliases
};
