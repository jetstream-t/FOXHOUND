const { REST, Routes } = require('discord.js');
const { clientId, guildId, token } = require('./config.json');
const fs = require('fs');
const path = require('path');

// Carregar apenas o comando de configurações
const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const configFiles = fs.readdirSync(commandsPath).filter(file => file === 'Admin');

if (configFiles.length > 0) {
    const adminPath = path.join(commandsPath, 'Admin');
    const commandFiles = fs.readdirSync(adminPath).filter(file => file.endsWith('.js'));
    
    for (const file of commandFiles) {
        const filePath = path.join(adminPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
            console.log(`[DEPLOY] Comando carregado: ${command.data.name}`);
        } else {
            console.log(`[AVISO] O comando em ${filePath} está faltando "data" ou "execute"`);
        }
    }
}

// Construir e deploy dos comandos
const rest = new REST().setToken(token);

(async () => {
    try {
        console.log(`[DEPLOY] Iniciando refresh de ${commands.length} comando(s) de configuração...`);

        // Deploy global (para todos os servidores)
        const data = await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands },
        );

        console.log(`[DEPLOY] Sucesso! ${data.length} comando(s) de configuração registrado(s) globalmente.`);
    } catch (error) {
        console.error('[DEPLOY] Erro ao fazer deploy dos comandos:', error);
    }
})();
