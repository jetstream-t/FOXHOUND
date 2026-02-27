const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('8ball')
        .setDescription('Bola 8 mágica, responde perguntas com sim/não')
        .addStringOption(option =>
            option.setName('pergunta')
                .setDescription('Sua pergunta para a bola 8')
                .setRequired(true)
        ),
    async execute(interaction) {
        // Lista expandida de respostas possíveis (mais legais e divertidas)
        const respostas = [
            'Sim',
            'Não',
            'Talvez',
            'Definitivamente',
            'Nunca',
            'Provavelmente',
            'Duvido',
            'Com certeza',
            'Pergunte novamente',
            'As estrelas dizem que sim',
            'Claro que sim!',
            'Nem pensar!',
            'Depende da lua',
            'Sim, mas com cuidado',
            'Não, mas quem sabe no futuro',
            'Absolutamente!',
            'De jeito nenhum',
            'Talvez amanhã',
            'As cartas dizem que sim',
            'Pergunte ao seu coração',
            'Sim, sem dúvidas',
            'Não, esqueça isso',
            'Provavelmente sim',
            'Duvido muito',
            'Com certeza absoluta',
            'Pergunte novamente mais tarde'
        ];

        // Obtém a pergunta do usuário
        const pergunta = interaction.options.getString('pergunta');

        // Escolhe uma resposta aleatória
        const resposta = respostas[Math.floor(Math.random() * respostas.length)];

        // Cria o embed com a resposta
        const embed = new EmbedBuilder()
            .setTitle('🪄 Bola 8 Mágica')
            .setDescription(`**Pergunta:** ${pergunta}\n\n**Resposta:** ${resposta}`)
            .setColor('DarkBlue')
            .setFooter({ text: `Pergunta de ${interaction.user.tag}` });

        await interaction.reply({ embeds: [embed] });
    },

    async executePrefix(message, args) {
        const respostas = [
            'Sim', 'Não', 'Talvez', 'Definitivamente', 'Nunca', 'Provavelmente', 'Duvido',
            'Com certeza', 'Pergunte novamente', 'As estrelas dizem que sim', 'Claro que sim!',
            'Nem pensar!', 'Depende da lua', 'Sim, mas com cuidado', 'Não, mas quem sabe no futuro',
            'Absolutamente!', 'De jeito nenhum', 'Talvez amanhã', 'As cartas dizem que sim',
            'Pergunte ao seu coração', 'Sim, sem dúvidas', 'Não, esqueça isso', 'Provavelmente sim',
            'Duvido muito', 'Com certeza absoluta', 'Pergunte novamente mais tarde'
        ];

        const pergunta = args.join(' ');
        if (!pergunta) return message.reply('❌ Você precisa fazer uma pergunta!');

        const resposta = respostas[Math.floor(Math.random() * respostas.length)];

        const embed = new EmbedBuilder()
            .setTitle('🔮 Bola 8 Mágica')
            .addFields(
                { name: 'Sua Pergunta:', value: pergunta },
                { name: 'Minha Resposta:', value: resposta }
            )
            .setColor('DarkBlue')
            .setFooter({ text: `Pergunta de ${message.author.tag}` });

        await message.reply({ embeds: [embed] });
    }
};