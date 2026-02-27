const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const OpenAI = require('openai');
const db = require('../../database');
const colors = require('../../colors.json');
const words = require('../../data/words');

// Configuração da OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_KEY,
});

// Mapa de jogos ativos (Key: MessageID, Value: GameState)
const activeGames = new Map();

// --- LISTA DE MINIGAMES ---
const MINIGAMES = {
    TIC_TAC_TOE: 'tictactoe',
    DADOS: 'dados',
    PAR_IMPAR: 'par_impar',
    MATH: 'math',
    HOT_POTATO: 'hot_potato',
    ROLETA_RUSSA: 'roleta_russa',
    TREASURE_HUNT: 'treasure_hunt',
    BOMBA: 'bomba',
    MAIOR_CARTA: 'maior_carta',
    LUCKY_BUTTON: 'lucky_button',
    GLADIATOR: 'gladiator',
    CUP: 'cup',
    TOWER: 'tower',
    ELEMENTS: 'elements',
    RACE: 'race',
    SCRAMBLED_WORDS: 'scrambled_words',
    BUCKSHOT: 'buckshot'
};

const MINIGAME_INFO = {
    [MINIGAMES.TIC_TAC_TOE]: { name: 'Jogo da Velha', emoji: '⭕' },
    [MINIGAMES.DADOS]: { name: 'General (Poker de Dados)', emoji: '🎲' },
    [MINIGAMES.PAR_IMPAR]: { name: 'Par ou Ímpar', emoji: '⚖️' },
    [MINIGAMES.MATH]: { name: 'Matemática Rápida', emoji: '🔢' },
    [MINIGAMES.HOT_POTATO]: { name: 'Batata Quente', emoji: '🧨' },
    [MINIGAMES.ROLETA_RUSSA]: { name: 'Roleta Russa', emoji: '🔫' },
    [MINIGAMES.TREASURE_HUNT]: { name: 'Caça ao Tesouro', emoji: '💎' },
    [MINIGAMES.BOMBA]: { name: 'Desarmar a Bomba', emoji: '💣' },
    [MINIGAMES.MAIOR_CARTA]: { name: 'Blackjack (21)', emoji: '🃏' },
    [MINIGAMES.LUCKY_BUTTON]: { name: 'Pênaltis', emoji: '⚽' },
    [MINIGAMES.GLADIATOR]: { name: 'Gladiadores', emoji: '⚔️' },
    [MINIGAMES.CUP]: { name: 'Copo Cheio', emoji: '🥛' },
    [MINIGAMES.TOWER]: { name: 'Torre Instável', emoji: '🏗️' },
    [MINIGAMES.ELEMENTS]: { name: 'Duelo Elemental', emoji: '🔥' },
    [MINIGAMES.RACE]: { name: 'Corrida Tática', emoji: '🏎️' },
    [MINIGAMES.SCRAMBLED_WORDS]: { name: 'Palavras Embaralhadas', emoji: '🔠' },
    [MINIGAMES.BUCKSHOT]: { name: 'Buckshot', emoji: '💥' }
};

const MINIGAME_RULES = {
    [MINIGAMES.TIC_TAC_TOE]: "Faça uma linha, coluna ou diagonal com seu símbolo (X ou O) antes do oponente.",
    [MINIGAMES.DADOS]: "Role 3 dados. Tente obter a maior soma ou combinações especiais (Par = 2x, Trinca = 3x).",
    [MINIGAMES.PAR_IMPAR]: "Escolha um número (1-5). A soma define o vencedor (Host é PAR, Visitante é ÍMPAR).",
    [MINIGAMES.MATH]: "Resolva a operação matemática apresentada. Quem clicar na resposta correta primeiro ganha.",
    [MINIGAMES.HOT_POTATO]: "A bomba está com você! Passe para o oponente antes que ela exploda. O tempo é aleatório!",
    [MINIGAMES.ROLETA_RUSSA]: "A cada turno, puxe o gatilho. Se a bala disparar, você perde.",
    [MINIGAMES.TREASURE_HUNT]: "Tabuleiro 3x3 com 1 Tesouro e 2 Bombas. Encontre o tesouro para vencer. Bombas eliminam você.",
    [MINIGAMES.BOMBA]: "Três fios: Um desarma a bomba (vence), um explode (perde) e um é seguro (passa a vez).",
    [MINIGAMES.MAIOR_CARTA]: "Chegue o mais perto possível de 21 sem estourar. Valete/Dama/Rei valem 10, Ás vale 1 ou 11.",
    [MINIGAMES.LUCKY_BUTTON]: "Atacante escolhe canto, Goleiro escolhe canto. Gol se for diferente, Defesa se for igual. Melhor de 5 chutes!",
    [MINIGAMES.GLADIATOR]: "Combate por turnos! Ataque (⚔️) para causar dano, Defenda (🛡️) para reduzir dano ou Cure (🩹) para recuperar vida. Quem zerar o HP perde.",
    [MINIGAMES.CUP]: "Adicione água ao copo (10, 20 ou 30ml). O copo transborda em um limite secreto (80-120ml). Quem derramar perde!",
    [MINIGAMES.TOWER]: "Remova blocos da torre. Quanto mais blocos, maior a chance de cair. Quem derrubar perde!",
    [MINIGAMES.ELEMENTS]: "Fogo 🔥 vence Planta 🌿, Planta 🌿 vence Água 💧, Água 💧 vence Fogo 🔥. Vença 3 rodadas!",
    [MINIGAMES.RACE]: "Corrida de 100m! 'Sprint' (⚡) avança muito mas pode falhar. 'Seguro' (🚶) avança poco mas é garantido. Chegue primeiro!",
    [MINIGAMES.SCRAMBLED_WORDS]: "Uma palavra embaralhada aparece. O primeiro a digitar a palavra correta no chat vence!",
    [MINIGAMES.BUCKSHOT]: "Munição secreta! Atire no oponente (se for real, dano) ou em si mesmo (festim = turno extra). Quem zerar a vida perde!"
};

