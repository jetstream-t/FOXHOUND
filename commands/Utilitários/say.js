const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');
const colors = require('../../colors.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('Faz o bot dizer algo no canal (texto ou embed).')
        .addStringOption(option => 
            option.setName('mensagem')
                .setDescription('A mensagem a ser enviada')
                .setRequired(true))
        .addBooleanOption(option => 
            option.setName('embed')
                .setDescription('Enviar como Embed?')
                .setRequired(false)),

    async execute(interaction) {
        // Verificação de permissão removida para todos usarem
        // if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        //    return interaction.reply({ content: '❌ Você não tem permissão para usar este comando.', ephemeral: true });
        // }

        const message = interaction.options.getString('mensagem');
        const isEmbed = interaction.options.getBoolean('embed') || false;

        // Responder à interação de forma efêmera para confirmar o envio e evitar erro
        await interaction.deferReply({ ephemeral: true });

        try {
            if (isEmbed) {
                const embed = new EmbedBuilder()
                    .setDescription(message)
                    .setColor(colors.default || 'Random')
                    .setFooter({ text: `Enviado por: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });
                
                await interaction.channel.send({ embeds: [embed] });
            } else {
                await interaction.channel.send({ content: `${message}\n\n*Enviado por: ${interaction.user}*` });
            }

            await interaction.editReply({ content: '✅ Mensagem enviada com sucesso!' });
        } catch (error) {
            console.error('Erro no comando /say:', error);
            await interaction.editReply({ content: '❌ Ocorreu um erro ao enviar a mensagem.' });
        }
    },

    async executePrefix(message, args) {
        // if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        //    return message.reply('❌ Você não tem permissão para usar este comando.');
        // }

        if (!args.length) return message.reply('❌ Digite a mensagem que deseja que eu fale.');

        let content = args.join(' ');
        let useEmbed = false;

        // Verifica se o primeiro argumento é "embed" para ativar o modo embed via prefixo
        if (args[0].toLowerCase() === 'embed') {
            useEmbed = true;
            content = args.slice(1).join(' ');
        }

        if (!content) return message.reply('❌ Digite a mensagem.');

        // Tenta apagar a mensagem do comando para ficar limpo
        try { await message.delete(); } catch (e) {}

        try {
            if (useEmbed) {
                const embed = new EmbedBuilder()
                    .setDescription(content)
                    .setColor(colors.default || 'Random')
                    .setFooter({ text: `Enviado por: ${message.author.tag}`, iconURL: message.author.displayAvatarURL() });
                
                await message.channel.send({ embeds: [embed] });
            } else {
                await message.channel.send({ content: `${content}\n\n*Enviado por: ${message.author}*` });
            }
        } catch (error) {
            console.error('Erro no prefixo say:', error);
            message.channel.send('❌ Ocorreu um erro ao enviar a mensagem.');
        }
    }
};
