const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pathUpload = path.join(__dirname, '../../uploads');

// URL base para acessar as imagens (configure no .env)
// Exemplo: BASE_URL=https://seudominio.com
const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

// Ensure upload directory exists
if (!fs.existsSync(pathUpload)) {
  fs.mkdirSync(pathUpload, { recursive: true });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('imagem')
    .setDescription('Envie uma imagem e receba um link para usar em embeds')
    .addAttachmentOption(option =>
      option.setName('arquivo')
        .setDescription('A imagem que você deseja fazer upload (JPG, PNG, GIF, WebP)')
        .setRequired(true)
    ),

  async execute(interaction) {
    const attachment = interaction.options.getAttachment('arquivo');

    // Validar se é uma imagem
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(attachment.contentType)) {
      return await interaction.reply({
        content: '❌ Erro: O arquivo deve ser uma imagem (JPG, PNG, GIF ou WebP).',
        ephemeral: true
      });
    }

    // Validar tamanho (10MB = 10 * 1024 * 1024 bytes)
    const maxSize = 10 * 1024 * 1024;
    if (attachment.size > maxSize) {
      return await interaction.reply({
        content: '❌ Erro: O arquivo deve ter no máximo 10MB.',
        ephemeral: true
      });
    }

    await interaction.deferReply();

    try {
      // Baixar a imagem do Discord
      const response = await fetch(attachment.url);
      const buffer = await response.arrayBuffer();

      // Gerar nome único para o arquivo
      const uniqueId = crypto.randomBytes(8).toString('hex');
      const ext = path.extname(attachment.name) || '.jpg';
      const filename = `${uniqueId}${ext}`;
      const localPath = path.join(pathUpload, filename);

      // Salvar arquivo localmente
      fs.writeFileSync(localPath, Buffer.from(buffer));

      // URL para acesso local (via servidor web do bot)
      const cdnUrl = `${BASE_URL}/uploads/${filename}`;

      // Formatar tamanho do arquivo
      const sizeMB = (attachment.size / (1024 * 1024)).toFixed(2);
      const format = attachment.contentType.split('/')[1].toUpperCase();

      console.log(`📤 [UPLOAD] ${interaction.user.tag} (${interaction.user.id}) uploadou ${attachment.name} -> ${cdnUrl}`);

      // Criar embed de resposta
      const embed = new EmbedBuilder()
        .setTitle('🖼️ Upload de Imagem Concluído!')
        .setColor('#00D26A')
        .addFields(
          { name: '🔗 Link CDN', value: cdnUrl, inline: false },
          { name: '📋 Como usar em embeds', value: `\`\`\`json\n{\n  "image": {\n    "url": "${cdnUrl}"\n  }\n}\n\`\`\``, inline: false },
          { name: '📊 Informações', value: `📁 Nome: ${attachment.name}\n📏 Tamanho: ${sizeMB} MB\n🎨 Formato: ${format}`, inline: false }
        )
        .setFooter({ text: `Upload por ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('❌ Erro ao processar upload:', error);
      await interaction.editReply({
        content: '❌ Ocorreu um erro ao processar sua imagem. Tente novamente mais tarde.',
        ephemeral: true
      });
    }
  },

  async executePrefix(message, args) {
    // Verificar se há anexo na mensagem
    const attachment = message.attachments.first();

    if (!attachment) {
      return await message.reply({
        content: '❌ Erro: Você precisa anexar uma imagem ao comando.\n📝 Uso: `!imagem` (com anexo)'
      });
    }

    // Validar se é uma imagem
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(attachment.contentType)) {
      return await message.reply({
        content: '❌ Erro: O arquivo deve ser uma imagem (JPG, PNG, GIF ou WebP).'
      });
    }

    // Validar tamanho (10MB)
    const maxSize = 10 * 1024 * 1024;
    if (attachment.size > maxSize) {
      return await message.reply({
        content: '❌ Erro: O arquivo deve ter no máximo 10MB.'
      });
    }

    const msg = await message.reply('📤 Processando upload de imagem...');

    try {
      // Baixar a imagem
      const response = await fetch(attachment.url);
      const buffer = await response.arrayBuffer();

      // Gerar nome único
      const uniqueId = crypto.randomBytes(8).toString('hex');
      const ext = path.extname(attachment.name) || '.jpg';
      const filename = `${uniqueId}${ext}`;
      const localPath = path.join(pathUpload, filename);

      // Salvar localmente
      fs.writeFileSync(localPath, Buffer.from(buffer));

      // URL local
      const cdnUrl = `${BASE_URL}/uploads/${filename}`;

      // Formatar informações
      const sizeMB = (attachment.size / (1024 * 1024)).toFixed(2);
      const format = attachment.contentType.split('/')[1].toUpperCase();

      console.log(`📤 [UPLOAD] ${message.author.tag} (${message.author.id}) uploadou ${attachment.name} -> ${cdnUrl}`);

      const embed = new EmbedBuilder()
        .setTitle('🖼️ Upload de Imagem Concluído!')
        .setColor('#00D26A')
        .addFields(
          { name: '🔗 Link CDN', value: cdnUrl, inline: false },
          { name: '📋 Como usar em embeds', value: `\`\`\`json\n{\n  "image": {\n    "url": "${cdnUrl}"\n  }\n}\n\`\`\``, inline: false },
          { name: '📊 Informações', value: `📁 Nome: ${attachment.name}\n📏 Tamanho: ${sizeMB} MB\n🎨 Formato: ${format}`, inline: false }
        )
        .setFooter({ text: `Upload por ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
        .setTimestamp();

      await msg.edit({ embeds: [embed] });

    } catch (error) {
      console.error('❌ Erro ao processar upload (prefix):', error);
      await msg.edit({
        content: '❌ Ocorreu um erro ao processar sua imagem. Tente novamente mais tarde.'
      });
    }
  }
};
