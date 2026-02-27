const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

async function getUserIdByUsername(username) {
  const res = await fetch('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: true })
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const data = await res.json().catch(() => null);
  const entry = Array.isArray(data?.data) ? data.data[0] : null;
  return entry?.id || null;
}

async function getUserInfo(userId) {
  const res = await fetch(`https://users.roblox.com/v1/users/${userId}`).catch(() => null);
  if (!res || !res.ok) return null;
  const data = await res.json().catch(() => null);
  return data || null;
}

async function getAvatarHeadshotUrl(userId) {
  const res = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`).catch(() => null);
  if (!res || !res.ok) return null;
  const data = await res.json().catch(() => null);
  const entry = Array.isArray(data?.data) ? data.data[0] : null;
  return entry?.imageUrl || null;
}

async function getAvatarFullUrl(userId) {
  const res = await fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=720x720&format=Png&isCircular=false`).catch(() => null);
  if (!res || !res.ok) return null;
  const data = await res.json().catch(() => null);
  const entry = Array.isArray(data?.data) ? data.data[0] : null;
  return entry?.imageUrl || null;
}

// presença removida

module.exports = {
  data: new SlashCommandBuilder()
    .setName('perfil-roblox')
    .setDescription('Mostra perfil do Roblox (avatar, nome, id, criação)')
    .addStringOption(opt =>
      opt.setName('usuario')
        .setDescription('Nome de usuário do Roblox')
        .setRequired(false)
    )
    .addIntegerOption(opt =>
      opt.setName('id')
        .setDescription('ID do usuário no Roblox')
        .setRequired(false)
    ),

  async execute(interaction) {
    const username = interaction.options.getString('usuario');
    const idOpt = interaction.options.getInteger('id');

    if (!username && !idOpt) {
      return interaction.reply({ content: '❌ Você precisa informar um **usuário** ou um **ID**!', flags: 64 });
    }

    await interaction.deferReply();
    
    let userId = idOpt || null;
    if (!userId && username) {
      userId = await getUserIdByUsername(username);
    }

    if (!userId) {
      return interaction.editReply({ content: 'Não foi possível identificar o usuário. Informe um nome de usuário válido ou um ID.' });
    }

    const info = await getUserInfo(userId);
    if (!info) {
      return interaction.editReply({ content: 'Não foi possível obter informações do usuário no Roblox.' });
    }

    const headshotUrl = await getAvatarHeadshotUrl(userId);
    const fullAvatarUrl = await getAvatarFullUrl(userId);
    const created = info.created ? new Date(info.created) : null;
    const createdStr = created ? created.toLocaleDateString() + ' ' + created.toLocaleTimeString() : 'Desconhecido';
    const ageDays = created ? Math.floor((Date.now() - created.getTime()) / (24 * 60 * 60 * 1000)) : null;
    const profileUrl = `https://www.roblox.com/users/${info.id || userId}/profile`;
    const displayName = info.displayName || info.name || 'Desconhecido';
    const desc = (info.description || '').trim();
    const shortDesc = desc ? (desc.length > 200 ? desc.slice(0, 197) + '…' : desc) : 'Sem descrição';
    const banned = info.isBanned ? 'Sim' : 'Não';

    const embed = new EmbedBuilder()
      .setTitle(`Perfil Roblox: ${displayName}`)
      .setURL(profileUrl)
      .setColor(0xFFA500)
      .setThumbnail(headshotUrl || null)
      .addFields(
        { name: 'Nome', value: info.name || 'Desconhecido', inline: true },
        { name: 'Display Name', value: displayName, inline: true },
        { name: 'ID', value: String(info.id || userId), inline: true },
        { name: 'Criado em', value: createdStr, inline: true },
        { name: 'Idade da conta', value: ageDays != null ? `${ageDays} dia(s)` : 'Desconhecido', inline: true },
        { name: 'Banido', value: banned, inline: true },
        { name: 'Descrição', value: shortDesc, inline: false },
        { name: 'Link do Perfil', value: profileUrl, inline: false }
      );

    if (fullAvatarUrl) {
      embed.setImage(fullAvatarUrl);
    }

    await interaction.editReply({ embeds: [embed] });
  },

  async executePrefix(message, args) {
    const input = args[0];
    if (!input) return message.reply('❌ Você precisa informar um **usuário** ou um **ID**! Ex: `f!perfil-roblox builderman`');

    let userId = !isNaN(input) ? parseInt(input) : await getUserIdByUsername(input);

    if (!userId) {
      return message.reply('❌ Não foi possível identificar o usuário. Informe um nome de usuário válido ou um ID.');
    }

    const info = await getUserInfo(userId);
    if (!info) {
      return message.reply('❌ Não foi possível obter informações do usuário no Roblox.');
    }

    const headshotUrl = await getAvatarHeadshotUrl(userId);
    const fullAvatarUrl = await getAvatarFullUrl(userId);
    const created = info.created ? new Date(info.created) : null;
    const createdStr = created ? created.toLocaleDateString() + ' ' + created.toLocaleTimeString() : 'Desconhecido';
    const ageDays = created ? Math.floor((Date.now() - created.getTime()) / (24 * 60 * 60 * 1000)) : null;
    const profileUrl = `https://www.roblox.com/users/${info.id || userId}/profile`;
    const displayName = info.displayName || info.name || 'Desconhecido';
    const desc = (info.description || '').trim();
    const shortDesc = desc ? (desc.length > 200 ? desc.slice(0, 197) + '…' : desc) : 'Sem descrição';
    const banned = info.isBanned ? 'Sim' : 'Não';

    const embed = new EmbedBuilder()
      .setTitle(`Perfil Roblox: ${displayName}`)
      .setURL(profileUrl)
      .setColor(0xFFA500)
      .setThumbnail(headshotUrl || null)
      .addFields(
        { name: 'Nome', value: info.name || 'Desconhecido', inline: true },
        { name: 'Display Name', value: displayName, inline: true },
        { name: 'ID', value: String(info.id || userId), inline: true },
        { name: 'Criado em', value: createdStr, inline: true },
        { name: 'Idade da conta', value: ageDays != null ? `${ageDays} dia(s)` : 'Desconhecido', inline: true },
        { name: 'Banido', value: banned, inline: true },
        { name: 'Descrição', value: shortDesc, inline: false },
        { name: 'Link do Perfil', value: profileUrl, inline: false }
      );

    if (fullAvatarUrl) {
      embed.setImage(fullAvatarUrl);
    }

    await message.reply({ embeds: [embed] });
  }
};