const TWO_PLAYER_ONLY_GAMES = [
    MINIGAMES.TIC_TAC_TOE,
    MINIGAMES.PAR_IMPAR,
    MINIGAMES.LUCKY_BUTTON,
    MINIGAMES.GLADIATOR,
    MINIGAMES.ELEMENTS
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('duelo')
        .setDescription('Desafie alguém para um duelo de minigames aleatórios.')
        .addIntegerOption(option =>
            option.setName('valor')
                .setDescription('Valor da aposta (0 para Amistoso)')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(100000))
        .addStringOption(option =>
            option.setName('jogo')
                .setDescription('Escolha um minigame específico (Opcional)')
                .setRequired(false)
                .addChoices(
                    { name: '⭕ Jogo da Velha', value: 'tictactoe' },
                    { name: '🎲 General (Dados)', value: 'dados' },
                    { name: '⚖️ Par ou Ímpar', value: 'par_impar' },
                    { name: '🔢 Matemática', value: 'math' },
                    { name: '🧨 Batata Quente', value: 'hot_potato' },
                    { name: '🔫 Roleta Russa', value: 'roleta_russa' },
                    { name: '💎 Caça ao Tesouro', value: 'treasure_hunt' },
                    { name: '💣 Desarmar Bomba', value: 'bomba' },
                    { name: '🃏 Blackjack', value: 'maior_carta' },
                    { name: '⚽ Pênaltis', value: 'lucky_button' },
                    { name: '⚔️ Gladiadores', value: 'gladiator' },
                    { name: '🥛 Copo Cheio', value: 'cup' },
                    { name: '🏗️ Torre Instável', value: 'tower' },
                    { name: '🔥 Elementos', value: 'elements' },
                    { name: '🏎️ Corrida', value: 'race' },
                    { name: '🔠 Palavras', value: 'scrambled_words' },
                    { name: '💥 Buckshot', value: 'buckshot' }
                )),

    async execute(interaction) {
        const bet = interaction.options.getInteger('valor');
        const selectedGame = interaction.options.getString('jogo') || 'random';
        
        const maxPlayers = (selectedGame !== 'random' && TWO_PLAYER_ONLY_GAMES.includes(selectedGame)) ? 2 : 4;

        const user = await db.getUser(interaction.user.id);
        const now = new Date();
        const today = now.toISOString().split('T')[0];

        if (user.lastGambleDate !== today) {
            await db.updateUser(interaction.user.id, { dailyGambles: 0, lastGambleDate: today });
            user.dailyGambles = 0;
        }

        if (user.dailyGambles >= 20 && bet > 0) {
            return interaction.reply({ 
                content: `🛑 **Limite Diário Atingido!**\nSeu pet está exausto de tantas emoções. Você só pode jogar amistosos (aposta 0) hoje.\n\n*Apostas hoje: ${user.dailyGambles}/20*`, 
                ephemeral: true 
            });
        }

        if (bet > 0) {
            if (bet < 50) return interaction.reply({ content: '❌ A aposta mínima é de **50 moedas**. Use 0 para amistoso.', ephemeral: true });
            if (user.wallet < bet) return interaction.reply({ content: `❌ Você não tem **${bet}** moedas.`, ephemeral: true });

            if (bet >= 50000) {
                const confirmEmbed = new EmbedBuilder()
                    .setTitle('⚠️ Aposta de Alto Risco')
                    .setDescription(`Você está prestes a criar um lobby valendo **${bet.toLocaleString()} moedas** (por pessoa).\nTem certeza que deseja continuar?`)
                    .setColor(colors.warning);

                const confirmRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('confirm_duel').setLabel('Confirmar').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('cancel_duel').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
                );

                const confirmMsg = await interaction.reply({ embeds: [confirmEmbed], components: [confirmRow], ephemeral: true, fetchReply: true });

                try {
                    const confirmation = await confirmMsg.awaitMessageComponent({
                        filter: i => i.user.id === interaction.user.id && ['confirm_duel', 'cancel_duel'].includes(i.customId),
                        time: 30000
                    });

                    if (confirmation.customId === 'cancel_duel') {
                        await confirmation.update({ content: '❌ Criação de lobby cancelada.', embeds: [], components: [] });
                        return;
                    }

                    await confirmation.update({ content: '✅ Lobby confirmado! Criando sala...', embeds: [], components: [] });
                } catch (e) {
                    await interaction.editReply({ content: '⏱️ Tempo esgotado. Cancelado.', embeds: [], components: [] });
                    return;
                }
            }
        }

        let gameName = 'Aleatório (Sorteado ao iniciar)';
        if (selectedGame !== 'random') {
             if (MINIGAME_INFO[selectedGame]) {
                 gameName = `${MINIGAME_INFO[selectedGame].emoji} ${MINIGAME_INFO[selectedGame].name}`;
             }
        }

        const embed = new EmbedBuilder()
            .setColor(colors.default)
            .setTitle('⚔️ Lobby de Duelo')
            .setDescription(`**${interaction.user.username}** criou um lobby!\n\n` +
                `🎲 **Jogo:** ${gameName}\n` +
                `💰 **Aposta:** ${bet > 0 ? bet : 'Amistoso'} (por pessoa)\n` +
                `👥 **Jogadores (1/${maxPlayers}):**\n` +
                `1. **${interaction.user.username}** 👑\n` +
                `\n*Aguardando jogadores...*`)
            .setThumbnail(interaction.user.displayAvatarURL());

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`duelo_join`).setLabel('Entrar').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`duelo_leave`).setLabel('Sair').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`duelo_start`).setLabel(`Iniciar (1/${maxPlayers})`).setStyle(ButtonStyle.Success).setDisabled(true),
            new ButtonBuilder().setCustomId(`duelo_cancel`).setLabel('Cancelar').setStyle(ButtonStyle.Danger)
        );

        if (bet === 0) {
            row.addComponents(
                new ButtonBuilder().setCustomId(`duelo_ai_${interaction.user.id}_${selectedGame}`).setLabel('Jogar com IA').setStyle(ButtonStyle.Primary).setEmoji('🤖')
            );
        }

        let msg;
        if (interaction.replied || interaction.deferred) {
            msg = await interaction.followUp({ embeds: [embed], components: [row] });
        } else {
            msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
        }
        
        activeGames.set(msg.id, {
            status: 'LOBBY',
            hostId: interaction.user.id,
            hostName: interaction.user.username,
            bet: bet,
            selectedGame: selectedGame,
            players: [{
                id: interaction.user.id,
                username: interaction.user.username,
                avatar: interaction.user.displayAvatarURL()
            }],
            createdAt: Date.now()
        });

        setTimeout(async () => {
            const g = activeGames.get(msg.id);
            if (g && g.status === 'LOBBY' && g.players.length <= 1) {
                activeGames.delete(msg.id);
                try {
                    await msg.edit({ content: '🚫 **Lobby cancelado** por inatividade (1 minuto sem outros jogadores).', embeds: [], components: [] });
                } catch (e) {}
            }
        }, 60000);
    },

    async resetTimeout(interaction, game) {
        if (game.timeout) clearTimeout(game.timeout);
        
        game.timeout = setTimeout(async () => {
            if (!activeGames.has(interaction.message.id)) return;
            
            let winnerId = null;
            let reason = ' (W.O. - Oponente não respondeu)';

            if (game.turn) {
                const loserId = game.turn;
                const winner = game.players.find(p => p.id !== loserId);
                if (winner) winnerId = winner.id;
            } 
            else if (game.gameType === 'par_impar' && game.data.choices) {
                 const p1 = game.players[0].id;
                 const p2 = game.players[1].id;
                 const p1Moved = !!game.data.choices[p1];
                 const p2Moved = !!game.data.choices[p2];
                 
                 if (p1Moved && !p2Moved) winnerId = p1;
                 else if (!p1Moved && p2Moved) winnerId = p2;
            }
            else if (game.gameType === 'dados' && game.data.finished) {
                 const p1 = game.players[0].id;
                 const p2 = game.players[1].id;
                 const p1Done = !!game.data.finished[p1];
                 const p2Done = !!game.data.finished[p2];

                 if (p1Done && !p2Done) winnerId = p1;
                 else if (!p1Done && p2Done) winnerId = p2;
            }

            if (winnerId) {
                await this.endGame(interaction, game, winnerId, reason);
            } else {
                if (game.bet > 0) {
                     for (const p of game.players) {
                         if (p.id === 'AI') continue;
                         const u = await db.getUser(p.id);
                         await db.updateUser(p.id, { wallet: u.wallet + game.bet });
                     }
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
        const game = activeGames.get(message.id);
        
        if (!game) {
            if (customId.startsWith('confirm_') || customId.startsWith('cancel_')) return;
            return interaction.reply({ content: '❌ Este jogo/lobby não existe mais.', ephemeral: true });
        }

        const parts = customId.split('_');
        const action = parts[1];

        if (game.status === 'LOBBY') {
            const maxPlayers = (game.selectedGame !== 'random' && TWO_PLAYER_ONLY_GAMES.includes(game.selectedGame)) ? 2 : 4;

            if (action === 'join') {
                if (game.players.some(p => p.id === user.id)) {
                    return interaction.reply({ content: '⚠️ Você já está no lobby.', ephemeral: true });
                }
                if (game.players.length >= maxPlayers) {
                    return interaction.reply({ content: `❌ O lobby está cheio (${maxPlayers}/${maxPlayers}).`, ephemeral: true });
                }

                if (game.bet > 0) {
                    const dbUser = await db.getUser(user.id);
                    if (dbUser.wallet < game.bet) {
                        return interaction.reply({ content: `❌ Você não tem **${game.bet}** Foxies para entrar.`, ephemeral: true });
                    }
                }

                game.players.push({
                    id: user.id,
                    username: user.username,
                    avatar: user.displayAvatarURL()
                });

                const embed = EmbedBuilder.from(message.embeds[0]);
                let playerList = game.players.map((p, i) => `${i+1}. **${p.username}** ${p.id === game.hostId ? '👑' : ''}`).join('\n');
                embed.setDescription(embed.data.description.replace(/👥 \*\*Jogadores.*\n([\s\S]*?)\n\n\*Aguardando/, `👥 **Jogadores (${game.players.length}/${maxPlayers}):**\n${playerList}\n\n*Aguardando`));
                
                const row = ActionRowBuilder.from(message.components[0]);
                const startBtn = row.components.find(c => c.data.custom_id === 'duelo_start');
                if (startBtn) {
                    startBtn.setLabel(`Iniciar (${game.players.length}/${maxPlayers})`);
                    startBtn.setDisabled(game.players.length < 2);
                }

                await interaction.update({ embeds: [embed], components: [row] });
                return;
            }

            if (action === 'leave') {
                if (!game.players.some(p => p.id === user.id)) {
                    return interaction.reply({ content: '⚠️ Você não está no lobby.', ephemeral: true });
                }
                
                game.players = game.players.filter(p => p.id !== user.id);

                if (game.players.length === 0) {
                    activeGames.delete(message.id);
                    await interaction.update({ content: '🚫 Todos saíram. Lobby encerrado.', embeds: [], components: [] });
                    return;
                }

                let contentMsg = '';
                
                if (user.id === game.hostId) {
                    game.hostId = game.players[0].id;
                    game.hostName = game.players[0].username;
                    contentMsg = `👑 **${game.hostName}** é o novo líder do lobby!`;
                }

                const embed = EmbedBuilder.from(message.embeds[0]);
                let playerList = game.players.map((p, i) => `${i+1}. **${p.username}** ${p.id === game.hostId ? '👑' : ''}`).join('\n');
                embed.setDescription(embed.data.description.replace(/👥 \*\*Jogadores.*\n([\s\S]*?)\n\n\*Aguardando/, `👥 **Jogadores (${game.players.length}/${maxPlayers}):**\n${playerList}\n\n*Aguardando`));

                const row = ActionRowBuilder.from(message.components[0]);
                const startBtn = row.components.find(c => c.data.custom_id === 'duelo_start');
                if (startBtn) {
                    startBtn.setLabel(`Iniciar (${game.players.length}/${maxPlayers})`);
                    startBtn.setDisabled(game.players.length < 2);
                }

                if (contentMsg) {
                     await interaction.update({ content: contentMsg, embeds: [embed], components: [row] });
                } else {
                    await interaction.update({ embeds: [embed], components: [row] });
                }
                return;
            }

            if (action === 'cancel') {
                if (user.id !== game.hostId) return interaction.reply({ content: '❌ Apenas o host pode cancelar.', ephemeral: true });
                
                if (game.players.length > 1) {
                    return interaction.reply({ content: '❌ Existem outros jogadores no lobby. Use o botão **Sair** para transferir a liderança, ou peça para eles saírem.', ephemeral: true });
                }

                activeGames.delete(message.id);
                await interaction.update({ content: '🚫 Lobby cancelado pelo host.', embeds: [], components: [] });
                return;
            }

            if (action === 'start') {
                if (user.id !== game.hostId) return interaction.reply({ content: '❌ Apenas o host pode iniciar.', ephemeral: true });
                if (game.players.length < 2) return interaction.reply({ content: '❌ Precisa de pelo menos 2 jogadores.', ephemeral: true });

                let gameType = game.selectedGame;
                if (gameType === 'random') {
                    const allGames = Object.values(MINIGAMES);
                    let compatible = allGames;
                    if (game.players.length > 2) {
                        compatible = allGames.filter(g => !TWO_PLAYER_ONLY_GAMES.includes(g));
                    }
                    gameType = compatible[Math.floor(Math.random() * compatible.length)];
                } else {
                    if (game.players.length > 2) {
                        if (TWO_PLAYER_ONLY_GAMES.includes(gameType)) {
                            return interaction.reply({ content: `❌ O jogo **${MINIGAME_INFO[gameType].name}** só suporta 2 jogadores. Remova alguém ou cancele.`, ephemeral: true });
                        }
                    }
                }

                if (game.bet > 0) {
                    const today = new Date().toISOString().split('T')[0];
                    for (const p of game.players) {
                        const dbUser = await db.getUser(p.id);
                        if (dbUser.wallet < game.bet) {
                            return interaction.reply({ content: `❌ **${p.username}** não tem saldo suficiente!`, ephemeral: true });
                        }
                    }

                    for (const p of game.players) {
                        const dbUser = await db.getUser(p.id);
                        await db.updateUser(p.id, { 
                            wallet: dbUser.wallet - game.bet,
                            dailyGambles: (dbUser.dailyGambles || 0) + 1,
                            lastGambleDate: today
                        });
                        
                        const pet = await db.getActivePet(p.id);
                        if (pet) {
                            await db.updatePet(pet.id, { energy: Math.max(0, pet.energy - 2) });
                        }
                    }
                }

                game.status = 'PLAYING';
                game.gameType = gameType;
                game.turn = game.players[Math.floor(Math.random() * game.players.length)].id;
                game.data = {};
                
                game.hostId = game.players[0].id;
                game.hostName = game.players[0].username;
                if (game.players.length === 2) {
                    game.guestId = game.players[1].id;
                    game.guestName = game.players[1].username;
                }

                await this.initGameData(game);
                this.resetTimeout(interaction, game);
                await this.startCountdown(interaction, game);
                return;
            }

            if (action === 'ai') {
                 if (user.id !== game.hostId) return interaction.reply({ content: '❌ Apenas o host pode escolher IA.', ephemeral: true });
            }
        }

        if (action === 'rematch') {
            const game = activeGames.get(message.id);
            if (!game) return interaction.reply({ content: '❌ Tempo esgotado para revanche.', ephemeral: true });
            if (game.status !== 'ended') return interaction.reply({ content: '❌ O jogo ainda não acabou.', ephemeral: true });
            
            if (!game.players.some(p => p.id === user.id)) {
                return interaction.reply({ content: '❌ Você não participou deste jogo.', ephemeral: true });
            }

            if (!game.rematch) game.rematch = {};
            
            if (game.rematch[user.id]) {
                 return interaction.reply({ content: '✅ Você já aceitou a revanche. Aguarde os outros.', ephemeral: true });
            }

            game.rematch[user.id] = true;

            const allAccepted = game.players.every(p => game.rematch[p.id]);

            if (allAccepted) {
                const nextBet = (game.players.length === 2) ? (game.bet * 2) : game.bet;

                if (nextBet > 0) {
                    const poorPlayers = [];
                    for (const player of game.players) {
                        if (player.id === 'AI') continue;
                        const userDoc = await db.getUser(player.id);
                        if (userDoc.wallet < nextBet) {
                            poorPlayers.push(player.username);
                        }
                    }

                    if (poorPlayers.length > 0) {
                        activeGames.delete(message.id);
                        return interaction.update({ content: `❌ Revanche cancelada! **${poorPlayers.join(', ')}** não tem saldo suficiente para a aposta de **${nextBet}**.`, embeds: [], components: [] });
                    }

                    for (const player of game.players) {
                        if (player.id === 'AI') continue;
                        const userDoc = await db.getUser(player.id);
                        await db.updateUser(player.id, { wallet: userDoc.wallet - nextBet });
                    }
                }

                let newGameType = game.gameType;
                if (game.originalSelection === 'random') {
                    const keys = Object.values(MINIGAMES);
                    newGameType = keys[Math.floor(Math.random() * keys.length)];
                }

                game.status = 'playing';
                game.bet = nextBet;
                game.rematchCount = (game.rematchCount || 0) + 1;
                game.gameType = newGameType;
                game.data = {};
                game.rematch = {}; 
                
                game.players.forEach(p => {
                    p.hp = 100;
                    p.score = 0;
                    p.eliminated = false;
                });
                
                const randomPlayer = game.players[Math.floor(Math.random() * game.players.length)];
                game.turn = randomPlayer.id;
                
                await this.initGameData(game);
                
                await interaction.update({ 
                    content: `🔄 **REVANCHE INICIADA!**\n💰 Aposta: **${nextBet}**\n🎲 Novo Jogo: **${MINIGAME_INFO[newGameType].name}**`,
                    embeds: [], 
                    components: [] 
                });

                await this.startCountdown(interaction, game);

                if (game.guestId === 'AI') {
                    setTimeout(() => this.aiMove(interaction, game), 4500);
                }

            } else {
                const acceptedCount = game.players.filter(p => game.rematch[p.id]).length;
                const totalPlayers = game.players.length;
                const nextBet = (game.players.length === 2) ? (game.bet * 2) : game.bet;
                
                const rematchBtn = new ButtonBuilder()
                    .setCustomId('duelo_rematch')
                    .setLabel(`Revanche (${acceptedCount}/${totalPlayers})${nextBet > 0 ? ` [${nextBet}]` : ''}`)
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔄');

                const row = new ActionRowBuilder().addComponents(rematchBtn);
                
                await interaction.update({ components: [row] });
            }
            return;
        }

        if (action === 'ai') {
            const hostId = parts[2];
            const selectedGame = parts.slice(3).join('_') || 'random';

            if (user.id !== hostId) return interaction.reply({ content: '❌ Apenas o criador pode escolher jogar com a IA.', ephemeral: true });
            
            const embedAI = new EmbedBuilder()
                .setColor(colors.default)
                .setTitle('🤖 Configuração da IA')
                .setDescription('Escolha a dificuldade da Inteligência Artificial:')
                .addFields(
                    { name: '🟢 Fácil', value: 'IA comete erros básicos e joga aleatoriamente.', inline: true },
                    { name: '🟡 Médio', value: 'IA joga com lógica padrão.', inline: true },
                    { name: '🔴 Difícil', value: 'IA tenta maximizar suas chances de vitória.', inline: true }
                );

            const rowAI = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`duelo_startai_${hostId}_easy_${selectedGame}`).setLabel('Fácil').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`duelo_startai_${hostId}_medium_${selectedGame}`).setLabel('Médio').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`duelo_startai_${hostId}_hard_${selectedGame}`).setLabel('Difícil').setStyle(ButtonStyle.Danger)
            );

            await interaction.update({ embeds: [embedAI], components: [rowAI] });
            return;
        }

        if (action.startsWith('startai')) {
            const hostId = parts[2];
            const difficulty = parts[3];
            const selectedGame = parts.slice(4).join('_') || 'random';
            
            if (user.id !== hostId) return interaction.reply({ content: '❌ Apenas o criador pode iniciar.', ephemeral: true });

            let gameType = selectedGame;
            if (gameType === 'random') {
                const keys = Object.values(MINIGAMES);
                gameType = keys[Math.floor(Math.random() * keys.length)];
            }

            const hostMember = await interaction.guild.members.fetch(hostId);
            
            const gameState = {
                gameType: gameType,
                hostId, guestId: 'AI',
                hostName: hostMember.user.username, guestName: '🤖 FoxHound AI',
                players: [
                    { id: hostId, username: hostMember.user.username, hp: 100, score: 0, eliminated: false },
                    { id: 'AI', username: '🤖 FoxHound AI', hp: 100, score: 0, eliminated: false }
                ],
                bet: 0,
                difficulty,
                originalSelection: selectedGame,
                rematchCount: 0,
                data: {},
                turn: Math.random() < 0.5 ? hostId : 'AI'
            };

            await this.initGameData(gameState);
            activeGames.set(message.id, gameState);
            
            this.resetTimeout(interaction, gameState);
            await this.startCountdown(interaction, gameState);
            
            if (gameState.guestId === 'AI') {
                setTimeout(() => this.aiMove(interaction, gameState), 4500);
            }
            return;
        }

        if (action === 'accept') {
            const hostId = parts[2];
            const bet = parseInt(parts[3]);
            const selectedGame = parts.slice(4).join('_') || 'random';

            if (user.id === hostId) return interaction.reply({ content: '❌ Você não pode jogar contra si mesmo.', ephemeral: true });

            if (bet > 0) {
                const opponent = await db.getUser(user.id);
                if (opponent.wallet < bet) return interaction.reply({ content: `❌ Sem saldo suficiente (${bet}).`, ephemeral: true });
                
                const host = await db.getUser(hostId);
                if (host.wallet < bet) return interaction.reply({ content: `❌ O host não tem mais saldo.`, ephemeral: true });

                if (bet >= 50000) {
                    const confirmEmbed = new EmbedBuilder()
                        .setTitle('⚠️ Aposta de Alto Risco')
                        .setDescription(`Você está prestes a aceitar um duelo valendo **${bet.toLocaleString()} moedas**.\nTem certeza que deseja continuar?`)
                        .setColor(colors.warning);

                    const confirmRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('confirm_duel_accept').setLabel('Confirmar').setStyle(ButtonStyle.Danger),
                        new ButtonBuilder().setCustomId('cancel_duel_accept').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
                    );

                    const confirmMsg = await interaction.reply({
                        embeds: [confirmEmbed],
                        components: [confirmRow],
                        ephemeral: true,
                        fetchReply: true
                    });

                    try {
                        const confirmation = await confirmMsg.awaitMessageComponent({
                            filter: i => i.user.id === interaction.user.id && ['confirm_duel_accept', 'cancel_duel_accept'].includes(i.customId),
                            time: 30000
                        });

                        if (confirmation.customId === 'cancel_duel_accept') {
                            await confirmation.update({ content: '❌ Aceitação cancelada.', embeds: [], components: [] });
                            return;
                        }

                        await confirmation.update({ content: '✅ Duelo aceito! Preparando...', embeds: [], components: [] });
                    } catch (e) {
                        await interaction.editReply({ content: '⏱️ Tempo esgotado. Aceitação cancelada.', embeds: [], components: [] });
                        return;
                    }
                }

                await db.updateUser(hostId, { 
                    wallet: host.wallet - bet,
                    dailyGambles: (host.dailyGambles || 0) + 1,
                    lastGambleDate: today
                });
                await db.updateUser(user.id, { 
                    wallet: opponent.wallet - bet,
                    dailyGambles: (opponent.dailyGambles || 0) + 1,
                    lastGambleDate: today
                });

                const hostPet = await db.getActivePet(hostId);
                if (hostPet) {
                    const newEnergy = Math.max(0, hostPet.energy - 2);
                    await db.updatePet(hostPet.id, { energy: newEnergy });
                }
                const opponentPet = await db.getActivePet(user.id);
                if (opponentPet) {
                    const newEnergy = Math.max(0, opponentPet.energy - 2);
                    await db.updatePet(opponentPet.id, { energy: newEnergy });
                }
            }

            // Selecionar Minigame
            let gameType = selectedGame;
            if (gameType === 'random') {
                const keys = Object.values(MINIGAMES);
                gameType = keys[Math.floor(Math.random() * keys.length)];
            }

            const hostMember = await interaction.guild.members.fetch(hostId);
            const gameState = {
                gameType: gameType,
                hostId, guestId: user.id,
                hostName: hostMember.user.username, guestName: user.username,
                bet,
                originalSelection: selectedGame, // Salva se foi random ou específico
                rematchCount: 0,
                data: {}, // Dados específicos do minigame
                turn: Math.random() < 0.5 ? hostId : user.id // Turno inicial aleatório
            };

            // Inicializar dados específicos do jogo
            await this.initGameData(gameState);
            
            activeGames.set(message.id, gameState);
            
            // INICIAR CONTAGEM REGRESSIVA EM VEZ DE RENDERIZAR DIRETO
            await this.startCountdown(interaction, gameState);
            return;
        }

        // --- JOGAR (INTERAÇÃO NO MINIGAME) ---
        if (action === 'play') {
            const game = activeGames.get(message.id);
            if (!game) return interaction.reply({ content: '❌ Jogo expirado.', ephemeral: true });
            
            // Verificar se o jogador está na lista de players
            const isPlayer = game.players ? game.players.some(p => p.id === user.id) : (user.id === game.hostId || user.id === game.guestId);
            
            if (!isPlayer) return interaction.reply({ content: '❌ Você não está no jogo.', ephemeral: true });

            await this.processMove(interaction, game, parts);
        }
    },

    async startCountdown(interaction, game) {
        const info = MINIGAME_INFO[game.gameType];
        const rules = MINIGAME_RULES[game.gameType];

        let extraInfo = "";
        
        // Jogos onde o turno inicial é importante e deve ser anunciado
        const turnBasedGames = [
            MINIGAMES.TIC_TAC_TOE,
            MINIGAMES.HOT_POTATO,
            MINIGAMES.ROLETA_RUSSA,
            MINIGAMES.TREASURE_HUNT,
            MINIGAMES.BOMBA,
            MINIGAMES.MAIOR_CARTA,
            MINIGAMES.GLADIATOR,
            MINIGAMES.CUP,
            MINIGAMES.TOWER,
            MINIGAMES.RACE,
            MINIGAMES.BUCKSHOT
        ];

        if (turnBasedGames.includes(game.gameType)) {
             const starterName = game.players.find(p => p.id === game.turn)?.username || 'Desconhecido';
             extraInfo = `\n🎲 **Sorteio:** Quem começa é **${starterName}**!`;
        }

        const playerNames = game.players.map(p => `**${p.username}**`).join(' vs ');

        const getEmbed = (seconds) => new EmbedBuilder()
            .setColor(colors.default)
            .setTitle(`🎲 Sorteio: ${info.emoji} ${info.name}`)
            .setDescription(`${playerNames}\n\n` +
                `📜 **Regras:**\n${rules}\n` +
                `${extraInfo}\n` +
                `⏰ **Iniciando em:** ${seconds} segundos...`)
            .setFooter({ text: 'Prepare-se!' });

        // Update inicial (10s)
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [getEmbed(10)], components: [] });
            } else {
                await interaction.update({ embeds: [getEmbed(10)], components: [] });
            }
        } catch (e) {
            console.error('Erro ao iniciar countdown:', e);
            try { await interaction.message.edit({ embeds: [getEmbed(10)], components: [] }); } catch(e2){}
        }

        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        
        // 10s (já enviado) -> wait 5s -> 5s
        await sleep(5000);
        try { await interaction.message.edit({ embeds: [getEmbed(5)] }); } catch(e){}

        // 5s -> wait 2s -> 3s
        await sleep(2000);
        try { await interaction.message.edit({ embeds: [getEmbed(3)] }); } catch(e){}

        // 3s -> wait 1s -> 2s
        await sleep(1000);
        try { await interaction.message.edit({ embeds: [getEmbed(2)] }); } catch(e){}
        
        // 2s -> wait 1s -> 1s
        await sleep(1000);
        try { await interaction.message.edit({ embeds: [getEmbed(1)] }); } catch(e){}

        // 1s -> wait 1s -> GO (RenderGame)
        await sleep(1000);

        await this.renderGame(interaction, game, false, true); // Force Edit
    },

    async initGameData(game) {
        switch (game.gameType) {
            case MINIGAMES.TIC_TAC_TOE:
                game.data.board = Array(9).fill(null); // 0-8
                break;
            case MINIGAMES.DADOS:
                game.data.scores = {};
                game.data.finished = {};
                break;
            case MINIGAMES.PAR_IMPAR:
                game.data.choices = {};
                break;
            case MINIGAMES.MATH:
                const n1 = Math.floor(Math.random() * 50) + 1;
                const n2 = Math.floor(Math.random() * 50) + 1;
                game.data.question = `${n1} + ${n2}`;
                game.data.answer = n1 + n2;
                game.data.options = [game.data.answer, game.data.answer + 1, game.data.answer - 1, game.data.answer + 2].sort(() => Math.random() - 0.5);
                break;
            case MINIGAMES.HOT_POTATO:
                game.data.fuse = Math.floor(Math.random() * 11) + 5; // 5 a 15 turnos
                break;
            case MINIGAMES.ROLETA_RUSSA:
                game.data.bullets = 6;
                game.data.bulletPosition = Math.floor(Math.random() * 6);
                game.data.currentPosition = 0;
                break;
            case MINIGAMES.TREASURE_HUNT:
                // 1 Tesouro, 2 Bombas, 6 Vazios
                const items = ['T', 'B', 'B', 'E', 'E', 'E', 'E', 'E', 'E'];
                game.data.grid = items.sort(() => Math.random() - 0.5);
                game.data.revealed = Array(9).fill(null); // Armazena o que foi revelado visualmente
                break;
            case MINIGAMES.BOMBA:
                game.data.wires = [true, true, true];
                game.data.actions = ['win', 'lose', 'neutral'].sort(() => Math.random() - 0.5);
                game.data.wiresState = [null, null, null];
                break;
            case MINIGAMES.MAIOR_CARTA:
                game.data.deck = [];
                const suits = ['♠️', '♥️', '♦️', '♣️'];
                const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
                for (const s of suits) {
                    for (const v of values) {
                        let weight = parseInt(v);
                        if (['J', 'Q', 'K'].includes(v)) weight = 10;
                        if (v === 'A') weight = 11;
                        game.data.deck.push({ display: `${v}${s}`, weight });
                    }
                }
                game.data.deck.sort(() => Math.random() - 0.5);
                
                // Deal initial hands
                game.data.hands = {};
                game.data.scores = {};
                game.data.status = {};
                
                for (const p of game.players) {
                    game.data.hands[p.id] = [];
                    game.data.scores[p.id] = 0;
                    game.data.status[p.id] = 'playing';
                    // Draw 2 cards
                    game.data.hands[p.id].push(game.data.deck.pop());
                    game.data.hands[p.id].push(game.data.deck.pop());
                }
                break;
            case MINIGAMES.LUCKY_BUTTON:
                game.data.round = 1;
                game.data.maxRounds = 5;
                game.data.score = { [game.hostId]: 0, [game.guestId]: 0 }; // Goals
                game.data.shooter = game.hostId;
                game.data.keeper = game.guestId;
                game.data.history = []; // { round, shooter, result }
                game.data.choices = {};
                break;
            case MINIGAMES.GLADIATOR:
                game.data.hp = { [game.hostId]: 100, [game.guestId]: 100 };
                game.data.shield = { [game.hostId]: false, [game.guestId]: false };
                break;
            case MINIGAMES.CUP:
                game.data.waterLevel = 0;
                game.data.maxCapacity = Math.floor(Math.random() * 41) + 80; // 80-120ml
                break;
            case MINIGAMES.TOWER:
                game.data.blocksRemoved = 0;
                break;
            case MINIGAMES.ELEMENTS:
                game.data.score = { [game.hostId]: 0, [game.guestId]: 0 };
                game.data.choices = {};
                break;
            case MINIGAMES.RACE:
                game.data.position = {};
                for (const p of game.players) {
                    game.data.position[p.id] = 0;
                }
                game.data.finishLine = 100;
                break;
            case MINIGAMES.SCRAMBLED_WORDS:
                let word = null;
                
                // Tenta gerar com IA se disponível (DESATIVADO PARA ECONOMIZAR COTA)
                /*
                if (process.env.OPENAI_KEY) {
                    try {
                        const completion = await openai.chat.completions.create({
                            model: "gpt-4o-mini", // Use um modelo rápido e barato
                            messages: [
                                { role: "system", content: "Você é um gerador de palavras para um jogo. Responda APENAS com a palavra, sem pontuação, sem espaços extras. A palavra deve ser em Português do Brasil, substantivo comum, e ter entre 5 e 12 letras." },
                                { role: "user", content: "Gere uma palavra aleatória difícil." }
                            ],
                            max_tokens: 10,
                            temperature: 1.2, // Alta criatividade
                        });
                        
                        const aiWord = completion.choices[0]?.message?.content?.trim().toLowerCase();
                        if (aiWord && /^[a-zçáéíóúâêôãõü]+$/i.test(aiWord)) {
                            word = aiWord;
                        }
                    } catch (error) {
                        console.error("Erro ao gerar palavra com IA:", error);
                    }
                }
                */

                // Fallback para lista estática
                if (!word) {
                    const categories = Object.keys(words);
                    const randomCategory = categories[Math.floor(Math.random() * categories.length)];
                    const wordList = words[randomCategory];
                    
                    // Filtrar por dificuldade
                    let filteredWords = wordList;
                    const diff = game.difficulty || 'medium';
                    
                    if (diff === 'easy') {
                        filteredWords = wordList.filter(w => w.length <= 6);
                    } else if (diff === 'hard') {
                        filteredWords = wordList.filter(w => w.length > 9);
                    } else { // medium
                        filteredWords = wordList.filter(w => w.length > 6 && w.length <= 9);
                    }
                    
                    if (filteredWords.length === 0) filteredWords = wordList; // Fallback se não encontrar
                    
                    word = filteredWords[Math.floor(Math.random() * filteredWords.length)];
                    game.data.category = randomCategory;
                }

                let scrambled = word.split('').sort(() => Math.random() - 0.5).join('');
                while (scrambled === word) {
                    scrambled = word.split('').sort(() => Math.random() - 0.5).join('');
                }
                game.data.original = word;
                game.data.scrambled = scrambled;
                // Para IA funcionar corretamente
                game.turn = 'AI'; // Dispara a IA, mas collector funciona para ambos
                break;

            case MINIGAMES.BUCKSHOT:
                game.data.hp = {};
                for (const p of game.players) {
                    game.data.hp[p.id] = 4;
                }
                game.data.magazine = [];
                game.data.knownCount = { live: 0, blank: 0 };
                this.loadBuckshot(game);
                break;

        }
    },

    async aiMove(interaction, game) {
        if (!activeGames.has(interaction.message.id)) return;
        
        // Simular tempo de "pensar"
        const delay = Math.random() * 1000 + 1500; // 1.5s - 2.5s
        await new Promise(r => setTimeout(r, delay));

        // Re-verificar se o jogo ainda existe
        if (!activeGames.has(interaction.message.id)) return;
        
        // Jogos onde a IA deve jogar mesmo sem ser "sua vez" explícita (jogos simultâneos)
        const simultaneousGames = [
            MINIGAMES.DADOS, 
            MINIGAMES.PAR_IMPAR, 
            MINIGAMES.MATH, 
            MINIGAMES.ELEMENTS,
            MINIGAMES.LUCKY_BUTTON
        ];

        if (!simultaneousGames.includes(game.gameType) && game.turn !== 'AI') return;

        // Verificações específicas para não jogar repetidamente
        if (game.gameType === MINIGAMES.DADOS && game.data.finished['AI']) return;
        if (game.gameType === MINIGAMES.PAR_IMPAR && game.data.choices['AI']) return;
        if (game.gameType === MINIGAMES.ELEMENTS && game.data.choices['AI']) return;
        if (game.gameType === MINIGAMES.LUCKY_BUTTON) {
             const role = game.data.shooter === 'AI' ? 'shooter' : (game.data.keeper === 'AI' ? 'keeper' : null);
             if (role && game.data.choices[role]) return;
        }

        const diff = game.difficulty || 'medium';
        let move = null;

        switch (game.gameType) {
            case MINIGAMES.TIC_TAC_TOE: {
                const board = game.data.board;
                const available = board.map((v, i) => v === null ? i : null).filter(v => v !== null);
                
                if (diff === 'hard') {
                    const checkLine = (a,b,c, sym) => {
                        if (board[a] === sym && board[b] === sym && board[c] === null) return c;
                        if (board[a] === sym && board[c] === sym && board[b] === null) return b;
                        if (board[b] === sym && board[c] === sym && board[a] === null) return a;
                        return null;
                    };
                    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
                    
                    // 1. Ganhar ('O' é guest/AI se host for 'X', mas símbolos dependem de quem começou?
                    // No TicTacToe init: userId === game.hostId ? 'X' : 'O'.
                    // AI é guestId='AI', então AI é sempre 'O'.
                    for (let l of lines) { const m = checkLine(l[0],l[1],l[2], 'O'); if (m !== null) { move = m; break; } }
                    if (move === null) {
                         for (let l of lines) { const m = checkLine(l[0],l[1],l[2], 'X'); if (m !== null) { move = m; break; } }
                    }
                    if (move === null && board[4] === null) move = 4;
                }
                
                if (move === null && available.length > 0) move = available[Math.floor(Math.random() * available.length)];
                break;
            }

            case MINIGAMES.DADOS: move = 'roll'; break;
            case MINIGAMES.PAR_IMPAR: move = Math.floor(Math.random() * 5) + 1; break;
            
            case MINIGAMES.MATH:
                const isCorrect = (diff === 'easy' && Math.random() < 0.5) || 
                                  (diff === 'medium' && Math.random() < 0.8) || 
                                  (diff === 'hard');
                if (isCorrect) move = game.data.answer;
                else {
                    const wrongs = game.data.options.filter(o => o !== game.data.answer);
                    move = wrongs[Math.floor(Math.random() * wrongs.length)];
                }
                break;

            case MINIGAMES.HOT_POTATO: move = 'pass'; break;
            case MINIGAMES.ROLETA_RUSSA: move = 'shoot'; break;
            
            case MINIGAMES.TREASURE_HUNT:
                const hidden = game.data.revealed.map((v, i) => v === null ? i : null).filter(v => v !== null);
                move = hidden[Math.floor(Math.random() * hidden.length)];
                break;

            case MINIGAMES.BOMBA:
                const safeWires = game.data.wiresState.map((v, i) => v === null ? i : null).filter(v => v !== null);
                move = safeWires[Math.floor(Math.random() * safeWires.length)];
                break;

            case MINIGAMES.MAIOR_CARTA:
                const score = game.data.scores['AI'];
                const threshold = diff === 'easy' ? 19 : 17;
                move = score < threshold ? 'hit' : 'stand';
                break;

            case MINIGAMES.LUCKY_BUTTON:
                move = ['left', 'center', 'right'][Math.floor(Math.random() * 3)];
                break;

            case MINIGAMES.GLADIATOR:
                const hp = game.data.hp['AI'];
                if (hp < 30 && Math.random() < 0.7) move = 'heal';
                else if (Math.random() < 0.2) move = 'def';
                else move = 'atk';
                break;

            case MINIGAMES.CUP:
                const safe = (game.data.maxCapacity || 100) - game.data.waterLevel;
                if (safe >= 30) move = 30;
                else if (safe >= 20) move = 20;
                else move = 10;
                if (diff === 'easy' && Math.random() < 0.5) move = [10,20,30][Math.floor(Math.random()*3)];
                break;

            case MINIGAMES.TOWER:
                if (diff === 'easy') move = ['base', 'mid', 'top'][Math.floor(Math.random()*3)];
                else if (diff === 'medium') move = Math.random() < 0.5 ? 'mid' : 'top';
                else move = 'top';
                break;

            case MINIGAMES.ELEMENTS:
                move = ['fire', 'water', 'plant'][Math.floor(Math.random() * 3)];
                break;

            case MINIGAMES.RACE:
                if (diff === 'hard') {
                    move = game.data.position['AI'] < game.data.position[game.hostId] ? 'sprint' : 'walk';
                } else {
                    move = Math.random() < 0.5 ? 'sprint' : 'walk';
                }
                break;

            case MINIGAMES.SCRAMBLED_WORDS:
                // IA ganha se o tempo passar e o jogo ainda existir
                const wordLen = game.data.original.length;
                let thinkTime = 0;
                
                if (diff === 'easy') thinkTime = wordLen * 1500 + 5000;
                else if (diff === 'medium') thinkTime = wordLen * 1000 + 3000;
                else thinkTime = wordLen * 500 + 1000;

                await new Promise(r => setTimeout(r, thinkTime));

                if (!activeGames.has(interaction.message.id)) return;
                
                try {
                    await interaction.channel.send(`🤖 **FoxHound AI:** A palavra é **${game.data.original}**!`);
                } catch(e) {}
                
                const mockInt = {
                    user: { id: 'AI', username: '🤖 FoxHound AI' },
                    message: interaction.message,
                    guild: interaction.guild,
                    channel: interaction.channel,
                    reply: async () => {},
                    deferUpdate: async () => {},
                    update: async (p) => { try { await interaction.message.edit(p); } catch(e){} },
                    replied: true,
                    deferred: true
                };
                
                await this.endGame(mockInt, game, 'guest');
                return;

            case MINIGAMES.BUCKSHOT:
                const live = game.data.knownCount.live;
                const blank = game.data.knownCount.blank;
                const total = live + blank;
                
                if (total === 0) { move = 'self'; break; } // Should not happen if reloaded correctly

                if (diff === 'easy') {
                    move = Math.random() < 0.5 ? 'self' : 'opp';
                } else {
                    // Lógica probabilística
                    const probLive = live / total;
                    
                    if (probLive > 0.5) {
                        // Mais chance de ser real -> Atira no oponente
                        move = 'opp';
                    } else if (probLive < 0.5) {
                        // Mais chance de ser festim -> Atira em si mesmo (para ganhar turno)
                        move = 'self';
                    } else {
                        // 50/50 -> Aleatório
                        move = Math.random() < 0.5 ? 'self' : 'opp';
                    }
                }
                break;
        }

        if (move !== null) {
            const mockInteraction = {
                user: { id: 'AI', username: '🤖 FoxHound AI' },
                message: interaction.message,
                guild: interaction.guild,
                channel: interaction.channel,
                reply: async () => {},
                deferUpdate: async () => {},
                update: async (payload) => {
                    try { await interaction.message.edit(payload); } catch(e){}
                },
                replied: true,
                deferred: true
            };
            
            await this.processMove(mockInteraction, game, ['duelo', 'play', move]);
        }
    },

    async processMove(interaction, game, parts) {
        // Reconstrói o move caso contenha underscores (ex: shoot_ID)
        const move = parts.slice(2).join('_');
        const userId = interaction.user.id;
        let winner = null;
        let updateMsg = null;

        switch (game.gameType) {
            case MINIGAMES.TIC_TAC_TOE:
                if (userId !== game.turn) return interaction.reply({ content: '⏳ Não é sua vez!', ephemeral: true });
                const pos = parseInt(move);
                if (game.data.board[pos] !== null) return interaction.reply({ content: '❌ Ocupado!', ephemeral: true });
                game.data.board[pos] = userId === game.hostId ? 'X' : 'O';
                if (this.checkTicTacToeWin(game.data.board)) {
                    winner = userId === game.hostId ? 'host' : 'guest';
                    game.data.winReason = `🏆 **${interaction.user.username}** completou uma linha!`;
                } else if (!game.data.board.includes(null)) {
                    winner = 'draw';
                    game.data.winReason = `⏹️ O tabuleiro encheu!`;
                } else game.turn = userId === game.hostId ? game.guestId : game.hostId;
                updateMsg = true;
                break;

            case MINIGAMES.DADOS: {
                if (game.data.finished[userId]) return interaction.reply({ content: '⏳ Você já terminou seu turno!', ephemeral: true });
                
                // Roll 3 dice
                const d1 = Math.floor(Math.random() * 6) + 1;
                const d2 = Math.floor(Math.random() * 6) + 1;
                const d3 = Math.floor(Math.random() * 6) + 1;
                const sum = d1 + d2 + d3;
                
                // Check combos
                let multiplier = 1;
                let comboName = "";
                
                if (d1 === d2 && d2 === d3) {
                    multiplier = 3;
                    comboName = "TRINCA (3x)";
                } else if (d1 === d2 || d1 === d3 || d2 === d3) {
                    multiplier = 2;
                    comboName = "PAR (2x)";
                }
                
                const finalScore = sum * multiplier;
                game.data.scores[userId] = finalScore;
                game.data.finished[userId] = { dice: [d1, d2, d3], combo: comboName, score: finalScore };
                
                await interaction.deferUpdate();
                
                if (Object.keys(game.data.finished).length === game.players.length) {
                    // Find winner
                    let maxScore = -1;
                    let winners = [];
                    
                    for (const p of game.players) {
                        const s = game.data.scores[p.id];
                        if (s > maxScore) {
                            maxScore = s;
                            winners = [p.id];
                        } else if (s === maxScore) {
                            winners.push(p.id);
                        }
                    }
                    
                    if (winners.length === 1) {
                        winner = winners[0];
                        if (game.players.length === 2) winner = winners[0] === game.hostId ? 'host' : 'guest';
                        
                        const wName = game.players.find(p => p.id === winners[0]).username;
                        game.data.winReason = `🎲 **${wName}** venceu com **${maxScore}pts**!`;
                    } else {
                        winner = 'draw';
                        game.data.winReason = `🎲 Empate com **${maxScore}** pontos!`;
                    }
                    
                    updateMsg = true;
                } else updateMsg = true;
                break;
            }

            case MINIGAMES.MAIOR_CARTA: {
                // Blackjack Logic
                if (userId !== game.turn) return interaction.reply({ content: '⏳ Não é sua vez!', ephemeral: true });
                
                const actionType = move; // 'hit' or 'stand'
                
                if (actionType === 'hit') {
                    const card = game.data.deck.pop();
                    game.data.hands[userId].push(card);
                    
                    // Calculate Score
                    let score = 0;
                    let aces = 0;
                    for (const c of game.data.hands[userId]) {
                        score += c.weight;
                        if (c.weight === 11) aces++;
                    }
                    while (score > 21 && aces > 0) {
                        score -= 10;
                        aces--;
                    }
                    game.data.scores[userId] = score;
                    
                    if (score > 21) {
                        // Busted
                        game.data.status[userId] = 'busted';
                        game.data.lastAction = `💥 **${interaction.user.username}** estourou com ${score}!`;
                        
                        // Pass turn
                        let currentIndex = game.players.findIndex(p => p.id === userId);
                        let nextIndex = (currentIndex + 1) % game.players.length;
                        game.turn = game.players[nextIndex].id;
                    } else {
                         game.data.lastAction = `🃏 **${interaction.user.username}** pediu carta.`;
                         // Turn stays
                    }
                } else {
                    // Stand
                    game.data.status[userId] = 'stand';
                    game.data.lastAction = `🛑 **${interaction.user.username}** parou.`;
                    
                    // Pass turn
                    let currentIndex = game.players.findIndex(p => p.id === userId);
                    let nextIndex = (currentIndex + 1) % game.players.length;
                    game.turn = game.players[nextIndex].id;
                }
                
                const allFinished = game.players.every(p => ['busted', 'stand'].includes(game.data.status[p.id]));
                
                if (allFinished) {
                     // Calc winner
                     let maxScore = -1;
                     let winners = [];
                     
                     for (const p of game.players) {
                         if (game.data.status[p.id] === 'busted') continue;
                         const s = game.data.scores[p.id];
                         if (s > maxScore) {
                             maxScore = s;
                             winners = [p.id];
                         } else if (s === maxScore) {
                             winners.push(p.id);
                         }
                     }
                     
                     if (winners.length === 0) {
                         winner = 'draw';
                         game.data.winReason = `💥 Todos estouraram!`;
                     } else if (winners.length === 1) {
                         winner = winners[0];
                         if (game.players.length === 2) winner = winners[0] === game.hostId ? 'host' : 'guest';
                         const wName = game.players.find(p => p.id === winners[0]).username;
                         game.data.winReason = `🃏 **${wName}** venceu com **${maxScore}** pontos!`;
                     } else {
                         winner = 'draw';
                         game.data.winReason = `🃏 Empate com **${maxScore}** pontos!`;
                     }
                } else {
                    // Skip finished players
                    let currentTurnId = game.turn;
                    let loopCount = 0;
                    while (['busted', 'stand'].includes(game.data.status[currentTurnId]) && loopCount < game.players.length) {
                         let idx = game.players.findIndex(p => p.id === currentTurnId);
                         currentTurnId = game.players[(idx + 1) % game.players.length].id;
                         loopCount++;
                    }
                    game.turn = currentTurnId;
                    
                    await interaction.deferUpdate();
                }
                
                updateMsg = true;
                break;
            }

            case MINIGAMES.LUCKY_BUTTON: {
                // Penalties Logic
                // move = 'left', 'center', 'right'
                
                if (!game.data.choices) game.data.choices = {};
                
                if (userId === game.data.shooter) {
                    if (game.data.choices.shooter) return interaction.reply({ content: '⏳ Você já chutou!', ephemeral: true });
                    game.data.choices.shooter = move;
                } else if (userId === game.data.keeper) {
                    if (game.data.choices.keeper) return interaction.reply({ content: '⏳ Você já escolheu a defesa!', ephemeral: true });
                    game.data.choices.keeper = move;
                } else {
                    return interaction.reply({ content: '❌ Não é sua vez!', ephemeral: true });
                }
                
                await interaction.deferUpdate();
                
                // Check resolution
                if (game.data.choices.shooter && game.data.choices.keeper) {
                    const shot = game.data.choices.shooter;
                    const save = game.data.choices.keeper;
                    let result = "";
                    
                    if (shot !== save) {
                        // Goal
                        game.data.score[game.data.shooter]++;
                        result = "GOL ⚽";
                        game.data.lastAction = `⚽ **GOL!** ${game.data.shooter === game.hostId ? game.hostName : game.guestName} chutou no ${shot} e marcou!`;
                    } else {
                        // Save
                        result = "DEFESA 🧤";
                        game.data.lastAction = `🧤 **DEFESA!** ${game.data.keeper === game.hostId ? game.hostName : game.guestName} pegou no ${save}!`;
                    }
                    
                    game.data.history.push({ 
                        round: game.data.round, 
                        shooter: game.data.shooter === game.hostId ? 'Host' : 'Guest',
                        result 
                    });
                    
                    // Next Round Logic
                    // Swap roles
                    const temp = game.data.shooter;
                    game.data.shooter = game.data.keeper;
                    game.data.keeper = temp;
                    game.data.choices = {}; // Reset choices
                    
                    // Increment round every 2 kicks (1 full round)
                    // Actually standard penalties: 5 kicks each.
                    // If round > 10 (5 each), end.
                    // Let's count "kicks" as round.
                    
                    game.data.round++;
                    
                    if (game.data.round > 6) { // 3 kicks each for faster game (Best of 3)
                        const s1 = game.data.score[game.hostId];
                        const s2 = game.data.score[game.guestId];
                        
                        game.data.winReason = `⚽ Placar Final: **${game.hostName}** ${s1} x ${s2} **${game.guestName}**`;
                        
                        if (s1 > s2) winner = 'host';
                        else if (s2 > s1) winner = 'guest';
                        else winner = 'draw';
                    }
                    
                    updateMsg = true;
                } else {
                    updateMsg = true;
                }
                break;
            }

            case MINIGAMES.PAR_IMPAR:
                if (game.data.choices[userId]) return interaction.reply({ content: '⏳ Já escolheu!', ephemeral: true });
                game.data.choices[userId] = parseInt(move);
                await interaction.deferUpdate();
                if (game.data.choices[game.hostId] && game.data.choices[game.guestId]) {
                    const hChoice = game.data.choices[game.hostId];
                    const gChoice = game.data.choices[game.guestId];
                    const sum = hChoice + gChoice;
                    const isPar = sum % 2 === 0;
                    winner = isPar ? 'host' : 'guest';
                    game.data.winReason = `🔢 **${game.hostName}** (${hChoice}) + **${game.guestName}** (${gChoice}) = **${sum}** (${isPar ? 'PAR' : 'ÍMPAR'})!`;
                    updateMsg = true;
                } else updateMsg = true;
                break;

            case MINIGAMES.MATH:
                if (game.data.eliminated?.includes(userId)) return interaction.reply({ content: '❌ Você já foi eliminado!', ephemeral: true });
                const selected = parseInt(move);
                if (selected === game.data.answer) {
                    winner = userId;
                    if (game.players.length === 2) winner = userId === game.hostId ? 'host' : 'guest';
                    
                    game.data.winReason = `🧮 **${interaction.user.username}** acertou a resposta **${game.data.answer}**!`;
                } else {
                    if (game.players.length === 2) {
                        winner = userId === game.hostId ? 'guest' : 'host';
                        game.data.winReason = `🧮 **${interaction.user.username}** errou! A resposta era **${game.data.answer}**.`;
                    } else {
                         // Elimination
                        game.data.eliminated = game.data.eliminated || [];
                        game.data.eliminated.push(userId);
                        
                        const alive = game.players.filter(p => !game.data.eliminated.includes(p.id));
                        
                        if (alive.length === 1) {
                            winner = alive[0].id;
                            game.data.winReason = `🏆 **${alive[0].username}** venceu (Sobrevivente da Matemática)!`;
                        } else {
                            game.data.lastAction = `🧮 **${interaction.user.username}** errou e foi eliminado!`;
                            await interaction.deferUpdate();
                        }
                    }
                }
                updateMsg = true;
                break;

            case MINIGAMES.HOT_POTATO:
                if (userId !== game.turn) return interaction.reply({ content: '⏳ A bomba não está com você!', ephemeral: true });
                
                game.data.fuse--;
                
                if (game.data.fuse <= 0) {
                    // Explodiu!
                    if (game.players.length === 2) {
                        winner = userId === game.hostId ? 'guest' : 'host';
                        const loserName = userId === game.hostId ? game.hostName : game.guestName;
                        game.data.lastAction = `💥 **BOMBA!** Explodiu na mão de **${interaction.user.username}**!`;
                        game.data.winReason = `💥 A bomba explodiu na mão de **${loserName}**!`;
                        updateMsg = true;
                    } else {
                         // Elimination
                        game.data.eliminated = game.data.eliminated || [];
                        game.data.eliminated.push(userId);
                        
                        const alive = game.players.filter(p => !game.data.eliminated.includes(p.id));
                        
                        if (alive.length === 1) {
                            winner = alive[0].id;
                            game.data.lastAction = `💥 **${interaction.user.username}** explodiu! **${alive[0].username}** venceu!`;
                            game.data.winReason = `🏆 **${alive[0].username}** venceu (Sobrevivente da Batata Quente)!`;
                        } else {
                             game.data.lastAction = `💥 **BOMBA!** Explodiu na mão de **${interaction.user.username}**! (Eliminado)`;
                             // Reset fuse for next round
                             game.data.fuse = Math.floor(Math.random() * 11) + 5;
                             
                             // Pass to next alive
                             let currentIndex = game.players.findIndex(p => p.id === userId);
                             let foundNext = false;
                             let loopCount = 0;
                             while (!foundNext && loopCount < game.players.length) {
                                 currentIndex = (currentIndex + 1) % game.players.length;
                                 if (!game.data.eliminated.includes(game.players[currentIndex].id)) {
                                     game.turn = game.players[currentIndex].id;
                                     foundNext = true;
                                 }
                                 loopCount++;
                             }
                             await interaction.deferUpdate();
                        }
                        updateMsg = true;
                    }
                } else {
                    // Passou!
                    if (game.players.length === 2) {
                        game.turn = userId === game.hostId ? game.guestId : game.hostId;
                    } else {
                         // Pass to next alive
                         game.data.eliminated = game.data.eliminated || [];
                         let currentIndex = game.players.findIndex(p => p.id === userId);
                         let foundNext = false;
                         let loopCount = 0;
                         while (!foundNext && loopCount < game.players.length) {
                             currentIndex = (currentIndex + 1) % game.players.length;
                             if (!game.data.eliminated.includes(game.players[currentIndex].id)) {
                                 game.turn = game.players[currentIndex].id;
                                 foundNext = true;
                             }
                             loopCount++;
                         }
                    }
                    
                    const nextName = game.players.find(p => p.id === game.turn)?.username || 'Alguém';
                    game.data.lastAction = `😰 **PASSOU!** A bomba agora está com **${nextName}**!`;
                    await interaction.deferUpdate();
                    updateMsg = true;
                }
                break;

            case MINIGAMES.ROLETA_RUSSA:
                if (userId !== game.turn) return interaction.reply({ content: '⏳ Não é sua vez!', ephemeral: true });
                if (game.data.currentPosition === game.data.bulletPosition) {
                    if (game.players.length === 2) {
                        winner = userId === game.hostId ? 'guest' : 'host';
                        const loserName = interaction.user.username;
                        game.data.lastAction = `💥 **BANG!** A arma disparou em **${loserName}**!`;
                        game.data.winReason = `💥 A arma disparou na vez de **${loserName}**!`;
                        updateMsg = true;
                    } else {
                        // Elimination
                        game.data.eliminated = game.data.eliminated || [];
                        game.data.eliminated.push(userId);
                         
                        const alive = game.players.filter(p => !game.data.eliminated.includes(p.id));
                        
                        if (alive.length === 1) {
                            winner = alive[0].id;
                            game.data.lastAction = `💥 **BANG!** **${interaction.user.username}** morreu! **${alive[0].username}** venceu!`;
                            game.data.winReason = `🏆 **${alive[0].username}** venceu (Sobrevivente da Roleta)!`;
                        } else {
                            game.data.lastAction = `💥 **BANG!** **${interaction.user.username}** foi eliminado! Recarregando...`;
                            
                            // Reload logic for remaining players
                            game.data.bullets = 6;
                            game.data.bulletPosition = Math.floor(Math.random() * 6);
                            game.data.currentPosition = 0;

                             // Pass to next alive
                             let currentIndex = game.players.findIndex(p => p.id === userId);
                             let foundNext = false;
                             let loopCount = 0;
                             while (!foundNext && loopCount < game.players.length) {
                                 currentIndex = (currentIndex + 1) % game.players.length;
                                 if (!game.data.eliminated.includes(game.players[currentIndex].id)) {
                                     game.turn = game.players[currentIndex].id;
                                     foundNext = true;
                                 }
                                 loopCount++;
                             }
                             await interaction.deferUpdate();
                        }
                        updateMsg = true;
                    }
                } else {
                    game.data.currentPosition++;
                    if (game.players.length === 2) {
                        game.turn = userId === game.hostId ? game.guestId : game.hostId;
                    } else {
                         // Pass to next alive
                         game.data.eliminated = game.data.eliminated || [];
                         let currentIndex = game.players.findIndex(p => p.id === userId);
                         let foundNext = false;
                         let loopCount = 0;
                         while (!foundNext && loopCount < game.players.length) {
                             currentIndex = (currentIndex + 1) % game.players.length;
                             if (!game.data.eliminated.includes(game.players[currentIndex].id)) {
                                 game.turn = game.players[currentIndex].id;
                                 foundNext = true;
                             }
                             loopCount++;
                         }
                    }
                    game.data.lastAction = `😰 **CLICK**... Nada aconteceu. O tambor gira...`;
                    await interaction.deferUpdate();
                    updateMsg = true;
                }
                break;

            case MINIGAMES.TREASURE_HUNT:
                if (userId !== game.turn) return interaction.reply({ content: '⏳ Não é sua vez!', ephemeral: true });
                const idx = parseInt(move);
                const item = game.data.grid[idx];
                
                game.data.revealed[idx] = item; // Revelar item

                if (item === 'B') {
                    // Bomba! Explodiu -> Perdeu
                    if (game.players.length === 2) {
                        winner = userId === game.hostId ? 'guest' : 'host';
                        game.data.lastAction = `💥 **BOMBA!** **${interaction.user.username}** encontrou uma armadilha!`;
                        game.data.winReason = `💥 **${interaction.user.username}** escolheu a posição **${idx + 1}** e explodiu numa armadilha!`;
                    } else {
                        // Multi-player elimination
                        game.data.eliminated = game.data.eliminated || [];
                        game.data.eliminated.push(userId);
                        
                        const alive = game.players.filter(p => !game.data.eliminated.includes(p.id));
                        
                        if (alive.length === 1) {
                            winner = alive[0].id; // The last survivor wins
                            game.data.lastAction = `💥 **${interaction.user.username}** explodiu! **${alive[0].username}** venceu!`;
                            game.data.winReason = `🏆 **${alive[0].username}** venceu por eliminação!`;
                        } else {
                            game.data.lastAction = `💥 **BOMBA!** **${interaction.user.username}** foi eliminado!`;
                            
                            // Pass turn
                            let currentIndex = game.players.findIndex(p => p.id === userId);
                            let foundNext = false;
                            let loopCount = 0;
                            while (!foundNext && loopCount < game.players.length) {
                                currentIndex = (currentIndex + 1) % game.players.length;
                                if (!game.data.eliminated.includes(game.players[currentIndex].id)) {
                                    game.turn = game.players[currentIndex].id;
                                    foundNext = true;
                                }
                                loopCount++;
                            }
                            await interaction.deferUpdate();
                        }
                    }
                    updateMsg = true;
                } else if (item === 'T') {
                    // Tesouro! Ganhou
                    winner = userId;
                    if (game.players.length === 2) {
                         winner = userId === game.hostId ? 'host' : 'guest';
                    }
                    game.data.lastAction = `💎 **TESOURO!** **${interaction.user.username}** encontrou o prêmio!`;
                    game.data.winReason = `💎 **${interaction.user.username}** escolheu a posição **${idx + 1}** e encontrou o tesouro!`;
                    updateMsg = true;
                } else {
                    // Vazio -> Passa vez
                    if (game.players.length === 2) {
                        game.turn = userId === game.hostId ? game.guestId : game.hostId;
                    } else {
                        game.data.eliminated = game.data.eliminated || [];
                        let currentIndex = game.players.findIndex(p => p.id === userId);
                        let foundNext = false;
                        let loopCount = 0;
                        while (!foundNext && loopCount < game.players.length) {
                            currentIndex = (currentIndex + 1) % game.players.length;
                            if (!game.data.eliminated.includes(game.players[currentIndex].id)) {
                                game.turn = game.players[currentIndex].id;
                                foundNext = true;
                            }
                            loopCount++;
                        }
                    }
                    
                    game.data.lastAction = `💨 **${interaction.user.username}** encontrou **VAZIO**... a busca continua!`;
                    await interaction.deferUpdate();
                    updateMsg = true;
                }
                break;

            case MINIGAMES.BOMBA:
                if (userId !== game.turn) return interaction.reply({ content: '⏳ Não é sua vez!', ephemeral: true });
                const wireIdx = parseInt(move);
                const result = game.data.actions[wireIdx];
                game.data.wiresState[wireIdx] = result;
                
                if (result === 'lose') {
                    // Explodiu!
                    if (game.players.length === 2) {
                        winner = userId === game.hostId ? 'guest' : 'host';
                        game.data.lastAction = `💥 **KABOOM!** **${interaction.user.username}** cortou o fio errado!`;
                        game.data.winReason = `💥 **${interaction.user.username}** cortou o fio **${['Vermelho', 'Azul', 'Verde'][wireIdx]}** e a bomba explodiu!`;
                        updateMsg = true;
                    } else {
                        // Elimination
                        game.data.eliminated = game.data.eliminated || [];
                        game.data.eliminated.push(userId);
                        
                        const alive = game.players.filter(p => !game.data.eliminated.includes(p.id));
                        
                        if (alive.length === 1) {
                            winner = alive[0].id;
                            game.data.lastAction = `💥 **${interaction.user.username}** explodiu! **${alive[0].username}** venceu!`;
                            game.data.winReason = `🏆 **${alive[0].username}** venceu (Sobrevivente da Bomba)!`;
                        } else {
                            game.data.lastAction = `💥 **KABOOM!** **${interaction.user.username}** foi eliminado!`;
                            // Reset wire? Maybe not, just continue with remaining wires if any.
                            // But there are only 3 wires!
                            // If 4 players and 3 wires... 
                            // If one explodes, we MUST reset the bomb for others.
                            
                            // Reset bomb
                            game.data.wiresState = [null, null, null];
                            const actions = ['win', 'lose', 'neutral'];
                            game.data.actions = actions.sort(() => Math.random() - 0.5);
                            
                            // Pass turn
                            let currentIndex = game.players.findIndex(p => p.id === userId);
                            let foundNext = false;
                            let loopCount = 0;
                            while (!foundNext && loopCount < game.players.length) {
                                currentIndex = (currentIndex + 1) % game.players.length;
                                if (!game.data.eliminated.includes(game.players[currentIndex].id)) {
                                    game.turn = game.players[currentIndex].id;
                                    foundNext = true;
                                }
                                loopCount++;
                            }
                            await interaction.deferUpdate();
                        }
                        updateMsg = true;
                    }
                }
                else if (result === 'win') {
                    // Desarmou = Venceu
                    winner = userId;
                    if (game.players.length === 2) winner = userId === game.hostId ? 'host' : 'guest';
                    
                    game.data.lastAction = `✂️ **DESARMADA!** **${interaction.user.username}** salvou o dia!`;
                    game.data.winReason = `✂️ **${interaction.user.username}** cortou o fio **${['Vermelho', 'Azul', 'Verde'][wireIdx]}** e desarmou a bomba!`;
                    updateMsg = true;
                }
                else {
                    // Neutro
                    game.data.lastAction = `✂️ **FIO SEGURO!** **${interaction.user.username}** suou frio, mas nada aconteceu.`;
                    
                    if (game.players.length === 2) {
                        game.turn = userId === game.hostId ? game.guestId : game.hostId;
                    } else {
                         let currentIndex = game.players.findIndex(p => p.id === userId);
                         let foundNext = false;
                         let loopCount = 0;
                         while (!foundNext && loopCount < game.players.length) {
                             currentIndex = (currentIndex + 1) % game.players.length;
                             if (!game.data.eliminated?.includes(game.players[currentIndex].id)) {
                                 game.turn = game.players[currentIndex].id;
                                 foundNext = true;
                             }
                             loopCount++;
                         }
                    }
                    await interaction.deferUpdate();
                    updateMsg = true;
                }
                break;

            case MINIGAMES.GLADIATOR:
                // 2 Players Only
                if (userId !== game.turn) return interaction.reply({ content: '⏳ Não é sua vez!', ephemeral: true });
                const opponentId = userId === game.hostId ? game.guestId : game.hostId;
                let actionMsg = '';
                
                if (move === 'atk') {
                    let dmg = Math.floor(Math.random() * 16) + 15; // 15-30
                    if (game.data.shield[opponentId]) {
                        dmg = Math.floor(dmg / 2);
                        game.data.shield[opponentId] = false;
                        actionMsg = `⚔️ Atacou! (Escudo reduziu para **${dmg}** de dano)`;
                    } else {
                        actionMsg = `⚔️ Atacou e causou **${dmg}** de dano!`;
                    }
                    game.data.hp[opponentId] -= dmg;
                } else if (move === 'def') {
                    game.data.shield[userId] = true;
                    actionMsg = `🛡️ Levantou o escudo! (Próximo dano reduzido)`;
                } else if (move === 'heal') {
                    const heal = Math.floor(Math.random() * 11) + 10; // 10-20
                    game.data.hp[userId] = Math.min(100, game.data.hp[userId] + heal);
                    actionMsg = `🩹 Curou **${heal}** de vida!`;
                }

                if (game.data.hp[opponentId] <= 0) {
                    winner = userId === game.hostId ? 'host' : 'guest';
                    game.data.lastAction = actionMsg + " E venceu a batalha!";
                    game.data.winReason = `⚔️ **${interaction.user.username}** derrotou o oponente no campo de batalha!`;
                    updateMsg = true;
                } else {
                    game.turn = opponentId;
                    game.data.lastAction = actionMsg;
                    await interaction.deferUpdate();
                }
                updateMsg = true;
                break;

            case MINIGAMES.CUP:
                if (userId !== game.turn) return interaction.reply({ content: '⏳ Não é sua vez!', ephemeral: true });
                const amount = parseInt(move);
                game.data.waterLevel += amount;
                
                if (game.data.waterLevel > game.data.maxCapacity) {
                    if (game.players.length === 2) {
                        winner = userId === game.hostId ? 'guest' : 'host';
                        game.data.lastAction = `💧 **TRANSBORDOU!** **${interaction.user.username}** derramou a água!`;
                        game.data.winReason = `💧 O copo transbordou com **${game.data.waterLevel}ml** na vez de **${interaction.user.username}**!`;
                        updateMsg = true;
                    } else {
                        // Elimination
                        game.data.eliminated = game.data.eliminated || [];
                        game.data.eliminated.push(userId);
                        
                        const alive = game.players.filter(p => !game.data.eliminated.includes(p.id));
                        
                        if (alive.length === 1) {
                            winner = alive[0].id;
                            game.data.lastAction = `💧 **${interaction.user.username}** derramou! **${alive[0].username}** venceu!`;
                            game.data.winReason = `🏆 **${alive[0].username}** venceu (Sobrevivente do Copo)!`;
                        } else {
                            game.data.lastAction = `💧 **TRANSBORDOU!** **${interaction.user.username}** foi eliminado!`;
                            // Reset Cup
                            game.data.waterLevel = 0;
                            
                            // Pass turn
                            let currentIndex = game.players.findIndex(p => p.id === userId);
                            let foundNext = false;
                            let loopCount = 0;
                            while (!foundNext && loopCount < game.players.length) {
                                currentIndex = (currentIndex + 1) % game.players.length;
                                if (!game.data.eliminated.includes(game.players[currentIndex].id)) {
                                    game.turn = game.players[currentIndex].id;
                                    foundNext = true;
                                }
                                loopCount++;
                            }
                            await interaction.deferUpdate();
                        }
                        updateMsg = true;
                    }
                } else {
                    game.data.lastAction = `💧 **${interaction.user.username}** adicionou **${amount}ml**. O copo tem **${game.data.waterLevel}ml**.`;
                    
                    // Pass turn
                    if (game.players.length === 2) {
                        game.turn = userId === game.hostId ? game.guestId : game.hostId;
                    } else {
                        let currentIndex = game.players.findIndex(p => p.id === userId);
                        let foundNext = false;
                        let loopCount = 0;
                        while (!foundNext && loopCount < game.players.length) {
                            currentIndex = (currentIndex + 1) % game.players.length;
                            if (!game.data.eliminated?.includes(game.players[currentIndex].id)) {
                                game.turn = game.players[currentIndex].id;
                                foundNext = true;
                            }
                            loopCount++;
                        }
                    }
                    await interaction.deferUpdate();
                    updateMsg = true;
                }
                break;

            case MINIGAMES.TOWER: {
                if (userId !== game.turn) return interaction.reply({ content: '⏳ Não é sua vez!', ephemeral: true });
                const riskBase = { 'top': 5, 'mid': 15, 'base': 30 };
                const riskAdd = game.data.blocksRemoved * 2;
                const risk = riskBase[move] + riskAdd;
                
                const roll = Math.floor(Math.random() * 100);
                if (roll < risk) {
                    if (game.players.length === 2) {
                        winner = userId === game.hostId ? 'guest' : 'host';
                        game.data.lastAction = `🏗️ **DESMORONOU!** A torre caiu na vez de **${interaction.user.username}**!`;
                        game.data.winReason = `🏗️ A torre desmoronou quando **${interaction.user.username}** tentou remover do **${move === 'base' ? 'BASE' : (move === 'mid' ? 'MEIO' : 'TOPO')}**!`;
                        updateMsg = true;
                    } else {
                         // Elimination
                        game.data.eliminated = game.data.eliminated || [];
                        game.data.eliminated.push(userId);
                        
                        const alive = game.players.filter(p => !game.data.eliminated.includes(p.id));
                        
                        if (alive.length === 1) {
                            winner = alive[0].id;
                            game.data.lastAction = `🏗️ **${interaction.user.username}** derrubou a torre! **${alive[0].username}** venceu!`;
                            game.data.winReason = `🏆 **${alive[0].username}** venceu (Sobrevivente da Torre)!`;
                        } else {
                            game.data.lastAction = `🏗️ **DESMORONOU!** **${interaction.user.username}** foi eliminado!`;
                            // Reset Tower
                            game.data.blocksRemoved = 0;
                            
                            // Pass turn
                            let currentIndex = game.players.findIndex(p => p.id === userId);
                            let foundNext = false;
                            let loopCount = 0;
                            while (!foundNext && loopCount < game.players.length) {
                                currentIndex = (currentIndex + 1) % game.players.length;
                                if (!game.data.eliminated.includes(game.players[currentIndex].id)) {
                                    game.turn = game.players[currentIndex].id;
                                    foundNext = true;
                                }
                                loopCount++;
                            }
                            await interaction.deferUpdate();
                        }
                        updateMsg = true;
                    }
                } else {
                    game.data.blocksRemoved++;
                    game.data.lastAction = `🏗️ **${interaction.user.username}** removeu do **${move}** com sucesso! (Risco era ${risk}%)`;
                    
                    // Pass turn
                    if (game.players.length === 2) {
                        game.turn = userId === game.hostId ? game.guestId : game.hostId;
                    } else {
                        let currentIndex = game.players.findIndex(p => p.id === userId);
                        let foundNext = false;
                        let loopCount = 0;
                        while (!foundNext && loopCount < game.players.length) {
                            currentIndex = (currentIndex + 1) % game.players.length;
                            if (!game.data.eliminated?.includes(game.players[currentIndex].id)) {
                                game.turn = game.players[currentIndex].id;
                                foundNext = true;
                            }
                            loopCount++;
                        }
                    }
                    await interaction.deferUpdate();
                    updateMsg = true;
                }
                break;
            }

            case MINIGAMES.ELEMENTS:
                if (game.data.choices[userId]) return interaction.reply({ content: '⏳ Já escolheu!', ephemeral: true });
                game.data.choices[userId] = move;
                await interaction.deferUpdate();
                
                if (game.data.choices[game.hostId] && game.data.choices[game.guestId]) {
                    const h = game.data.choices[game.hostId];
                    const g = game.data.choices[game.guestId];
                    
                    if (h !== g) {
                        if (
                            (h === 'fire' && g === 'plant') ||
                            (h === 'plant' && g === 'water') ||
                            (h === 'water' && g === 'fire')
                        ) {
                            game.data.score[game.hostId]++;
                            game.data.lastAction = `🔥 **${game.hostName}** (${h}) venceu **${game.guestName}** (${g})!`;
                        } else {
                            game.data.score[game.guestId]++;
                            game.data.lastAction = `🔥 **${game.guestName}** (${g}) venceu **${game.hostName}** (${h})!`;
                        }
                    } else {
                        game.data.lastAction = `🔥 **EMPATE!** Ambos escolheram **${h}**.`;
                    }
                    
                    if (game.data.score[game.hostId] >= 2) {
                        winner = 'host';
                        game.data.winReason = `🔥 **${game.hostName}** venceu a melhor de 3!`;
                    }
                    else if (game.data.score[game.guestId] >= 2) {
                        winner = 'guest';
                        game.data.winReason = `🔥 **${game.guestName}** venceu a melhor de 3!`;
                    }
                    else {
                        game.data.choices = {};
                        updateMsg = true;
                    }
                } else updateMsg = true;
                break;

            case MINIGAMES.RACE:
                if (userId !== game.turn) return interaction.reply({ content: '⏳ Não é sua vez!', ephemeral: true });
                let dist = 0;
                let msg = '';
                
                if (move === 'sprint') {
                    if (Math.random() < 0.3) {
                        msg = '😫 Tropeçou ao tentar correr! (0m)';
                    } else {
                        dist = Math.floor(Math.random() * 16) + 15;
                        msg = `⚡ Correu muito! (+${dist}m)`;
                    }
                } else {
                    dist = Math.floor(Math.random() * 6) + 5;
                    msg = `🚶 Caminhada segura. (+${dist}m)`;
                }
                
                game.data.position[userId] += dist;
                
                if (game.data.position[userId] >= game.data.finishLine) {
                    winner = userId;
                    if (game.players.length === 2) winner = userId === game.hostId ? 'host' : 'guest';
                    game.data.lastAction = `🏁 **CHEGADA!** **${interaction.user.username}** cruzou a linha final!`;
                    game.data.winReason = `🏁 **${interaction.user.username}** venceu a corrida com **${game.data.position[userId]}m**!`;
                    updateMsg = true;
                } else {
                    // Pass turn
                    if (game.players.length === 2) {
                        game.turn = userId === game.hostId ? game.guestId : game.hostId;
                    } else {
                        let currentIndex = game.players.findIndex(p => p.id === userId);
                        let nextIndex = (currentIndex + 1) % game.players.length;
                        game.turn = game.players[nextIndex].id;
                    }
                    game.data.lastAction = `🏎️ **${interaction.user.username}:** ${msg}`;
                    await interaction.deferUpdate();
                    updateMsg = true;
                }
                break;

            case MINIGAMES.BUCKSHOT:
                // DEBUG LOG
                console.log(`[BUCKSHOT] Move: ${move}, User: ${interaction.user.username}, Turn: ${game.turn}`);

                if (userId !== game.turn) return interaction.reply({ content: '⏳ Não é sua vez!', ephemeral: true });
                
                // Validate HP data integrity
                if (!game.data.hp) game.data.hp = {};
                for (const p of game.players) {
                    if (typeof game.data.hp[p.id] === 'undefined') game.data.hp[p.id] = 4;
                }

                // Safety check for empty magazine
                if (game.data.magazine.length === 0) {
                    console.log('[BUCKSHOT] Magazine empty before pop, reloading...');
                    this.loadBuckshot(game);
                }

                const bullet = game.data.magazine.pop();
                console.log(`[BUCKSHOT] Bullet popped: ${bullet}. Remaining: ${game.data.magazine.length}`);

                if (bullet === 'live') game.data.knownCount.live--;
                else game.data.knownCount.blank--;
                
                let actionDesc = "";
                let nextTurnUser = null; 
                
                // Identify target
                let targetId = null;
                if (move === 'self') targetId = userId;
                else if (move === 'opp') {
                    // Backwards compatibility for 2 players
                    // For 3+ players, we need to find an opponent (not self)
                    if (game.players.length === 2) {
                        targetId = userId === game.hostId ? game.guestId : game.hostId;
                    } else {
                        // For 3+ players, find a random alive opponent (not self)
                        const opponents = game.players.filter(p => p.id !== userId && game.data.hp[p.id] > 0);
                        if (opponents.length > 0) {
                            const randomOpp = opponents[Math.floor(Math.random() * opponents.length)];
                            targetId = randomOpp.id;
                        }
                    }
                } else if (move.startsWith('shoot_')) {
                    targetId = move.replace('shoot_', '');
                }

                if (!targetId) return interaction.reply({ content: '❌ Alvo inválido!', ephemeral: true });

                const targetName = game.players.find(p => p.id === targetId)?.username || 'Desconhecido';

                if (targetId === userId) {
                    // Self shot
                    if (bullet === 'live') {
                        game.data.hp[userId]--;
                        actionDesc = `💥 **${interaction.user.username}** atirou em SI MESMO... era **REAL**! (-1 Vida)`;
                        // Next turn unless dead
                    } else {
                        actionDesc = `😰 **${interaction.user.username}** atirou em SI MESMO... era **FESTIM**! (Turno Extra)`;
                        nextTurnUser = userId; // Extra turn
                    }
                } else {
                    // Shoot opponent
                    if (bullet === 'live') {
                        game.data.hp[targetId]--;
                        actionDesc = `💥 **${interaction.user.username}** atirou em **${targetName}**... era **REAL**! (-1 Vida)`;
                    } else {
                        actionDesc = `💨 **${interaction.user.username}** atirou em **${targetName}**... era **FESTIM**!`;
                    }
                }
                
                // Check Eliminations
                const alivePlayers = game.players.filter(p => game.data.hp[p.id] > 0);
                console.log(`[BUCKSHOT] Alive: ${alivePlayers.length}, HP: ${JSON.stringify(game.data.hp)}`);

                if (alivePlayers.length <= 1) {
                    // Game Over
                    if (alivePlayers.length === 1) {
                        const winnerObj = alivePlayers[0];
                        if (game.players.length === 2) {
                            winner = winnerObj.id === game.hostId ? 'host' : 'guest';
                        } else {
                            // Pass the winner ID directly
                            winner = winnerObj.id; 
                        }
                        game.data.winReason = `🏆 **${winnerObj.username}** é o único sobrevivente!`;
                    } else {
                        // Everyone died (rare/impossible if 1 bullet kills 1 person at a time, but theoretically possible with items later)
                        winner = 'draw';
                        game.data.winReason = `💀 Todos morreram!`;
                    }
                } else {
                    // Game continues
                    // Determine next turn
                    if (!nextTurnUser) {
                        // Find current player index
                        let currentIndex = game.players.findIndex(p => p.id === game.turn);
                        let foundNext = false;
                        let loopCount = 0;
                        
                        // Rotate until finding alive player
                        while (!foundNext && loopCount < game.players.length) {
                            currentIndex = (currentIndex + 1) % game.players.length;
                            const p = game.players[currentIndex];
                            if (game.data.hp[p.id] > 0) {
                                nextTurnUser = p.id;
                                foundNext = true;
                            }
                            loopCount++;
                        }
                    }
                    
                    game.turn = nextTurnUser;
                    game.data.lastAction = actionDesc;
                    
                    // Reload if empty
                    if (game.data.magazine.length === 0) {
                        this.loadBuckshot(game);
                        game.data.lastAction = actionDesc + "\n\n" + game.data.lastAction;
                    }
                    
                    await interaction.deferUpdate();
                    updateMsg = true;
                }
                break;

        }

        if (winner) {
            await this.endGame(interaction, game, winner);
        } else if (updateMsg) {
            if (interaction.replied || interaction.deferred) {
                await this.renderGame(interaction, game, false, true);
            } else {
                await this.renderGame(interaction, game, false, false);
            }
            
            // Se a IA está no jogo, tentar fazer o movimento dela
            if (game.guestId === 'AI') {
                this.aiMove(interaction, game);
            }
        }
    },

    async renderGame(interaction, game, isNew = false, forceEdit = false) {
        // console.log(`[DEBUG] renderGame called for ${game.gameType} | isNew: ${isNew} | forceEdit: ${forceEdit} | replied: ${interaction.replied} | deferred: ${interaction.deferred}`);
        const info = MINIGAME_INFO[game.gameType];
        const embed = new EmbedBuilder()
            .setColor(colors.default)
            .setTitle(`${info.emoji} ${info.name}`)
            .setDescription(`🎮 **${game.hostName}** vs **${game.guestName}**\n💰 **Valendo:** ${game.bet > 0 ? game.bet : 'Nada'}`);

        let components = [];

        try {
            switch (game.gameType) {
            case MINIGAMES.TIC_TAC_TOE:
                embed.setDescription(embed.data.description + `\n\n👇 **Vez de:** ${game.turn === game.hostId ? game.hostName : game.guestName}`);
                for (let i = 0; i < 3; i++) {
                    const row = new ActionRowBuilder();
                    for (let j = 0; j < 3; j++) {
                        const idx = i * 3 + j;
                        const cell = game.data.board[idx];
                        const btn = new ButtonBuilder()
                            .setCustomId(`duelo_play_${idx}`)
                            .setStyle(cell ? (cell === 'X' ? ButtonStyle.Primary : ButtonStyle.Danger) : ButtonStyle.Secondary)
                            .setLabel(cell || '➖')
                            .setDisabled(!!cell);
                        row.addComponents(btn);
                    }
                    components.push(row);
                }
                break;

            case MINIGAMES.DADOS:
                let diceDesc = embed.data.description + '\n\n';
                let allFinishedDice = true;
                
                for (const p of game.players) {
                    const dData = game.data.finished[p.id];
                    diceDesc += `🎲 **${p.username}:** ${dData ? `[${dData.dice.join(', ')}] - **${dData.combo}** (${dData.score} pts)` : 'Aguardando...'}\n`;
                    if (!dData) allFinishedDice = false;
                }
                embed.setDescription(diceDesc);

                if (!allFinishedDice) {
                     components.push(new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('duelo_play_roll').setLabel('Rolar Dados').setStyle(ButtonStyle.Primary).setEmoji('🎲')
                    ));
                }
                break;

            case MINIGAMES.PAR_IMPAR:
                embed.setDescription(embed.data.description + `\n\n🔢 **${game.hostName}** é PAR | **${game.guestName}** é ÍMPAR\nEscolham um número de 1 a 5:`);
                embed.addFields(
                    { name: game.hostName, value: game.data.choices[game.hostId] ? '✅ Escolheu' : '🤔 Pensando...', inline: true },
                    { name: game.guestName, value: game.data.choices[game.guestId] ? '✅ Escolheu' : '🤔 Pensando...', inline: true }
                );
                const rowPI = new ActionRowBuilder();
                for (let i = 1; i <= 5; i++) {
                    rowPI.addComponents(new ButtonBuilder().setCustomId(`duelo_play_${i}`).setLabel(`${i}`).setStyle(ButtonStyle.Secondary));
                }
                components.push(rowPI);
                break;

            case MINIGAMES.MATH:
                embed.setDescription(embed.data.description + `\n\n🧮 **Quanto é ${game.data.question}?**\nQuem responder primeiro ganha!`);
                const rowMath = new ActionRowBuilder();
                game.data.options.forEach(opt => {
                    rowMath.addComponents(new ButtonBuilder().setCustomId(`duelo_play_${opt}`).setLabel(`${opt}`).setStyle(ButtonStyle.Primary));
                });
                components.push(rowMath);
                break;

            case MINIGAMES.HOT_POTATO:
                const turnNameHP = game.players.find(p => p.id === game.turn)?.username || 'Desconhecido';
                embed.setDescription(embed.data.description + `\n\n💣 **A BOMBA ESTÁ COM:** ${turnNameHP}\n\n**PASSE LOGO!**`);
                components.push(new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('duelo_play_pass').setLabel('PASSAR A BOMBA 🧨').setStyle(ButtonStyle.Danger)
                ));
                break;

            case MINIGAMES.ROLETA_RUSSA:
                const turnNameRR = game.players.find(p => p.id === game.turn)?.username || 'Desconhecido';
                embed.setDescription(embed.data.description + `\n\n🔫 **Vez de:** ${turnNameRR}\nO tambor gira...`);
                components.push(new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('duelo_play_shoot').setLabel('Puxar Gatilho').setStyle(ButtonStyle.Danger).setEmoji('🔫')
                ));
                break;

            case MINIGAMES.TREASURE_HUNT:
                const turnNameTH = game.players.find(p => p.id === game.turn)?.username || 'Desconhecido';
                embed.setDescription(embed.data.description + `\n\n💎 **Vez de:** ${turnNameTH}\nEncontre o tesouro! Cuidado com as bombas.`);
                for (let i = 0; i < 3; i++) {
                    const row = new ActionRowBuilder();
                    for (let j = 0; j < 3; j++) {
                        const idx = i * 3 + j;
                        const revealed = game.data.revealed[idx];
                        
                        let label = '📦';
                        let style = ButtonStyle.Secondary;
                        let disabled = false;
                        
                        if (revealed) {
                            disabled = true;
                            if (revealed === 'E') { label = '💨'; style = ButtonStyle.Secondary; }
                            else if (revealed === 'B') { label = '💣'; style = ButtonStyle.Danger; }
                            else if (revealed === 'T') { label = '💎'; style = ButtonStyle.Success; }
                        }

                        row.addComponents(new ButtonBuilder()
                            .setCustomId(`duelo_play_${idx}`)
                            .setStyle(style)
                            .setLabel(label)
                            .setDisabled(disabled));
                    }
                    components.push(row);
                }
                break;

            case MINIGAMES.BOMBA:
                const turnNameB = game.players.find(p => p.id === game.turn)?.username || 'Desconhecido';
                embed.setDescription(embed.data.description + `\n\n💣 **Vez de:** ${turnNameB}\nCorte um fio! Um desarma (vence), um explode (perde), um é neutro.`);
                const rowBomb = new ActionRowBuilder();
                ['Vermelho', 'Azul', 'Verde'].forEach((color, idx) => {
                    const state = game.data.wiresState[idx];
                    let style = ButtonStyle.Secondary;
                    let label = color;
                    let disabled = false;
                    if (state) {
                        disabled = true;
                        label = state === 'neutral' ? 'Cortado (Nada)' : (state === 'win' ? 'DESARMOU!' : 'EXPLODIU!');
                        style = state === 'neutral' ? ButtonStyle.Secondary : (state === 'win' ? ButtonStyle.Success : ButtonStyle.Danger);
                    }
                    rowBomb.addComponents(new ButtonBuilder().setCustomId(`duelo_play_${idx}`).setLabel(label).setStyle(style).setDisabled(disabled));
                });
                components.push(rowBomb);
                break;

            case MINIGAMES.MAIOR_CARTA:
                let bjDesc = embed.data.description + '\n\n';
                const turnNameBJ = game.players.find(p => p.id === game.turn)?.username || 'Desconhecido';
                
                for (const p of game.players) {
                    const hand = game.data.hands[p.id].map(c => c.display).join(' ');
                    const score = game.data.scores[p.id];
                    const status = game.data.status[p.id];
                    
                    let statusText = '';
                    if (status === 'busted') statusText = '💥 ESTOUROU!';
                    else if (status === 'stand') statusText = '🛑 Parou';
                    
                    bjDesc += `🃏 **${p.username}:** ${hand} (**${score}**) ${statusText}\n`;
                }
                
                bjDesc += `\n👉 **Vez de:** ${turnNameBJ}`;
                embed.setDescription(bjDesc);

                components.push(new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('duelo_play_hit').setLabel('Pedir Carta').setStyle(ButtonStyle.Success).setEmoji('🃏'),
                    new ButtonBuilder().setCustomId('duelo_play_stand').setLabel('Parar').setStyle(ButtonStyle.Danger).setEmoji('🛑')
                ));
                break;

            case MINIGAMES.LUCKY_BUTTON:
                const shooterName = game.data.shooter === game.hostId ? game.hostName : game.guestName;
                const keeperName = game.data.keeper === game.hostId ? game.hostName : game.guestName;
                
                const lastEvents = game.data.history.slice(-3).map(h => `R${Math.ceil(h.round/2)} (${h.shooter}): ${h.result}`).join('\n');

                embed.setDescription(embed.data.description + `\n\n` +
                    `⚽ **Placar:** ${game.hostName} **${game.data.score[game.hostId]}** x **${game.data.score[game.guestId]}** ${game.guestName}\n` +
                    `🔄 **Rodada:** ${Math.ceil(game.data.round / 2)} (Chute ${game.data.round})\n` +
                    `👟 **Chutador:** ${shooterName}\n` +
                    `🧤 **Goleiro:** ${keeperName}\n` +
                    (lastEvents ? `\n📜 **Histórico:**\n${lastEvents}` : '')
                );

                const sStatus = game.data.choices.shooter ? '✅ Pronto' : '🤔 Escolhendo...';
                const kStatus = game.data.choices.keeper ? '✅ Pronto' : '🤔 Escolhendo...';
                
                embed.setDescription(embed.data.description + `\n\n` +
                    `👟 **Status Chute:** ${sStatus}\n` +
                    `🧤 **Status Defesa:** ${kStatus}`);

                if (!game.data.choices.shooter || !game.data.choices.keeper) {
                    components.push(new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('duelo_play_left').setLabel('Esquerda').setStyle(ButtonStyle.Secondary).setEmoji('⬅️'),
                        new ButtonBuilder().setCustomId('duelo_play_center').setLabel('Meio').setStyle(ButtonStyle.Secondary).setEmoji('⬆️'),
                        new ButtonBuilder().setCustomId('duelo_play_right').setLabel('Direita').setStyle(ButtonStyle.Secondary).setEmoji('➡️')
                    ));
                }
                break;

            case MINIGAMES.GLADIATOR:
                embed.setDescription(embed.data.description + `\n\n` +
                    `⚔️ **${game.hostName}** HP: ${game.data.hp[game.hostId]} ${game.data.shield[game.hostId] ? '🛡️' : ''}\n` +
                    `⚔️ **${game.guestName}** HP: ${game.data.hp[game.guestId]} ${game.data.shield[game.guestId] ? '🛡️' : ''}\n\n` +
                    `👉 **Vez de:** ${game.turn === game.hostId ? game.hostName : game.guestName}`);
                components.push(new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('duelo_play_atk').setLabel('Atacar').setStyle(ButtonStyle.Danger).setEmoji('⚔️'),
                    new ButtonBuilder().setCustomId('duelo_play_def').setLabel('Defender').setStyle(ButtonStyle.Secondary).setEmoji('🛡️'),
                    new ButtonBuilder().setCustomId('duelo_play_heal').setLabel('Curar').setStyle(ButtonStyle.Success).setEmoji('🩹')
                ));
                break;

            case MINIGAMES.CUP:
                const turnNameCup = game.players.find(p => p.id === game.turn)?.username || 'Desconhecido';
                embed.setDescription(embed.data.description + `\n\n` +
                    `🥛 **Copo:** ${game.data.waterLevel}ml\n` +
                    `⚠️ **Capacidade:** ??? (80-120ml)\n\n` +
                    `👉 **Vez de:** ${turnNameCup}`);
                components.push(new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('duelo_play_10').setLabel('+10ml').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('duelo_play_20').setLabel('+20ml').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('duelo_play_30').setLabel('+30ml').setStyle(ButtonStyle.Danger)
                ));
                break;

            case MINIGAMES.TOWER:
                const turnNameTower = game.players.find(p => p.id === game.turn)?.username || 'Desconhecido';
                embed.setDescription(embed.data.description + `\n\n` +
                    `🏗️ **Blocos Removidos:** ${game.data.blocksRemoved}\n` +
                    `💥 **Risco Atual (aprox):** ${game.data.blocksRemoved * 2}%\n\n` +
                    `👉 **Vez de:** ${turnNameTower}`);
                components.push(new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('duelo_play_top').setLabel('Topo (Seguro)').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('duelo_play_mid').setLabel('Meio (Normal)').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('duelo_play_base').setLabel('Base (Arriscado)').setStyle(ButtonStyle.Danger)
                ));
                break;

            case MINIGAMES.ELEMENTS:
                embed.setDescription(embed.data.description + `\n\n` +
                    `🏆 **Placar:** ${game.hostName} ${game.data.score[game.hostId]} x ${game.data.score[game.guestId]} ${game.guestName}\n\n` +
                    `Escolham seus elementos!`);
                components.push(new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('duelo_play_fire').setLabel('Fogo').setStyle(ButtonStyle.Danger).setEmoji('🔥'),
                    new ButtonBuilder().setCustomId('duelo_play_water').setLabel('Água').setStyle(ButtonStyle.Primary).setEmoji('💧'),
                    new ButtonBuilder().setCustomId('duelo_play_plant').setLabel('Planta').setStyle(ButtonStyle.Success).setEmoji('🌿')
                ));
                break;

            case MINIGAMES.RACE:
                const trackLen = 15;
                const getPos = (pos) => Math.min(Math.floor((pos / game.data.finishLine) * trackLen), trackLen);
                const trackColors = ['🟦', '🟥', '🟩', '🟨'];
                
                let raceDesc = embed.data.description + `\n\n🏁 **Chegada: ${game.data.finishLine}m**\n`;
                
                game.players.forEach((p, idx) => {
                    const pos = getPos(game.data.position[p.id]);
                    const color = trackColors[idx % trackColors.length];
                    const track = color.repeat(pos) + '🏇' + '⬜'.repeat(Math.max(0, trackLen - pos));
                    raceDesc += `${p.username}: ${track} (**${game.data.position[p.id]}m**)\n`;
                });
                
                const turnNameRace = game.players.find(p => p.id === game.turn)?.username || 'Desconhecido';
                raceDesc += `\n👉 **Vez de:** ${turnNameRace}`;
                embed.setDescription(raceDesc);
                    
                components.push(new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('duelo_play_walk').setLabel('Caminhar (Seguro)').setStyle(ButtonStyle.Primary).setEmoji('🚶'),
                    new ButtonBuilder().setCustomId('duelo_play_sprint').setLabel('Sprint (Arriscado)').setStyle(ButtonStyle.Danger).setEmoji('⚡')
                ));
                break;

            case MINIGAMES.SCRAMBLED_WORDS:
                const hint = game.data.category ? `\n💡 **Dica:** ${game.data.category}` : '';
                embed.setDescription(embed.data.description + `\n\n🔠 **A palavra é:** \` ${game.data.scrambled.toUpperCase()} \`${hint}\n\n✍️ **Escreva a resposta correta no chat!**\n*(Primeiro a acertar vence!)*`);
                
                if (!game.collector && interaction.channel) {
                    const filter = m => !m.author.bot && game.players.some(p => p.id === m.author.id);
                    const collector = interaction.channel.createMessageCollector({ filter });
                    
                    collector.on('collect', async m => {
                        // Verificar se o jogo ainda está ativo
                        if (!activeGames.has(interaction.message.id)) {
                             collector.stop();
                             return;
                        }

                        if (m.content.toLowerCase() === game.data.original.toLowerCase()) {
                            collector.stop('won');
                            const winnerId = m.author.id;
                            
                            game.data.winReason = `🔠 **${m.author.username}** acertou a palavra **${game.data.original.toUpperCase()}**!`;
                            
                            // Mock Interaction para finalizar
                            const mockInteraction = {
                                user: m.author,
                                message: interaction.message,
                                guild: m.guild,
                                channel: m.channel,
                                reply: async (opts) => m.reply(opts),
                                deferUpdate: async () => {},
                                update: async (payload) => {
                                    try { await interaction.message.edit(payload); } catch(e){}
                                },
                                replied: true,
                                deferred: true
                            };
                            
                            // Tenta apagar a mensagem da resposta correta para ficar limpo
                            try { await m.delete(); } catch(e){}
                            
                            await this.endGame(mockInteraction, game, winnerId);
                        }
                    });
                    
                    game.collector = collector;
                }
                break;

            case MINIGAMES.BUCKSHOT:
                const liveCount = game.data.knownCount.live;
                const blankCount = game.data.knownCount.blank;
                
                // Representação visual da vida
                const getHpBar = (hp) => '❤️'.repeat(Math.max(0, hp)) + '🖤'.repeat(Math.max(0, 4 - hp));
                
                let hpList = "";
                for (const p of game.players) {
                    const isDead = game.data.hp[p.id] <= 0;
                    hpList += `❤️ **${p.username}:** ${isDead ? '💀 Eliminado' : getHpBar(game.data.hp[p.id])}\n`;
                }

                const currentTurnName = game.players.find(p => p.id === game.turn)?.username || 'Desconhecido';

                embed.setDescription(embed.data.description + `\n\n` +
                    hpList + `\n` +
                    `🔫 **Munição:** ${liveCount}x 🔴 (Real) | ${blankCount}x 🔵 (Festim)\n` +
                    `👉 **Vez de:** ${currentTurnName}`
                );
                
                const rowBuck = new ActionRowBuilder();
                
                // Self Shoot Button
                rowBuck.addComponents(new ButtonBuilder().setCustomId('duelo_play_self').setLabel('Atirar em Si Mesmo').setStyle(ButtonStyle.Success).setEmoji('👤'));

                // Opponent Buttons
                if (game.players.length === 2) {
                     rowBuck.addComponents(new ButtonBuilder().setCustomId('duelo_play_opp').setLabel('Atirar no Oponente').setStyle(ButtonStyle.Danger).setEmoji('🔫'));
                } else {
                    // Multi-player: Shoot specific opponents
                    const me = game.turn; // Only relevant for the player whose turn it is, but we render for everyone.
                    // Discord buttons are static for everyone seeing the message.
                    // We need to show buttons for ALL potential targets.
                    // But if I click "Shoot Player A", and I AM Player A, that's self shoot?
                    // No, the buttons are "Shoot [Name]".
                    // If I am Player A, I shouldn't see "Shoot Player A" (or it should be disabled/self).
                    // But everyone sees the same buttons.
                    // So we add "Shoot [Name]" for everyone.
                    // If I click "Shoot [MyName]", handle as invalid or self? 
                    // Let's just filter out the button for the current turn player? No, buttons are global.
                    // So we add buttons for all players.
                    // Wait, if there are 4 players, 1 self button + 4 target buttons = 5 buttons (max).
                    // Actually, "Self" is redundant if we have "Shoot [MyName]".
                    // But "Shoot Self" has special logic (extra turn on blank).
                    // So we keep "Shoot Self".
                    // Then we add "Shoot [Name]" for everyone else?
                    // If A is playing, buttons: Self, Shoot B, Shoot C, Shoot D.
                    // If B is playing, buttons: Self, Shoot A, Shoot C, Shoot D.
                    // We can't change buttons dynamically per user view.
                    // So we must show buttons that work for the current turn player.
                    // So we render buttons based on `game.turn`.
                    // "Shoot B", "Shoot C", "Shoot D" (if Turn is A).
                    
                    const turnPlayer = game.players.find(p => p.id === game.turn);
                    const opponents = game.players.filter(p => p.id !== game.turn && game.data.hp[p.id] > 0);
                    
                    for (const opp of opponents) {
                        rowBuck.addComponents(new ButtonBuilder()
                            .setCustomId(`duelo_play_shoot_${opp.id}`)
                            .setLabel(`Atirar em ${opp.username}`)
                            .setStyle(ButtonStyle.Danger)
                            .setEmoji('🔫')
                        );
                    }
                }
                
                components.push(rowBuck);
                break;

        }

        } catch (err) {
            console.error(`[ERROR] Erro ao construir componentes do jogo ${game.gameType}:`, err);
            embed.setDescription(embed.data.description + '\n\n❌ **Erro ao renderizar o jogo.** Tente novamente.');
        }

        if (game.data.lastAction) {
             embed.setDescription(embed.data.description + `\n\n📢 ${game.data.lastAction}`);
        }

        const payload = { embeds: [embed], components };
        
        try {
            // Usa o método safeUpdate para garantir que a mensagem seja atualizada corretamente
            // independente do estado da interação (deferred, replied, ou nova)
            await this.safeUpdate(interaction, payload);
        } catch (error) {
            console.error('[CRITICAL] Erro no renderGame (Update/Edit):', error);
            try { 
                if (interaction.message) await interaction.message.edit(payload); 
            } catch (e) {
                console.error('[CRITICAL] Falha final ao editar mensagem:', e);
            }
        }
    },

    async endGame(interaction, game, winner) {
        if (!activeGames.has(interaction.message.id)) return;

        if (game.collector) {
            game.collector.stop();
            game.collector = null; // Prevent re-stop
        }

        let winnerId, winnerName, loserName;
        
        if (winner === 'host') {
            winnerId = game.hostId;
            winnerName = game.hostName;
            loserName = game.guestName;
        } else if (winner === 'guest') {
            winnerId = game.guestId;
            winnerName = game.guestName;
            loserName = game.hostName;
        } else if (winner !== 'draw') {
            // Winner is an ID (for >2 players)
            winnerId = winner;
            const w = game.players.find(p => p.id === winnerId);
            winnerName = w ? w.username : 'Vencedor';
            
            if (game.players.length === 2) {
                 const l = game.players.find(p => p.id !== winnerId);
                 loserName = l ? l.username : 'Oponente';
            } else {
                 loserName = 'os outros';
            }
        }

        // Recuperar motivo da vitória (se houver)
        const reason = game.data.winReason ? `\n${game.data.winReason}\n` : '';

        if (winner === 'draw') {
             if (game.bet > 0) {
                 // Refund all players
                 for (const p of game.players) {
                     const u = await db.getUser(p.id);
                     u.wallet += game.bet;
                     await u.save();
                 }
             }
        } else {
            // Pagamento
            if (game.bet > 0) {
                const totalPot = game.bet * game.players.length;
                const tax = Math.floor(totalPot * 0.05); // 5% tax
                const prize = totalPot - tax;
                
                const w = await db.getUser(winnerId);
                w.wallet += prize;
                await w.save();
                
                if (tax > 0) await db.addToVault(tax);

                // --- MISSÕES ---
                try {
                    const missionSystem = require('../../systems/missionSystem');
                    await missionSystem.checkMission(winnerId, 'gamble_win', 1, interaction);
                } catch (err) {
                    console.error('Erro ao atualizar missão de duelo:', err);
                }
            } else {
                // AMISTOSO (Aposta 0) - Ganha Honra (Apenas contra jogadores reais)
                if (winnerId !== 'AI' && game.guestId !== 'AI') {
                    try {
                        const w = await db.getUser(winnerId);
                        w.honor = (w.honor || 0) + 1;
                        await db.updateUser(winnerId, { honor: w.honor });
                    } catch (e) {
                        console.error('Erro ao dar honra:', e);
                    }
                }
            }

            // --- MISSÃO: PAR IMPAR WIN ---
            if (game.gameType === 'par_impar') {
                try {
                    const missionSystem = require('../../systems/missionSystem');
                    await missionSystem.checkMission(winnerId, 'par_impar_win', 1, interaction);
                } catch (e) {}
            }
        }

        const embed = new EmbedBuilder()
            .setColor(winner === 'draw' ? (colors.warning || '#F1C40F') : colors.success)
            .setTitle(winner === 'draw' ? '⚖️ Empate!' : `🏆 Vencedor: ${winnerName}`)
            .setDescription(`**Jogo:** ${MINIGAME_INFO[game.gameType].name}\n\n` +
                (winner === 'draw' ? `⚖️ **EMPATE!** Ninguém ganhou.${reason}` : `🎉 **${winnerName}** venceu${loserName ? ` **${loserName}**` : ''}!${reason}\n💰 **Prêmio:** ${game.bet > 0 ? (game.bet * game.players.length) : 'Honra'}`))
            .setTimestamp();

        // --- LÓGICA DE REVANCHE ---
        game.status = 'ended';
        
        // Verificar limite de revanche contra IA (apenas 1 vez)
        if (game.guestId === 'AI' && game.rematchCount >= 1) {
             activeGames.delete(interaction.message.id);
             
             if (interaction.replied || interaction.deferred) {
                await interaction.message.edit({ embeds: [embed], components: [] });
            } else {
                await interaction.update({ embeds: [embed], components: [] });
            }
            return;
        }

        game.rematch = {};
        game.players.forEach(p => game.rematch[p.id] = false);
        
        // Se for contra IA, auto-aceita
        if (game.guestId === 'AI') game.rematch['AI'] = true;

        // Dobrar aposta apenas para 1v1. Para grupos, mantém a mesma para evitar falência rápida.
        const nextBet = (game.players.length === 2) ? (game.bet * 2) : game.bet;
        
        // Calcular aceitos iniciais (ex: AI)
        const acceptedCount = game.players.filter(p => game.rematch[p.id]).length;
        const totalPlayers = game.players.length;

        const rematchBtn = new ButtonBuilder()
            .setCustomId('duelo_rematch')
            .setLabel(`Revanche (${acceptedCount}/${totalPlayers})${nextBet > 0 ? ` [${nextBet}]` : ''}`)
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔄');

        const row = new ActionRowBuilder().addComponents(rematchBtn);

        // activeGames.delete(interaction.message.id); // Removido para permitir revanche
        
        // Timeout de limpeza (60s)
        setTimeout(() => {
            if (activeGames.has(interaction.message.id)) {
                const g = activeGames.get(interaction.message.id);
                if (g.status === 'ended') {
                    activeGames.delete(interaction.message.id);
                }
            }
        }, 60000);

        if (interaction.replied || interaction.deferred) {
            await interaction.message.edit({ embeds: [embed], components: [row] });
        } else {
            await interaction.update({ embeds: [embed], components: [row] });
        }
    },

    async safeUpdate(interaction, payload) {
        try {
            if (interaction.replied || interaction.deferred) {
                try {
                    await interaction.editReply(payload);
                } catch (e) {
                    if (interaction.message) await interaction.message.edit(payload);
                }
            } else {
                try {
                    await interaction.update(payload);
                } catch (e) {
                    if (interaction.message) await interaction.message.edit(payload);
                }
            }
        } catch (error) {
            console.error('Erro ao atualizar mensagem (safeUpdate):', error);
        }
    },

    loadBuckshot(game) {
        // 2 a 8 balas
        const total = Math.floor(Math.random() * 7) + 2; 
        
        // Distribuição (pelo menos 1 de cada)
        // Evitar que seja tudo de um tipo só (embora a lógica acima permita 1 live e X blank, ok)
        // Vamos garantir equilíbrio relativo? Não, aleatório é divertido.
        
        let live = Math.max(1, Math.floor(Math.random() * total));
        if (live === total) live--; // Pelo menos 1 blank
        const blank = total - live;
        
        const magazine = [];
        for(let i=0; i<live; i++) magazine.push('live');
        for(let i=0; i<blank; i++) magazine.push('blank');
        
        // Shuffle
        for (let i = magazine.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [magazine[i], magazine[j]] = [magazine[j], magazine[i]];
        }
        
        game.data.magazine = magazine;
        game.data.knownCount = { live, blank };
        
        // Se for recarga durante o jogo, avisar
        const msg = `🔫 **ARMA CARREGADA!**\n🔴 **${live}** Reais\n🔵 **${blank}** Festim`;
        if (game.data.lastAction) game.data.lastAction = msg;
        else game.data.lastAction = msg; // Inicialização
    },

    checkTicTacToeWin(board) {
        const lines = [
            [0,1,2], [3,4,5], [6,7,8],
            [0,3,6], [1,4,7], [2,5,8],
            [0,4,8], [2,4,6]
        ];
        for (let line of lines) {
            const [a,b,c] = line;
            if (board[a] && board[a] === board[b] && board[a] === board[c]) return true;
        }
        return false;
    }
};