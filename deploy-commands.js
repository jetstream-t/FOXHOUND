require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
  console.error('❌ Variáveis do .env faltando');
  console.log({ token, clientId, guildId });
  // Não matar o processo, apenas lançar erro para ser capturado no index.js
  throw new Error('Configuração de deploy local ausente');
}

const commands = [];

// ===============================
// função pra ler comandos recursivamente
// ===============================
function carregarComandos(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);

    if (fs.statSync(filePath).isDirectory()) {
      carregarComandos(filePath);
    } else if (file.endsWith('.js')) {
      const command = require(filePath);
      if (command.data) {
        commands.push(command.data.toJSON());
        console.log(`📦 Registrando /${command.data.name}`);
      }
    }
  }
}

carregarComandos(path.join(__dirname, 'commands'));

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('🚀 Enviando comandos para o servidor (Guild)...');
    
    // Fazemos apenas um PUT direto com a lista de comandos.
    // O Discord remove automaticamente os antigos que não estão na lista.
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );

    console.log('✅ Deploy de Guild feito com sucesso!');
    console.log('💡 Dica: Só rode este script quando alterar a ESTRUTURA (nome/opções) dos comandos.');
  } catch (error) {
    if (error.status === 429) {
      console.error('❌ RATE LIMIT atingido! Aguarde alguns minutos antes de tentar novamente.');
    } else {
      console.error('❌ Erro no deploy:', error);
    }
  }
})();