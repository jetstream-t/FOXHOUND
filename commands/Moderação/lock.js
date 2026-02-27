const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lock')
        .setDescription('Bloqueia o canal atual para que ninguém possa enviar mensagens')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels),

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return interaction.reply({ content: '❌ Você não tem permissão para gerenciar canais.', flags: 64 });
        }

        try {
            await interaction.deferReply({ flags: 64 });

            await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                SendMessages: false
            });

            const embed = new EmbedBuilder()
                .setTitle('🔒 Canal Bloqueado')
                .setDescription('Este canal foi bloqueado por um moderador. Apenas administradores e cargos permitidos podem falar aqui agora.')
                .setColor('Red')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            
            // Também envia uma mensagem pública para o canal
            await interaction.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Erro ao bloquear canal:', error);
            await interaction.editReply({ content: '❌ Ocorreu um erro ao tentar bloquear este canal.' });
        }
    },

    async executePrefix(message) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return message.reply('❌ Você não tem permissão para usar este comando.');
        }

        try {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
                SendMessages: false
            });

            const embed = new EmbedBuilder()
                .setTitle('🔒 Canal Bloqueado')
                .setDescription('Este canal foi bloqueado por um moderador. Apenas administradores e cargos permitidos podem falar aqui agora.')
                .setColor('Red')
                .setTimestamp();

            await message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Erro no prefixo lock:', error);
            message.reply('❌ Ocorreu um erro ao bloquear o canal.');
        }
    }
};
