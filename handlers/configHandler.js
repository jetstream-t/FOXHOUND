const db = require('../database');

module.exports = {
    async handleButton(interaction) {
        const configCommand = interaction.client.commands.get('configuracoes');
        if (configCommand && configCommand.handleButton) {
            await configCommand.handleButton(interaction);
        }
    },

    async handleModal(interaction) {
        const configCommand = interaction.client.commands.get('configuracoes');
        if (configCommand && configCommand.handleModal) {
            await configCommand.handleModal(interaction);
        }
    },

    async handleSelect(interaction) {
        const configCommand = interaction.client.commands.get('configuracoes');
        if (configCommand && configCommand.handleSelect) {
            await configCommand.handleSelect(interaction);
        }
    }
};
