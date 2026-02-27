const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roll')
        .setDescription('Jogue um dado aleatório')
        .addIntegerOption(opt => 
            opt.setName('faces')
                .setDescription('Número de faces do dado (Padrão: 6)')
                .setRequired(false)
                .setMinValue(2)
                .setMaxValue(100)),

    async execute(interaction) {
        try {
            const faces = interaction.options.getInteger('faces') || 6;
            const result = Math.floor(Math.random() * faces) + 1;

            const embed = new EmbedBuilder()
                .setTitle('🎲 Resultado do Dado')
                .setDescription(`Você rolou um dado de **${faces}** faces e obteve **${result}**!`)
                .setColor('Blue')
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Erro no comando roll:', error);
            await interaction.reply({ content: '❌ Ocorreu um erro ao rolar o dado.', flags: 64 });
        }
    },

    async executePrefix(message, args) {
        try {
            const faces = parseInt(args[0]) || 6;
            if (faces < 2 || faces > 100) {
                return message.reply('❌ Por favor, escolha um número de faces entre 2 e 100.');
            }
            
            const result = Math.floor(Math.random() * faces) + 1;

            const embed = new EmbedBuilder()
                .setTitle('🎲 Resultado do Dado')
                .setDescription(`Você rolou um dado de **${faces}** faces e obteve **${result}**!`)
                .setColor('Blue')
                .setTimestamp();

            await message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Erro no prefixo roll:', error);
            await message.reply('❌ Ocorreu um erro ao rolar o dado.');
        }
    }
};
