const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('user-info')
        .setDescription('Mostra informações de um usuário')
        .addUserOption(option =>
            option
                .setName('usuario')
                .setDescription('Usuário que você quer ver (opcional)')
                .setRequired(false)
        ),

    async execute(interaction) {
        const user = interaction.options.getUser('usuario') || interaction.user;
        const member = await interaction.guild.members.fetch(user.id);

        // Datas formatadas no padrão Discord
        const createdAt = `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`;
        const joinedAt = `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`;

        // Maior cargo (ignorando @everyone)
        const highestRole =
            member.roles.highest.id === interaction.guild.id
                ? null
                : member.roles.highest;

        // Cor do maior cargo (se não tiver, usa cinza)
        const roleColor = highestRole?.color || 0x2f3136;

        // Verifica timeout (castigo)
        const isTimedOut = member.communicationDisabledUntilTimestamp
            ? 'Sim'
            : 'Não';

        /* ===============================
           EMBED 1 — INFORMAÇÕES DO USUÁRIO
        =============================== */
        const userEmbed = new EmbedBuilder()
            .setTitle('Informações sobre o Usuário')
            .setAuthor({
                name: user.tag,
                iconURL: user.displayAvatarURL(),
                url: `https://discord.com/users/${user.id}` // clicável
            })
            .setThumbnail(user.displayAvatarURL({ size: 512 }))
            .setColor('#E67E22') // laranja
            .addFields(
                { name: 'Nome de usuário', value: user.username, inline: true },
                { name: 'Tag do Discord', value: user.tag, inline: true },
                { name: 'ID do Discord', value: user.id, inline: false },
                { name: 'Conta criada em', value: createdAt, inline: false }
            );

        /* ===============================
           EMBED 2 — INFORMAÇÕES DO MEMBRO
        =============================== */
        const memberEmbed = new EmbedBuilder()
            .setTitle('Informações sobre o Membro')
            .setColor(roleColor)
            .addFields(
                {
                    name: 'Entrou no servidor em',
                    value: joinedAt,
                    inline: false
                },
                {
                    name: 'Maior cargo',
                    value: highestRole ? highestRole.toString() : 'Nenhum cargo',
                    inline: true
                },
                {
                    name: 'Castigado (timeout)',
                    value: isTimedOut,
                    inline: true
                }
            );

        await interaction.reply({
            embeds: [userEmbed, memberEmbed]
        });
    },

    async executePrefix(message, args) {
        const user = message.mentions.users.first() || 
                     (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null) || 
                     message.author;
        const member = await message.guild.members.fetch(user.id);

        const createdAt = `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`;
        const joinedAt = `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`;
        const highestRole = member.roles.highest.id === message.guild.id ? null : member.roles.highest;
        const roleColor = highestRole?.color || 0x2f3136;
        const isTimedOut = member.communicationDisabledUntilTimestamp ? 'Sim' : 'Não';

        const userEmbed = new EmbedBuilder()
            .setTitle('Informações sobre o Usuário')
            .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
            .setThumbnail(user.displayAvatarURL({ size: 512 }))
            .setColor('#E67E22')
            .addFields(
                { name: 'Nome de usuário', value: user.username, inline: true },
                { name: 'Tag do Discord', value: user.tag, inline: true },
                { name: 'ID do usuário', value: user.id, inline: true },
                { name: 'Conta criada em', value: createdAt }
            );

        const serverEmbed = new EmbedBuilder()
            .setTitle('Informações no Servidor')
            .setColor(roleColor)
            .addFields(
                { name: 'Entrou no servidor em', value: joinedAt },
                { name: 'Maior cargo', value: highestRole ? `<@&${highestRole.id}>` : 'Nenhum', inline: true },
                { name: 'Está de castigo?', value: isTimedOut, inline: true }
            );

        await message.reply({ embeds: [userEmbed, serverEmbed] });
    }
};