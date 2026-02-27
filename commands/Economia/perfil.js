const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { User, Pet } = require('../../database');
const colors = require('../../colors.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('perfil')
        .setDescription('Exibe o perfil econômico e tático de um usuário.')
        .addUserOption(option => 
            option.setName('usuario')
                .setDescription('O usuário para ver o perfil (opcional)')
                .setRequired(false)),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('usuario') || interaction.user;
        const isSelf = targetUser.id === interaction.user.id;

        // Buscar dados do usuário alvo
        const userDoc = await User.findOne({ userId: targetUser.id });

        if (!userDoc) {
            return interaction.reply({
                content: `❌ **${targetUser.username}** ainda não possui um registro na FOXHOUND.`,
                flags: 64
            });
        }

        // Verificar se quem está executando o comando tem um celular (necessário para ver saldo detalhado)
        const executorDoc = isSelf ? userDoc : await User.findOne({ userId: interaction.user.id });

        // Determinar Status
        let status = 'Cidadão';
        let statusEmoji = '🟢';
        const now = Date.now();

        if (userDoc.wantedUntil > now) {
            const remaining = userDoc.wantedUntil - now;
            const hours = Math.floor(remaining / (1000 * 60 * 60));
            const minutes = Math.floor((remaining % (1000 * 60 * 60)) / 60000);
            status = `PROCURADO (${hours}h ${minutes}m)`;
            statusEmoji = '🔴';
        } else if (userDoc.workPenalty > 0) {
            status = `DETENTO (${userDoc.workPenalty} trabalhos)`;
            statusEmoji = '⛓️';
        } else if (userDoc.loan && userDoc.loan.status === 'overdue') {
            status = `CALOTEIRO`;
            statusEmoji = '🚫';
        } else if (userDoc.suspiciousUntil > now) {
            const remaining = userDoc.suspiciousUntil - now;
            const minutes = Math.floor(remaining / 60000);
            status = `SUSPEITO (${minutes}m)`;
            statusEmoji = '🟠';
        }

        // Formatar Saldo
        let saldoDisplay = '🔒 **Dados Protegidos**\n*Use `f!espiar` ou adquira um Terminal Portátil para acessar*';
        
        // Verifica se o executor tem o terminal
        const hasTerminal = executorDoc.hasPortableTerminal || (executorDoc.inventory && executorDoc.inventory.get('terminal_portatil') > 0);

        if (isSelf || hasTerminal) {
            const wallet = userDoc.wallet.toLocaleString('pt-BR');
            const bank = userDoc.bank.toLocaleString('pt-BR');
            const netWorth = (userDoc.wallet + userDoc.bank).toLocaleString('pt-BR');
            saldoDisplay = `👛 Carteira: **${wallet}**\n🏦 Banco: **${bank}**\n💰 Total: **${netWorth}**`;
        }

        // Pet Ativo
        let petDisplay = 'Nenhum companheiro ativo';
        if (userDoc.activePetId) {
            const pet = await Pet.findOne({ id: userDoc.activePetId });
            if (pet) {
                const rarityEmojis = {
                    'comum': '⚪',
                    'incomum': '🟢',
                    'raro': '🔵',
                    'exclusivo': '✨'
                };
                petDisplay = `${rarityEmojis[pet.rarity] || '🐾'} **${pet.name}** (Lvl ${pet.level})`;
            }
        }

        // Emprego Atual
        const jobs = {
            "desempregado": "Desempregado",
            "ajudante": "Ajudante Geral",
            "faxineiro": "Faxineiro",
            "entregador": "Entregador",
            "repositor": "Repositor",
            "atendente": "Atendente",
            "caixa": "Caixa",
            "motoboy": "Motoboy",
            "estoquista": "Estoquista",
            "assistente": "Assistente Adm.",
            "tecnico": "Técnico",
            "supervisor": "Supervisor",
            "gerente": "Gerente",
            "empresario": "Empresário",
            "investidor": "Investidor",
            "ceo": "Diretor Executivo (CEO)",
            "magnata": "Magnata",
            "bilionario": "Bilionário"
        };
        const jobTitle = jobs[userDoc.jobId] || 'Desconhecido';

        // Histórico de Compras (Últimas 3)
        let historyDisplay = 'Nenhuma compra recente.';
        if (userDoc.purchaseHistory && userDoc.purchaseHistory.length > 0) {
            const sortedHistory = [...userDoc.purchaseHistory].sort((a, b) => b.date - a.date).slice(0, 3);
            
            historyDisplay = sortedHistory.map(purchase => {
                const date = new Date(purchase.date).toLocaleDateString('pt-BR');
                return `• ${purchase.item} (-${purchase.price.toLocaleString('pt-BR')}) em ${date}`;
            }).join('\n');
        }

        // Informações Úteis Adicionais
        const streak = userDoc.dailyStreak || 0;
        const honor = userDoc.honor || 0;
        const lotteryWins = userDoc.lotteryWins || 0;
        const creditScore = userDoc.creditScore || 500;
        
        // Itens Especiais (Relógio de Ouro / Terminal)
        let specialInfo = "";
        
        // Relógio de Ouro (Tempo de Jogo)
        if (userDoc.inventory && userDoc.inventory.get('relogio_bolso') > 0) {
            let joinDate = null;
            if (interaction.guild) {
                try {
                    const member = await interaction.guild.members.fetch(targetUser.id);
                    joinDate = member.joinedAt;
                } catch (e) {}
            }
            if (!joinDate) joinDate = targetUser.createdAt;

            const timeDiff = now - joinDate.getTime();
            const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
            specialInfo += `\n⌚ **Tempo de Serviço:** ${days} dias`;

            const workCd = 30 * 60 * 1000;
            const workPenalty = (userDoc.workPenalty || 0) * 60 * 1000;
            const lastWork = userDoc.lastWork || 0;
            const nextWork = lastWork + workCd + workPenalty;
            
            if (now < nextWork) {
                const remaining = nextWork - now;
                const m = Math.floor(remaining / 60000);
                const s = Math.floor((remaining % 60000) / 1000);
                specialInfo += `\n👷 **Próximo Trabalho:** ${m}m ${s}s`;
            } else {
                specialInfo += `\n👷 **Próximo Trabalho:** Disponível`;
            }

            if (userDoc.suspiciousUntil > now) {
                 const remaining = userDoc.suspiciousUntil - now;
                 const m = Math.floor(remaining / 60000);
                 specialInfo += `\n🕵️ **Roubo (Suspeito):** ${m}m`;
            } else if (userDoc.wantedUntil > now) {
                 const remaining = userDoc.wantedUntil - now;
                 const m = Math.floor(remaining / 60000);
                 specialInfo += `\n🚨 **Roubo (Procurado):** ${m}m`;
            } else {
                 specialInfo += `\n🔫 **Roubo:** Disponível`;
            }
        }

        // Terminal Portátil (Badge)
        if (userDoc.hasPortableTerminal || (userDoc.inventory && userDoc.inventory.get('terminal_portatil') > 0)) {
             specialInfo += `\n📱 **Terminal Portátil:** Acesso Remoto Habilitado`;
        }

        // Criar Embed
        const embed = new EmbedBuilder()
            .setColor(colors.default)
            .setTitle(`📂 Dossiê: ${targetUser.username}`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: `${statusEmoji} Status Legal`, value: `**${status}**`, inline: true },
                { name: '💼 Ocupação', value: `**${jobTitle}**`, inline: true },
                { name: '🔥 Sequência Diária', value: `**${streak} dias**`, inline: true },
                { name: '🎖️ Honra', value: `**${honor} vitórias**`, inline: true },
                { name: '🎫 Vitórias na Loteria', value: `**${lotteryWins}**`, inline: true },
                { name: '📊 Score de Crédito', value: `**${creditScore}**`, inline: true },
                { name: '📊 Finanças', value: saldoDisplay, inline: false },
                { name: '🐶 Companheiro Tático', value: petDisplay, inline: false },
                { name: '🛒 Últimas Aquisições', value: historyDisplay, inline: false }
            );

        if (specialInfo) {
            embed.addFields({ name: '🌟 Equipamento Especial', value: specialInfo, inline: false });
        }

        embed.setFooter({ text: `FOXHOUND Database • ID: ${targetUser.id}` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },

    async executePrefix(message, args) {
        const targetUser = message.mentions.users.first() || message.author;
        const isSelf = targetUser.id === message.author.id;

        const userDoc = await User.findOne({ userId: targetUser.id });

        if (!userDoc) {
            return message.reply(`❌ **${targetUser.username}** ainda não possui um registro na FOXHOUND.`);
        }

        const executorDoc = isSelf ? userDoc : await User.findOne({ userId: message.author.id });

        let status = 'Cidadão';
        let statusEmoji = '🟢';
        const now = Date.now();

        if (userDoc.wantedUntil > now) {
            status = 'PROCURADO';
            statusEmoji = '🔴';
        } else if (userDoc.suspiciousUntil > now) {
            status = 'SUSPEITO';
            statusEmoji = '🟠';
        }

        let saldoDisplay = '🔒 **Dados Protegidos**\n*Use `f!espiar` ou adquira um Terminal Portátil para acessar*';
        
        // Verifica se o executor tem o terminal (item ou habilidade desbloqueada)
        const hasTerminal = executorDoc.hasPortableTerminal || (executorDoc.inventory && executorDoc.inventory.get('terminal_portatil') > 0);

        if (isSelf || hasTerminal) {
            const wallet = userDoc.wallet.toLocaleString('pt-BR');
            const bank = userDoc.bank.toLocaleString('pt-BR');
            const netWorth = (userDoc.wallet + userDoc.bank).toLocaleString('pt-BR');
            saldoDisplay = `👛 Carteira: **${wallet}**\n🏦 Banco: **${bank}**\n💰 Total: **${netWorth}**`;
        }

        let petDisplay = 'Nenhum companheiro ativo';
        if (userDoc.activePetId) {
            const pet = await Pet.findOne({ id: userDoc.activePetId });
            if (pet) {
                 const rarityEmojis = {
                    'comum': '⚪',
                    'incomum': '🟢',
                    'raro': '🔵',
                    'exclusivo': '✨'
                };
                petDisplay = `${rarityEmojis[pet.rarity] || '🐾'} **${pet.name}** (Lvl ${pet.level})`;
            }
        }

        const jobs = {
            "desempregado": "Desempregado",
            "ajudante": "Ajudante Geral",
            "faxineiro": "Faxineiro",
            "entregador": "Entregador",
            "repositor": "Repositor",
            "atendente": "Atendente",
            "caixa": "Caixa",
            "motoboy": "Motoboy",
            "estoquista": "Estoquista",
            "assistente": "Assistente Adm.",
            "tecnico": "Técnico",
            "supervisor": "Supervisor",
            "gerente": "Gerente",
            "empresario": "Empresário",
            "investidor": "Investidor",
            "ceo": "Diretor Executivo (CEO)",
            "magnata": "Magnata",
            "bilionario": "Bilionário"
        };
        const jobTitle = jobs[userDoc.jobId] || 'Desconhecido';

        let historyDisplay = 'Nenhuma compra recente.';
        if (userDoc.purchaseHistory && userDoc.purchaseHistory.length > 0) {
            const sortedHistory = [...userDoc.purchaseHistory].sort((a, b) => b.date - a.date).slice(0, 3);
            historyDisplay = sortedHistory.map(purchase => {
                const date = new Date(purchase.date).toLocaleDateString('pt-BR');
                return `• ${purchase.item} (-${purchase.price.toLocaleString('pt-BR')}) em ${date}`;
            }).join('\n');
        }

        const streak = userDoc.dailyStreak || 0;

        // Itens Especiais (Relógio de Ouro / Terminal)
        let specialInfo = "";
        
        // Relógio de Ouro (Tempo de Jogo)
        if (userDoc.inventory && userDoc.inventory.get('relogio_bolso') > 0) {
            // Tenta pegar a data de entrada no servidor (se disponível no contexto)
            let joinDate = null;
            if (message.guild) {
                try {
                    const member = await message.guild.members.fetch(targetUser.id);
                    joinDate = member.joinedAt;
                } catch (e) {}
            }
            
            // Se não conseguir (DM ou erro), usa data de criação da conta do Discord
            if (!joinDate) joinDate = targetUser.createdAt;

            const timeDiff = now - joinDate.getTime();
            const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
            specialInfo += `\n⌚ **Tempo de Serviço:** ${days} dias`;

            // Cooldown de Trabalho
            const workCd = 30 * 60 * 1000;
            const workPenalty = (userDoc.workPenalty || 0) * 60 * 1000;
            const lastWork = userDoc.lastWork || 0;
            const nextWork = lastWork + workCd + workPenalty;
            
            if (now < nextWork) {
                const remaining = nextWork - now;
                const m = Math.floor(remaining / 60000);
                const s = Math.floor((remaining % 60000) / 1000);
                specialInfo += `\n👷 **Próximo Trabalho:** ${m}m ${s}s`;
            } else {
                specialInfo += `\n👷 **Próximo Trabalho:** Disponível`;
            }

            // Status de Roubo
            if (userDoc.suspiciousUntil > now) {
                 const remaining = userDoc.suspiciousUntil - now;
                 const m = Math.floor(remaining / 60000);
                 specialInfo += `\n🕵️ **Roubo (Suspeito):** ${m}m`;
            } else if (userDoc.wantedUntil > now) {
                 const remaining = userDoc.wantedUntil - now;
                 const m = Math.floor(remaining / 60000);
                 specialInfo += `\n🚨 **Roubo (Procurado):** ${m}m`;
            } else {
                 specialInfo += `\n🔫 **Roubo:** Disponível`;
            }
        }

        // Terminal Portátil (Badge)
        if (userDoc.hasPortableTerminal || (userDoc.inventory && userDoc.inventory.get('terminal_portatil') > 0)) {
             specialInfo += `\n📱 **Terminal Portátil:** Acesso Remoto Habilitado`;
        }

        const embed = new EmbedBuilder()
            .setColor(colors.default)
            .setTitle(`📂 Dossiê: ${targetUser.username}`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: `${statusEmoji} Status Legal`, value: `**${status}**`, inline: true },
                { name: '💼 Ocupação', value: `**${jobTitle}**`, inline: true },
                { name: '🔥 Sequência Diária', value: `**${streak} dias**`, inline: true },
                { name: '📊 Finanças', value: saldoDisplay, inline: false },
                { name: '🐶 Companheiro Tático', value: petDisplay, inline: false },
                { name: '🛒 Últimas Aquisições', value: historyDisplay, inline: false }
            );

        if (specialInfo) {
            embed.addFields({ name: '🌟 Equipamento Especial', value: specialInfo, inline: false });
        }

        embed.setFooter({ text: `FOXHOUND Database • ID: ${targetUser.id}` })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }
};