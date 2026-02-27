const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Mostra informações completas do servidor'),
    async execute(interaction) {
        const guild = interaction.guild;

        // garante que todos os membros estejam carregados
        await guild.members.fetch();

        const totalHumans = guild.members.cache.filter(m => !m.user.bot).size;
        const totalBots = guild.members.cache.filter(m => m.user.bot).size;
        const totalMembers = guild.memberCount;
        const totalChannels = guild.channels.cache.size;
        const totalRoles = guild.roles.cache.size;
        const totalEmojis = guild.emojis.cache.size;

        const embed = new EmbedBuilder()
            .setTitle(`📊 Informações do servidor: ${guild.name}`)
            .setColor(0xE67E22) // laranja
            .setDescription(
                `💁 Humanos: ${totalHumans}\n` +
                `🤖 Bots: ${totalBots}\n` +
                `👥 Total: ${totalMembers}\n\n` +
                `🗂 Canais: ${totalChannels}\n` +
                `🔑 Cargos: ${totalRoles}\n` +
                `😃 Emojis: ${totalEmojis}\n\n` +
                `🆔 ID do servidor: ${guild.id}\n` +
                `📅 Criado em: ${guild.createdAt.toLocaleDateString()}`
            );

        await interaction.reply({ embeds: [embed] });
    },

    async executePrefix(message) {
        const guild = message.guild;
        await guild.members.fetch();

        const totalHumans = guild.members.cache.filter(m => !m.user.bot).size;
        const totalBots = guild.members.cache.filter(m => m.user.bot).size;
        const totalMembers = guild.memberCount;
        const totalChannels = guild.channels.cache.size;
        const totalRoles = guild.roles.cache.size;
        const totalEmojis = guild.emojis.cache.size;

        const embed = new EmbedBuilder()
            .setTitle(`📊 Informações do servidor: ${guild.name}`)
            .setColor(0xE67E22)
            .setDescription(
                `💁 Humanos: ${totalHumans}\n` +
                `🤖 Bots: ${totalBots}\n` +
                `👥 Total: ${totalMembers}\n\n` +
                `🗂 Canais: ${totalChannels}\n` +
                `🔑 Cargos: ${totalRoles}\n` +
                `😃 Emojis: ${totalEmojis}\n\n` +
                `🆔 ID do servidor: ${guild.id}\n` +
                `📅 Criado em: ${guild.createdAt.toLocaleDateString()}`
            );

        await message.reply({ embeds: [embed] });
    }
};