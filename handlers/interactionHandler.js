const { Events } = require('discord.js');
const db = require('../database');
const ConfigModalHandler = require('./configModalHandler');
const ConfigHandler = require('./configHandler');

const economyCommands = [
    'assaltar-banco', 'banco', 'coinflip', 'diario', 'duelo', 'emprego', 
    'inventario', 'loja', 'loteria', 'pagar', 'perfil', 'pet', 
    'ppt', 'rank', 'roubar', 'saldo', 'slots', 'trabalhar', 'hilo', 'missoes'
];

module.exports = async (interaction) => {
    const { client } = interaction;
    const start = Date.now();

    try {
        // Verifica blacklist (Banimento)
        if (interaction.user) {
            const user = await db.getUser(interaction.user.id);
            if (user && user.blacklisted) {
                if (interaction.isAutocomplete()) {
                    return interaction.respond([]);
                }
                return interaction.reply({ content: '🚫 **ACESSO NEGADO.** Você foi banido do sistema FOXHOUND.', flags: 64 });
            }
        }

        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;

            // Atualiza canal de log de economia e atividade
            if (interaction.guildId) {
                try {
                    const updates = { lastCommandChannelId: interaction.channelId };
                    
                    if (economyCommands.includes(interaction.commandName)) {
                        updates.economyLogChannel = interaction.channelId;
                        updates.lastEconomyActivity = Date.now();
                    }

                    await db.GuildConfig.findOneAndUpdate(
                        { guildId: interaction.guildId },
                        { $set: updates },
                        { upsert: true }
                    );
                } catch (err) {
                    console.error('Erro ao atualizar atividade:', err);
                }
            }

            // Tratamento robusto para Unknown Interaction no deferReply
            try {
                // Incrementa contador global de comandos
                await db.incrementGlobalCommandCount();

                // Se o comando tiver execute, ele mesmo deve chamar o deferReply
                // mas vamos envolver a chamada principal em um try/catch específico
                await command.execute(interaction);
                
                // Log de performance após execução bem-sucedida
                const duration = Date.now() - start;
                if (duration > 2500) {
                    console.warn(`⚠️ [PERFORMANCE] Comando /${interaction.commandName} demorou ${duration}ms para responder. Próximo do limite de 3s.`);
                }
            } catch (err) {
                if (err.code === 10062) {
                    console.warn(`⚠️ [INTERACTION] Interação expirou antes de responder ao comando: ${interaction.commandName}`);
                    return;
                }
                throw err; // Repassa outros erros para o catch principal
            }
        }

        else if (interaction.isAutocomplete()) {
            const command = client.commands.get(interaction.commandName);
            if (command && command.autocomplete) {
                await command.autocomplete(interaction);
            }
        }

        else if (interaction.isButton()) {
            const { customId } = interaction;
            
            console.log(`[DEBUG] Button clicked: ${customId}`);
            
            if (customId.startsWith('help_')) {
                const helpCmd = client.commands.get('ajuda');
                if (helpCmd?.handleButton) await helpCmd.handleButton(interaction);
            }
            else if (customId.startsWith('embed_')) {
                const embedCmd = client.commands.get('embed');
                if (embedCmd?.handleButton) await embedCmd.handleButton(interaction);
            }
            else if (customId.startsWith('bank_')) {
                const bankCmd = client.commands.get('banco');
                if (bankCmd?.handleButton) await bankCmd.handleButton(interaction);
            }
            else if (customId.startsWith('shop_')) {
                const shopCmd = client.commands.get('loja');
                if (shopCmd?.handleButton) await shopCmd.handleButton(interaction);
            }
            else if (customId.startsWith('pet_')) {
                const petCmd = client.commands.get('pet');
                if (petCmd?.handleButton) await petCmd.handleButton(interaction);
            }
            else if (customId.startsWith('ppt_')) {
                const pptCmd = client.commands.get('ppt');
                if (pptCmd?.handleButton) await pptCmd.handleButton(interaction);
            }
            else if (customId.startsWith('duelo_')) {
                const dueloCmd = client.commands.get('duelo');
                if (dueloCmd?.handleButton) await dueloCmd.handleButton(interaction);
            }
            else if (customId === 'join_drop') {
                // Drop Foxies - tratar via comando pois precisa de estado do jogo
                const dropCmd = client.commands.get('drop-foxies');
                if (dropCmd?.handleDropButton) await dropCmd.handleDropButton(interaction);
            }
            else if (customId.startsWith('join_drop_global_')) {
                // Drop Foxies Global - tratar via comando pois precisa de estado do jogo
                const dropGlobalCmd = client.commands.get('drop-foxies-global');
                if (dropGlobalCmd?.handleDropGlobalButton) await dropGlobalCmd.handleDropGlobalButton(interaction);
            }
            else if (customId.startsWith('retribute_hug_')) {
                const hugCmd = require('../commands/Social/abracar');
                if (hugCmd?.handleButton) await hugCmd.handleButton(interaction);
            }
            else if (customId.startsWith('hilo_')) {
                const hiloCmd = client.commands.get('hilo');
                if (hiloCmd?.handleButton) await hiloCmd.handleButton(interaction);
            }
            else if (customId.startsWith('mission_')) {
                const missoesCmd = client.commands.get('missoes');
                if (missoesCmd?.handleButton) await missoesCmd.handleButton(interaction);
            }
            else if (customId.startsWith('godmode_')) {
                const godmodeCmd = client.commands.get('godmode');
                if (godmodeCmd?.handleButton) await godmodeCmd.handleButton(interaction);
            }
            else if (customId.startsWith('lottery_')) {
                const lotteryCmd = client.commands.get('loteria');
                if (lotteryCmd?.handleButton) await lotteryCmd.handleButton(interaction);
            }
            else if (customId.startsWith('loan_')) {
                const loanCmd = client.commands.get('emprestimo');
                if (loanCmd) {
                    if (customId.startsWith('loan_req_')) {
                        const targetId = customId.split('_')[2];
                        await loanCmd.handleLoanRequestButton(interaction, targetId);
                    } else if (loanCmd.handleButton) {
                        await loanCmd.handleButton(interaction);
                    }
                }
            }
            else if (customId.startsWith('guilda_')) {
                const guildaCmd = client.commands.get('guilda');
                if (guildaCmd?.handleButton) await guildaCmd.handleButton(interaction);
            }
            else if (customId.startsWith('config_')) {
                const configCmd = client.commands.get('configuracoes');
                if (configCmd?.handleButton) await configCmd.handleButton(interaction);
            }
            else if (customId.startsWith('backup_')) {
                const backupCmd = client.commands.get('backup');
                if (backupCmd?.handleButton) await backupCmd.handleButton(interaction);
            }
        }

        else if (interaction.isAnySelectMenu()) {
            const { customId } = interaction;

            console.log(`[DEBUG] Select menu received: ${customId}`);

            if (customId.startsWith('loan_')) {
                const loanCmd = client.commands.get('emprestimo');
                if (loanCmd?.handleSelect) await loanCmd.handleSelect(interaction);
            }
            else if (customId.startsWith('help_')) {
                const helpCmd = client.commands.get('ajuda');
                if (helpCmd?.handleSelect) await helpCmd.handleSelect(interaction);
            }
            else if (customId.startsWith('embed_')) {
                const embedCmd = client.commands.get('embed');
                if (embedCmd?.handleSelect) await embedCmd.handleSelect(interaction);
            }
            else if (customId.startsWith('shop_')) {
                const shopCmd = client.commands.get('loja');
                if (shopCmd?.handleSelect) await shopCmd.handleSelect(interaction);
            }
            else if (customId.startsWith('inventory_')) {
                const invCmd = client.commands.get('inventario');
                if (invCmd?.handleSelect) await invCmd.handleSelect(interaction);
            }
            else if (customId.startsWith('pet_')) {
                const petCmd = client.commands.get('pet');
                if (petCmd?.handleSelect) await petCmd.handleSelect(interaction);
            }
            else if (customId.startsWith('godmode_')) {
                const godmodeCmd = client.commands.get('godmode');
                if (godmodeCmd?.handleButton) await godmodeCmd.handleButton(interaction);
            }
            else if (customId.startsWith('guilda_')) {
                const guildaCmd = client.commands.get('guilda');
                if (guildaCmd?.handleSelect) await guildaCmd.handleSelect(interaction);
            }
            else if (customId.startsWith('backup_')) {
                const backupCmd = client.commands.get('backup');
                if (backupCmd?.handleSelect) await backupCmd.handleSelect(interaction);
            }
            else if (customId.startsWith('config_')) {
                const configCmd = client.commands.get('configuracoes');
                if (configCmd?.handleSelect) await configCmd.handleSelect(interaction);
            }
            
            // Category select for main config panel
            if (customId === 'config_category_select') {
                const configCmd = client.commands.get('configuracoes');
                if (configCmd?.handleSelect) await configCmd.handleSelect(interaction);
            }
        }

        else if (interaction.isModalSubmit()) {
            const { customId } = interaction;

            console.log(`[DEBUG] Modal submitted: ${customId}`);

            if (customId.startsWith('embed_')) {
                const embedCmd = client.commands.get('embed');
                if (embedCmd?.handleModal) await embedCmd.handleModal(interaction);
            }
            else if (customId.startsWith('bank_')) {
                const bankCmd = client.commands.get('banco');
                if (bankCmd?.handleModal) await bankCmd.handleModal(interaction);
            }
            else if (customId.startsWith('pet_')) {
                const petCmd = client.commands.get('pet');
                if (petCmd?.handleModal) await petCmd.handleModal(interaction);
            }
            else if (customId.startsWith('godmode_')) {
                const godmodeCmd = client.commands.get('godmode');
                if (godmodeCmd?.handleModal) await godmodeCmd.handleModal(interaction);
            }
            else if (customId.startsWith('lottery_')) {
                const lotteryCmd = client.commands.get('loteria');
                if (lotteryCmd?.handleModal) await lotteryCmd.handleModal(interaction);
            }
            else if (customId.startsWith('welcome_')) {
                const configCmd = client.commands.get('configuracoes');
                if (configCmd?.handleModal) await configCmd.handleModal(interaction);
            }
            else if (customId === 'loan_pay_partial_modal') {
                const loanCmd = client.commands.get('emprestimo');
                if (loanCmd?.handleLoanPayPartialModal) await loanCmd.handleLoanPayPartialModal(interaction);
            }
            else if (customId.startsWith('loan_modal_')) {
                const lenderId = customId.split('_')[2];
                const loanCmd = client.commands.get('emprestimo');
                if (loanCmd?.handleLoanModal) await loanCmd.handleLoanModal(interaction, lenderId);
            }
            else if (customId.startsWith('loan_terms_modal_')) {
                const requestId = customId.replace('loan_terms_modal_', '');
                const loanCmd = client.commands.get('emprestimo');
                if (loanCmd?.handleLoanTermsModal) await loanCmd.handleLoanTermsModal(interaction, requestId);
            }
            else if (customId.startsWith('guilda_')) {
                const guildaCmd = client.commands.get('guilda');
                if (guildaCmd?.handleModal) await guildaCmd.handleModal(interaction);
            }
            else if (customId.startsWith('backup_')) {
                const backupCmd = client.commands.get('backup');
                if (backupCmd?.handleModal) await backupCmd.handleModal(interaction);
            }
            else if (customId.startsWith('welcome_') || customId.startsWith('config_')) {
                // Try config command first for new config modals
                const configCmd = client.commands.get('configuracoes');
                if (configCmd?.handleModal) {
                    await configCmd.handleModal(interaction);
                } else {
                    await ConfigModalHandler.handle(interaction);
                }
            }
        }
    } catch (err) {
        console.error('ERRO na interação:', err);

        const errorMsg = { content: '❌ Houve um erro ao processar esta interação.', flags: 64 };
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMsg).catch(() => {});
        } else {
            await interaction.reply(errorMsg).catch(async () => {
                await interaction.followUp(errorMsg).catch(() => {});
            });
        }
    }
};
