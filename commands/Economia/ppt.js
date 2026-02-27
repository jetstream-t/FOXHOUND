const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const db = require('../../database');
const colors = require('../../colors.json');
const { checkMission, MISSION_TYPES } = require('../../systems/missionSystem');

// Armazenamento em memória dos jogos ativos
// Key: MessageID, Value: GameState
const activeGames = new Map();

const MOVES = {
    ROCK: 'pedra',
    PAPER: 'papel',
    SCISSORS: 'tesoura'
};

const EMOJIS = {
    [MOVES.ROCK]: '🪨',
    [MOVES.PAPER]: '📄',
    [MOVES.SCISSORS]: '✂️'
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ppt')
        .setDescription('Desafie alguém para Pedra, Papel e Tesoura (Melhor de 3).')
        .addIntegerOption(option =>
            option.setName('valor')
                .setDescription('Valor da aposta (0 para Amistoso)')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(100000)),

    async execute(interaction) {
        const bet = interaction.options.getInteger('valor');
        const user = await db.getUser(interaction.user.id);

        // Validação de aposta
        if (bet > 0) {
            if (bet < 50) {
                return interaction.reply({ content: '❌ Aposta mínima é de **50 Foxies**. Para jogar amistoso, use valor **0**.', ephemeral: true });
            }
            if (user.wallet < bet) {
                return interaction.reply({ content: `❌ Você não tem **${bet}** Foxies na carteira para essa aposta.`, ephemeral: true });
            }
        }

        const isBetting = bet > 0;

        // Confirmação para apostas altas (>= 50k)
        if (bet >= 50000) {
            const confirmEmbed = new EmbedBuilder()
                .setTitle('⚠️ Aposta de Alto Risco')
                .setDescription(`Você está prestes a criar um desafio valendo **${bet.toLocaleString()} Foxies**.\nTem certeza que deseja continuar?`)
                .setColor(colors.warning);

            const confirmRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('confirm_ppt_create').setLabel('Confirmar').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('cancel_ppt_create').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
            );

            const confirmMsg = await interaction.reply({
                embeds: [confirmEmbed],
                components: [confirmRow],
                ephemeral: true,
                fetchReply: true
            });

            try {
                const confirmation = await confirmMsg.awaitMessageComponent({
                    filter: i => i.user.id === interaction.user.id && ['confirm_ppt_create', 'cancel_ppt_create'].includes(i.customId),
                    time: 30000
                });

                if (confirmation.customId === 'cancel_ppt_create') {
                    await confirmation.update({ content: '❌ Desafio cancelado.', embeds: [], components: [] });
                    return;
                }

                await confirmation.update({ content: '✅ Desafio confirmado! Publicando...', embeds: [], components: [] });
                // Continua para criar o desafio público
            } catch (e) {
                await interaction.editReply({ content: '⏱️ Tempo esgotado. Desafio cancelado.', embeds: [], components: [] });
                return;
            }
        }

        const embed = new EmbedBuilder()
            .setColor(colors.default)
            .setTitle('🥊 Desafio de Pedra, Papel e Tesoura')
            .setDescription(`**${interaction.user.username}** está chamando para um duelo!\n\n` +
                `🏆 **Modo:** ${isBetting ? 'Valendo Dinheiro' : 'Amistoso'}\n` +
                `${isBetting ? `💰 **Aposta:** ${bet} moedas\n` : ''}` +
                `🎮 **Regra:** Melhor de 3 (Quem vencer 2 rodadas ganha)\n\n` +
                `*Aguardando um oponente aceitar...*`)
            .setThumbnail('https://media.giphy.com/media/xT9IgS6EAwxYZ8s9nG/giphy.gif'); // GIF genérico de versus ou PPT

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`ppt_accept_${interaction.user.id}_${bet}`)
                .setLabel('Aceitar Desafio')
                .setStyle(ButtonStyle.Success)
                .setEmoji('⚔️'),
            new ButtonBuilder()
                .setCustomId(`ppt_cancel_${interaction.user.id}`)
                .setLabel('Cancelar')
                .setStyle(ButtonStyle.Danger)
        );

        let response;
        if (bet >= 50000) {
            response = await interaction.followUp({ embeds: [embed], components: [row], fetchReply: true, ephemeral: false });
        } else {
            response = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
        }

        // Timeout de Lobby (1 min)
        setTimeout(async () => {
            // Se o jogo não estiver ativo (ninguém aceitou), cancela
            if (!activeGames.has(response.id)) {
                try {
                    await response.edit({ content: '⏱️ **Tempo esgotado!** Desafio cancelado.', embeds: [], components: [] });
                } catch (e) {}
            }
        }, 60000);
    },

    async resetTimeout(interaction, game) {
        if (game.timeout) clearTimeout(game.timeout);
        
        game.timeout = setTimeout(async () => {
            if (!activeGames.has(interaction.message.id)) return;
            
            // Verificar quem jogou (para dar W.O.)
            const hostMoved = !!game.moves[game.hostId];
            const guestMoved = !!game.moves[game.guestId];
            
            let winnerId = null;
            if (hostMoved && !guestMoved) winnerId = game.hostId;
            else if (!hostMoved && guestMoved) winnerId = game.guestId;

            if (winnerId) {
                 await this.endGame(interaction, game, winnerId);
            } else {
                // Reembolso (Ninguém jogou)
                if (game.bet > 0) {
                     const host = await db.getUser(game.hostId);
                     await db.updateUser(game.hostId, { wallet: host.wallet + game.bet });
                     
                     const guest = await db.getUser(game.guestId);
                     await db.updateUser(game.guestId, { wallet: guest.wallet + game.bet });
                }
                
                activeGames.delete(interaction.message.id);
                try {
                    await interaction.message.edit({ content: '⏱️ **Tempo esgotado!** Jogo cancelado por inatividade (ninguém jogou).', embeds: [], components: [] });
                } catch(e) {}
            }
        }, 60000);
    },

    async handleButton(interaction) {
        const { customId, message, user } = interaction;
        const parts = customId.split('_');
        const action = parts[1]; // accept, cancel, move

        // --- CANCELAR ---
        if (action === 'cancel') {
            const hostId = parts[2];
            if (user.id !== hostId) {
                return interaction.reply({ content: '❌ Apenas quem criou o desafio pode cancelá-lo.', ephemeral: true });
            }
            
            // Se o jogo já estiver ativo (alguém aceitou e deu erro dps), remove do mapa
            if (activeGames.has(message.id)) {
                // Reembolsar se necessário (embora o cancel seja só no lobby, mas por segurança)
                const game = activeGames.get(message.id);
                // Se o jogo já começou, não deveria ser possível cancelar por aqui, mas...
                if (game.bet > 0) {
                     // Devolver dinheiro se cancelado após start (borda case)
                     // Mas o botão de cancel some no start.
                }
                activeGames.delete(message.id);
            }

            // Tenta deletar a mensagem original para limpar o chat
            try {
                await message.delete();
            } catch (e) {
                await interaction.update({ content: '🚫 Desafio cancelado.', embeds: [], components: [] });
            }
            return;
        }

        // --- ACEITAR ---
        if (action === 'accept') {
            const hostId = parts[2];
            const bet = parseInt(parts[3]);

            if (user.id === hostId) {
                return interaction.reply({ content: '❌ Você não pode jogar contra si mesmo!', ephemeral: true });
            }

            // Verificar saldo do oponente
            if (bet > 0) {
                const opponent = await db.getUser(user.id);
                if (opponent.wallet < bet) {
                    return interaction.reply({ content: `❌ Você não tem **${bet}** Foxies para aceitar.`, ephemeral: true });
                }

                // Verificar saldo do host novamente (pode ter gasto enquanto esperava)
                const host = await db.getUser(hostId);
                if (host.wallet < bet) {
                    return interaction.reply({ content: `❌ O desafiante não tem mais **${bet}** Foxies! Desafio cancelado.`, ephemeral: true });
                }

                // Confirmação para quem aceita (>= 50k)
                if (bet >= 50000) {
                    const confirmEmbed = new EmbedBuilder()
                        .setTitle('⚠️ Aposta de Alto Risco')
                        .setDescription(`Você está prestes a aceitar um desafio valendo **${bet.toLocaleString()} Foxies**.\nTem certeza que deseja continuar?`)
                        .setColor(colors.warning);

                    const confirmRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('confirm_ppt_accept').setLabel('Confirmar').setStyle(ButtonStyle.Danger),
                        new ButtonBuilder().setCustomId('cancel_ppt_accept').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
                    );

                    const confirmMsg = await interaction.reply({
                        embeds: [confirmEmbed],
                        components: [confirmRow],
                        ephemeral: true,
                        fetchReply: true
                    });

                    try {
                        const confirmation = await confirmMsg.awaitMessageComponent({
                            filter: i => i.user.id === interaction.user.id && ['confirm_ppt_accept', 'cancel_ppt_accept'].includes(i.customId),
                            time: 30000
                        });

                        if (confirmation.customId === 'cancel_ppt_accept') {
                            await confirmation.update({ content: '❌ Aceitação cancelada.', embeds: [], components: [] });
                            return;
                        }

                        await confirmation.update({ content: '✅ Desafio aceito! Iniciando...', embeds: [], components: [] });
                    } catch (e) {
                        await interaction.editReply({ content: '⏱️ Tempo esgotado. Aceitação cancelada.', embeds: [], components: [] });
                        return;
                    }
                }

                // Deduzir de ambos
                await db.updateUser(hostId, { wallet: host.wallet - bet });
                await db.updateUser(user.id, { wallet: opponent.wallet - bet });
            }

            // Iniciar Jogo
            const hostMember = await interaction.guild.members.fetch(hostId);
            const gameState = {
                hostId: hostId,
                guestId: user.id,
                hostName: hostMember.user.username,
                guestName: user.username,
                bet: bet,
                scores: { host: 0, guest: 0 },
                round: 1,
                resolving: false,
                moves: {} // { hostId: 'rock', guestId: 'paper' }
            };

            activeGames.set(message.id, gameState);

            await this.updateGameBoard(interaction, gameState, 'Iniciando partida...', true);
            return;
        }

        // --- MOVIMENTO (PEDRA, PAPEL, TESOURA) ---
        if (action === 'move') {
            const move = parts[2]; // rock, paper, scissors
            const game = activeGames.get(message.id);

            if (!game) {
                return interaction.reply({ content: '❌ Este jogo não existe mais ou expirou.', ephemeral: true });
            }

            if (user.id !== game.hostId && user.id !== game.guestId) {
                return interaction.reply({ content: '❌ Você não está participando deste jogo.', ephemeral: true });
            }

            // Verificar se já jogou nesta rodada
            if (game.moves[user.id]) {
                return interaction.reply({ content: '⏳ Você já escolheu sua jogada! Aguarde o oponente.', ephemeral: true });
            }

            // Registrar movimento
            game.moves[user.id] = move;
            this.resetTimeout(interaction, game);
            
            // Feedback imediato para quem clicou (Ephemeral)
            await interaction.reply({ content: `✅ Você escolheu **${move.toUpperCase()}**!`, ephemeral: true });

            // Se ambos jogaram, resolver rodada
            if (game.moves[game.hostId] && game.moves[game.guestId]) {
                if (game.resolving) return;
                game.resolving = true;
                await this.resolveRound(interaction, game);
            } else {
                // Apenas um jogou
                // Atualizar texto do embed para mostrar quem já jogou (Public)
                await this.updateGameBoard(interaction, game, null, false); 
            }
        }
    },

    async updateGameBoard(interaction, game, statusMessage = null, isNewGame = false) {
        const embed = new EmbedBuilder()
            .setColor(colors.primary || '#0099ff')
            .setTitle(`🥊 ${game.hostName} vs ${game.guestName}`)
            .setDescription(
                `**Rodada ${game.round}** (Melhor de 3)\n` +
                (game.bet > 0 ? `💰 **Aposta:** ${game.bet} moedas\n\n` : `🏆 **Modo:** Amistoso\n\n`) +
                `📊 **Placar:**\n` +
                `👤 **${game.hostName}:** ${game.scores.host}\n` +
                `👤 **${game.guestName}:** ${game.scores.guest}\n\n` +
                `👇 **Escolham suas armas:**`
            )
            .setFooter({ text: statusMessage || 'Façam suas jogadas!' });
        
        // Status visual de quem já jogou
        const hostStatus = game.moves[game.hostId] ? '✅ Já escolheu' : '🤔 Pensando...';
        const guestStatus = game.moves[game.guestId] ? '✅ Já escolheu' : '🤔 Pensando...';
        
        embed.addFields(
            { name: game.hostName, value: hostStatus, inline: true },
            { name: game.guestName, value: guestStatus, inline: true }
        );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ppt_move_${MOVES.ROCK}`).setEmoji('🪨').setLabel('Pedra').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`ppt_move_${MOVES.PAPER}`).setEmoji('📄').setLabel('Papel').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`ppt_move_${MOVES.SCISSORS}`).setEmoji('✂️').setLabel('Tesoura').setStyle(ButtonStyle.Primary)
        );

        const payload = { embeds: [embed], components: [row] };

        // Lógica de update vs edit
        if (interaction.replied || interaction.deferred) {
             // Se já respondeu (ex: confirmação ou move), edita a mensagem original
             await interaction.message.edit(payload);
        } else {
             // Se ainda não respondeu (ex: accept sem confirmação), atualiza a interação
             await interaction.update(payload);
        }
    },

    async resolveRound(interaction, game) {
        const moveHost = game.moves[game.hostId];
        const moveGuest = game.moves[game.guestId];
        
        let winner = null; // null = draw, 'host', 'guest'

        // Lógica de Vencedor
        if (moveHost === moveGuest) {
            winner = null;
        } else if (
            (moveHost === MOVES.ROCK && moveGuest === MOVES.SCISSORS) ||
            (moveHost === MOVES.PAPER && moveGuest === MOVES.ROCK) ||
            (moveHost === MOVES.SCISSORS && moveGuest === MOVES.PAPER)
        ) {
            winner = 'host';
            game.scores.host++;
        } else {
            winner = 'guest';
            game.scores.guest++;
        }

        // Texto do resultado da rodada
        const resultText = `Fim da Rodada ${game.round}!\n` +
            `${EMOJIS[moveHost]} (${game.hostName}) vs ${EMOJIS[moveGuest]} (${game.guestName})\n` +
            (winner ? `👉 **Ponto para ${winner === 'host' ? game.hostName : game.guestName}!**` : '👉 **Empate! Ninguém pontua.**');

        // Mostrar resultado na tela (Desabilitar botões temporariamente)
        const resultEmbed = new EmbedBuilder()
            .setColor(winner ? (winner === 'host' ? colors.success : colors.error) : (colors.warning || '#F1C40F'))
            .setTitle(`🥊 Resultado da Rodada ${game.round}`)
            .setDescription(resultText + `\n\n📊 **Placar:** ${game.scores.host} - ${game.scores.guest}`)
            .setFooter({ text: 'Próxima rodada em 3 segundos...' });

        await interaction.message.edit({ embeds: [resultEmbed], components: [] });

        // Limpar movimentos
        game.moves = {};

        // Delay de 3s
        setTimeout(async () => {
            // Verificar fim de jogo (Quem fizer 2 pontos ganha)
            if (game.scores.host >= 2 || game.scores.guest >= 2) {
                await this.endGame(interaction, game);
            } else {
                // Próxima rodada
                game.round++;
                game.resolving = false;
                await this.updateGameBoard(interaction, game, 'Próxima rodada!', false);
            }
        }, 3000);
    },

    async endGame(interaction, game, forceWinnerId = null) {
        let gameWinner, winnerId, winnerName, loserName;
        
        if (forceWinnerId) {
            winnerId = forceWinnerId;
            gameWinner = (winnerId === game.hostId) ? 'host' : 'guest';
            winnerName = (gameWinner === 'host') ? game.hostName : game.guestName;
            loserName = (gameWinner === 'host') ? game.guestName : game.hostName;
            
            // Ajustar placar para parecer vitória
            if (gameWinner === 'host') game.scores.host = 2;
            else game.scores.guest = 2;
        } else {
            gameWinner = game.scores.host > game.scores.guest ? 'host' : 'guest';
            winnerId = gameWinner === 'host' ? game.hostId : game.guestId;
            winnerName = gameWinner === 'host' ? game.hostName : game.guestName;
            loserName = gameWinner === 'host' ? game.guestName : game.hostName;
        }
        
        // Pagamento
        if (game.bet > 0) {
            const totalPot = game.bet * 2;
            const tax = Math.floor(totalPot * 0.05); // 5% tax
            const prize = totalPot - tax;

            const user = await db.getUser(winnerId);
            user.wallet += prize;
            await user.save();

            if (tax > 0) await db.addToVault(tax);
        }

        const embed = new EmbedBuilder()
            .setColor('#FFD700') // Gold
            .setTitle(`🏆 Fim de Jogo!`)
            .setDescription(
                `🎉 **VENCEDOR:** ${winnerName}\n` +
                `💀 **Perdedor:** ${loserName}\n\n` +
                `📊 **Placar Final:** ${game.scores.host} - ${game.scores.guest}\n` +
                (game.bet > 0 ? `💰 **Prêmio:** ${game.bet * 2} Foxies` : '🏆 **Honra e Glória!**')
            )
            .setThumbnail('https://media.giphy.com/media/l0HlHJGHe3yAMhdQY/giphy.gif')
            .setTimestamp();

        // Verificar Missão
        await checkMission(winnerId, MISSION_TYPES.PPT_WIN, 1, interaction);

        // Remover jogo da memória
        activeGames.delete(interaction.message.id);

        // Atualizar mensagem final
        await interaction.message.edit({ embeds: [embed], components: [] });
    }
};
