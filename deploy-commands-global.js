require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token || !clientId) {
  console.error('❌ Variáveis DISCORD_TOKEN ou CLIENT_ID faltando no .env');
  // Não matar o processo, apenas lançar erro para ser capturado no index.js
  throw new Error('Configuração de deploy ausente');
}

const commands = [];
const commandNames = new Set();

function carregarComandos(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);

    if (fs.statSync(filePath).isDirectory()) {
      carregarComandos(filePath);
    } else if (file.endsWith('.js')) {
      try {
        const command = require(filePath);
        if (command.data && command.data.name) {
          if (commandNames.has(command.data.name)) {
             console.warn(`⚠️ AVISO: Comando duplicado encontrado: ${command.data.name} em ${filePath}. Ignorando duplicata.`);
             continue;
          }
          
          commands.push(command.data.toJSON());
          commandNames.add(command.data.name);
          console.log(`📦 Registrando /${command.data.name} (Global)`);
        }
      } catch (err) {
        console.error(`❌ Erro ao carregar ${file}:`, err);
      }
    }
  }
}

carregarComandos(path.join(__dirname, 'commands'));

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('🚀 Enviando comandos GLOBALMENTE...');
    
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands }
    );

    console.log('✅ Deploy Global feito com sucesso!');
    console.log('💡 Nota: Comandos globais podem levar até 1 hora para aparecer em todos os servidores.');
  } catch (error) {
    if (error.status === 429) {
      console.error('❌ RATE LIMIT atingido! Aguarde alguns minutos antes de tentar novamente.');
    } else {
      console.error('❌ Erro no deploy global:', error);
    }
  }
})();
