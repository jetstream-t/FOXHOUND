const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const colors = require('../../colors.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('saldo')
        .setDescription('Verifica o suprimento de Foxies atual')
        .addUserOption(option => 
            option.setName('usuario')
                .setDescription('O soldado para verificar o saldo')
                .setRequired(false)
        ),

    async execute(interaction) {
        const target = interaction.options.getUser('usuario') || interaction.user;
        const user = await db.getUser(target.id);

        const isSelf = target.id === interaction.user.id;
        const title = isSelf ? '💳 Seu Inventário de Foxies' : `💳 Suprimentos de ${target.username}`;
        
        const embed = new EmbedBuilder()
            .setTitle(title)
            .addFields(
                { name: '💵 Carteira', value: `\`${user.wallet} Foxies\``, inline: true },
                { name: '🏛️ Banco', value: `\`${user.bank} Foxies\``, inline: true },
                { name: '💰 Total', value: `\`${user.wallet + user.bank} Foxies\``, inline: false }
            )
            .setColor(colors.default)
            .setThumbnail(target.displayAvatarURL());

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    async executePrefix(message, args) {
        const target = message.mentions.users.first() || message.author;
        const user = await db.getUser(target.id);

        const isSelf = target.id === message.author.id;
        const title = isSelf ? '💳 Seu Inventário de Foxies' : `💳 Suprimentos de ${target.username}`;

        const embed = new EmbedBuilder()
            .setTitle(title)
            .addFields(
                { name: '💵 Carteira', value: `\`${user.wallet} Foxies\``, inline: true },
                { name: '🏛️ Banco', value: `\`${user.bank} Foxies\``, inline: true },
                { name: '💰 Total', value: `\`${user.wallet + user.bank} Foxies\``, inline: false }
            )
            .setColor(colors.default)
            .setThumbnail(target.displayAvatarURL());

        await message.reply({ embeds: [embed] });
    }
};
