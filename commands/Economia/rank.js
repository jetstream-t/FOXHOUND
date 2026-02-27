const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { User } = require('../../database');
const colors = require('../../colors.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rank')
        .setDescription('Veja os usuários mais ricos do servidor ou globalmente')
        .addStringOption(option =>
            option.setName('tipo')
                .setDescription('Escolha entre ranking Global ou Local (Servidor)')
                .setRequired(true)
                .addChoices(
                    { name: '🌍 Global', value: 'global' },
                    { name: '🏠 Local (Servidor)', value: 'local' }
                )
        ),

    async execute(interaction) {
        await interaction.deferReply();
        
        const tipo = interaction.options.getString('tipo');
        let topUsers = [];
        let title = '';
        let description = '';
        let memberIds = [];

        try {
            if (tipo === 'global') {
                title = '🌍 Ranking Global dos Mais Ricos';
                description = 'Top 10 bilionários de todo o sistema FoxHound!';
                
                // Agregação para somar carteira + banco e ordenar
                topUsers = await User.aggregate([
                    {
                        $match: {
                            hideFromRank: { $ne: true }
                        }
                    },
                    { 
                        $addFields: { 
                            netWorth: { $add: ["$wallet", "$bank"] } 
                        } 
                    },
                    { $sort: { netWorth: -1 } },
                    { $limit: 10 }
                ]);

            } else {
                title = `🏠 Ranking Local: ${interaction.guild.name}`;
                description = 'Top 10 magnatas deste servidor!';

                // Buscar todos os membros do servidor para filtrar
                // Nota: Em servidores muito grandes, isso pode ser lento, mas é necessário para filtro local
                // sem armazenar guildId no UserSchema (que é global).
                // OTIMIZAÇÃO: Fetch apenas uma vez e reusa os IDs
                const guildMembers = await interaction.guild.members.fetch();
                memberIds = guildMembers.map(m => m.id);

                topUsers = await User.aggregate([
                    { 
                        $match: { 
                            userId: { $in: memberIds },
                            hideFromRank: { $ne: true }
                        } 
                    },
                    { 
                        $addFields: { 
                            netWorth: { $add: ["$wallet", "$bank"] } 
                        } 
                    },
                    { $sort: { netWorth: -1 } },
                    { $limit: 10 }
                ]);
            }

            if (topUsers.length === 0) {
                return interaction.editReply({ 
                    content: '❌ Nenhum usuário encontrado no ranking.' 
                });
            }

            // Calcular a posição do usuário
            let userRank = 'N/A';
            const targetUser = await User.findOne({ userId: interaction.user.id });
            const userNetWorth = targetUser ? (targetUser.wallet + targetUser.bank) : 0;
            
            // Se o usuário estiver oculto, não mostra a posição
            if (targetUser && targetUser.hideFromRank) {
                userRank = 'Oculto';
            } else {
                if (tipo === 'global') {
                    const rankCount = await User.countDocuments({ 
                        hideFromRank: { $ne: true },
                        $expr: { $gt: [ { $add: ["$wallet", "$bank"] }, userNetWorth ] } 
                    });
                    userRank = rankCount + 1;
                } else {
                    // Para local, já temos memberIds preenchido acima
                    const rankCount = await User.countDocuments({ 
                        userId: { $in: memberIds },
                        hideFromRank: { $ne: true },
                        $expr: { $gt: [ { $add: ["$wallet", "$bank"] }, userNetWorth ] } 
                    });
                    userRank = rankCount + 1;
                }
            }

            // Formatar a lista
            let rankString = '';
            
            // Buscar usuários no Discord para pegar nomes atualizados se possível
            // Para global, pode ser que alguns não estejam no cache, então usamos o ID ou tentamos fetch
            
            for (let i = 0; i < topUsers.length; i++) {
                const userDoc = topUsers[i];
                let medal = '';
                
                if (i === 0) medal = '🥇';
                else if (i === 1) medal = '🥈';
                else if (i === 2) medal = '🥉';
                else medal = `**#${i + 1}**`;

                // Tentar pegar nome do usuário
                let userName = userDoc.userId;
                try {
                    // Tenta pegar do cache primeiro, depois fetch
                    const userInGuild = interaction.guild.members.cache.get(userDoc.userId);
                    if (userInGuild) {
                        userName = userInGuild.user.username;
                    } else {
                        const discordUser = await interaction.client.users.fetch(userDoc.userId).catch(() => null);
                        if (discordUser) userName = discordUser.username;
                    }
                } catch (e) {
                    userName = `ID: ${userDoc.userId}`;
                }

                let totalMoney = userDoc.netWorth.toLocaleString('pt-BR');
                
                // Destacar o usuário se for ele
                if (userDoc.userId === interaction.user.id) {
                    rankString += `👉 ${medal} **${userName}**\n💰 Total: **${totalMoney}**\n\n`;
                } else {
                    rankString += `${medal} **${userName}**\n💰 Total: **${totalMoney}**\n\n`;
                }
            }

            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(description + '\n\n' + rankString)
                .setColor(colors.gold || '#FFD700')
                .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
                .setFooter({ 
                    text: `Sua posição: #${userRank} • Patrimônio: ${userNetWorth.toLocaleString('pt-BR')}`, 
                    iconURL: interaction.user.displayAvatarURL() 
                })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Erro no comando rank:', error);
            await interaction.editReply({ 
                content: '❌ Ocorreu um erro ao gerar o ranking. Tente novamente mais tarde.' 
            });
        }
    },

    async executePrefix(message, args) {
        const tipo = args[0] && args[0].toLowerCase() === 'local' ? 'local' : 'global';
        let topUsers = [];
        let title = '';
        let description = '';
        let memberIds = [];

        try {
            if (tipo === 'global') {
                title = '🌍 Ranking Global dos Mais Ricos';
                description = 'Top 10 bilionários de todo o sistema FoxHound!';
                
                topUsers = await User.aggregate([
                    {
                        $match: {
                            hideFromRank: { $ne: true }
                        }
                    },
                    { 
                        $addFields: { 
                            netWorth: { $add: ["$wallet", "$bank"] } 
                        } 
                    },
                    { $sort: { netWorth: -1 } },
                    { $limit: 10 }
                ]);

            } else {
                title = `🏠 Ranking Local: ${message.guild.name}`;
                description = 'Top 10 magnatas deste servidor!';

                const guildMembers = await message.guild.members.fetch();
                memberIds = guildMembers.map(m => m.id);

                topUsers = await User.aggregate([
                    { 
                        $match: { 
                            userId: { $in: memberIds },
                            hideFromRank: { $ne: true }
                        } 
                    },
                    { 
                        $addFields: { 
                            netWorth: { $add: ["$wallet", "$bank"] } 
                        } 
                    },
                    { $sort: { netWorth: -1 } },
                    { $limit: 10 }
                ]);
            }

            if (topUsers.length === 0) {
                return message.reply('❌ Nenhum usuário encontrado no ranking.');
            }

            // Calcular a posição do usuário
            let userRank = 'N/A';
            const targetUser = await User.findOne({ userId: message.author.id });
            const userNetWorth = targetUser ? (targetUser.wallet + targetUser.bank) : 0;

            if (targetUser && targetUser.hideFromRank) {
                userRank = 'Oculto';
            } else {
                if (tipo === 'global') {
                    const rankCount = await User.countDocuments({ 
                        hideFromRank: { $ne: true },
                        $expr: { $gt: [ { $add: ["$wallet", "$bank"] }, userNetWorth ] } 
                    });
                    userRank = rankCount + 1;
                } else {
                    const rankCount = await User.countDocuments({ 
                        userId: { $in: memberIds },
                        hideFromRank: { $ne: true },
                        $expr: { $gt: [ { $add: ["$wallet", "$bank"] }, userNetWorth ] } 
                    });
                    userRank = rankCount + 1;
                }
            }

            let rankString = '';
            
            for (let i = 0; i < topUsers.length; i++) {
                const userDoc = topUsers[i];
                let medal = '';
                
                if (i === 0) medal = '🥇';
                else if (i === 1) medal = '🥈';
                else if (i === 2) medal = '🥉';
                else medal = `**#${i + 1}**`;

                let userName = userDoc.userId;
                try {
                     const userInGuild = message.guild.members.cache.get(userDoc.userId);
                     if (userInGuild) {
                         userName = userInGuild.user.username;
                     } else {
                        const discordUser = await message.client.users.fetch(userDoc.userId).catch(() => null);
                        if (discordUser) userName = discordUser.username;
                     }
                } catch (e) {
                    userName = `ID: ${userDoc.userId}`;
                }

                let totalMoney = userDoc.netWorth.toLocaleString('pt-BR');

                if (userDoc.userId === message.author.id) {
                    rankString += `👉 ${medal} **${userName}**\n💰 Total: **${totalMoney}**\n\n`;
                } else {
                    rankString += `${medal} **${userName}**\n💰 Total: **${totalMoney}**\n\n`;
                }
            }

            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(description + '\n\n' + rankString)
                .setColor(colors.gold || '#FFD700') // Fallback gold
                .setThumbnail(message.guild.iconURL({ dynamic: true }))
                .setFooter({ 
                    text: `Sua posição: #${userRank} • Patrimônio: ${userNetWorth.toLocaleString('pt-BR')}`,
                    iconURL: message.author.displayAvatarURL() 
                })
                .setTimestamp();

            await message.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Erro no comando rank (prefix):', error);
            await message.reply('❌ Ocorreu um erro ao gerar o ranking. Tente novamente mais tarde.');
        }
    }
};
