const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('Mostra o avatar de um usuário')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuário para ver o avatar (padrão: você)')
                .setRequired(false)
        ),
    async execute(interaction) {
        // Obtém o usuário mencionado ou o autor
        const user = interaction.options.getUser('usuario') || interaction.user;

        // Gera o link do avatar em alta resolução (2048x2048)
        const avatarURL = user.displayAvatarURL({ dynamic: true, size: 2048 });

        // Cria o embed com o avatar
        const embed = new EmbedBuilder()
            .setTitle(`Avatar de ${user.username}`)
            .setImage(user.displayAvatarURL({ dynamic: true, size: 512 }))  // Mostra no embed em 512 para não sobrecarregar
            .setColor('Orange')  // Cor laranja
            .setFooter({ text: `Solicitado por ${interaction.user.username}` });

        // Cria o botão para abrir no navegador
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('Abrir avatar no navegador')
                    .setStyle(ButtonStyle.Link)  // Estilo de link (abre em nova guia)
                    .setURL(avatarURL)  // Link direto para o avatar em alta resolução
            );

        // Responde com o embed e o botão
        await interaction.reply({ embeds: [embed], components: [row] });
    },

    async executePrefix(message, args) {
        const user = message.mentions.users.first() || 
                     (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null) || 
                     message.author;

        const avatarURL = user.displayAvatarURL({ dynamic: true, size: 2048 });

        const embed = new EmbedBuilder()
            .setTitle(`Avatar de ${user.username}`)
            .setImage(user.displayAvatarURL({ dynamic: true, size: 512 }))
            .setColor('Orange')
            .setFooter({ text: `Solicitado por ${message.author.tag}` });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('Abrir avatar no navegador')
                    .setStyle(ButtonStyle.Link)
                    .setURL(avatarURL)
            );

        await message.reply({ embeds: [embed], components: [row] });
    }
};