const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('Desbloqueia o canal atual')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels),

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return interaction.reply({ content: '❌ Você não tem permissão para gerenciar canais.', flags: 64 });
        }

        try {
            await interaction.deferReply({ flags: 64 });

            await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                SendMessages: null // Reseta para o padrão (neutro) ou true se quiser forçar
            });

            const embed = new EmbedBuilder()
                .setTitle('🔓 Canal Desbloqueado')
                .setDescription('Este canal foi desbloqueado. Todos podem falar aqui novamente!')
                .setColor('Green')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            
            // Também envia uma mensagem pública para o canal
            await interaction.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Erro ao desbloquear canal:', error);
            await interaction.editReply({ content: '❌ Ocorreu um erro ao tentar desbloquear este canal.' });
        }
    },

    async executePrefix(message) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return message.reply('❌ Você não tem permissão para usar este comando.');
        }

        try {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
                SendMessages: null
            });

            const embed = new EmbedBuilder()
                .setTitle('🔓 Canal Desbloqueado')
                .setDescription('Este canal foi desbloqueado. Todos podem falar aqui novamente!')
                .setColor('Green')
                .setTimestamp();

            await message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Erro no prefixo unlock:', error);
            message.reply('❌ Ocorreu um erro ao desbloquear o canal.');
        }
    }
};
