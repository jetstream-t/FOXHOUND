const { SlashCommandBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const db = require('../../database');
const colors = require('../../colors.json');

const TICKET_PRICE = 2000;
const PRIZE_PERCENTAGE = 0.10; // 10% do cofre global
const MAX_PRIZE = 1000000; // 1 Milhão

module.exports = {
    data: new SlashCommandBuilder()
        .setName('loteria')
        .setDescription('Sistema de Loteria Global')
        .addSubcommand(subcommand =>
            subcommand
                .setName('comprar')
                .setDescription(`Compre um bilhete por ${TICKET_PRICE} Foxies`))
        .addSubcommand(subcommand =>
            subcommand
                .setName('premio')
                .setDescription('Veja o valor acumulado no cofre global e o próximo sorteio')),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'comprar') {
            await this.buyTicket(interaction, interaction.user, interaction.guildId);
        } else if (subcommand === 'premio') {
            await this.showPrize(interaction);
        }
    },

    async executePrefix(message, args) {
        const sub = args[0] ? args[0].toLowerCase() : 'premio';
        
        if (sub === 'comprar') {
            await this.buyTicket(message, message.author, message.guild.id);
        } else {
            await this.showPrize(message);
        }
    },

    async buyTicket(context, user, guildId) {
        const userData = await db.getUser(user.id);
        
        // Verificar saldo
        if (userData.wallet < TICKET_PRICE) {
            return this.reply(context, `❌ **Saldo Insuficiente.** Você precisa de **${TICKET_PRICE} Foxies** para comprar um bilhete.`);
        }

        // Processar compra
        userData.wallet -= TICKET_PRICE;
        await userData.save();

        // Adicionar ao cofre global e à lista de participantes
        await db.addToVault(TICKET_PRICE, user.id);
        await db.addLotteryParticipant(user.id, guildId);
        
        // Recarregar participantes para contagem atualizada
        const updatedParticipants = await db.getLotteryParticipants();
        // Contagem robusta (suporta strings legadas e objetos novos)
        const userTickets = updatedParticipants.filter(p => {
            const pid = (typeof p === 'object' && p.userId) ? p.userId : p;
            return pid === user.id;
        }).length;

        // --- MISSÃO: PARTICIPAR DA LOTERIA (Removida, mantendo compatibilidade se necessário) ---
        // A missão 'lottery_enter' foi removida, mas o código pode ficar aqui sem efeito ou ser removido.
        // Vamos remover para limpar.

        const vaultAmount = await db.getVault();
        let potentialPrize = Math.floor(vaultAmount * PRIZE_PERCENTAGE);
        if (potentialPrize > MAX_PRIZE) potentialPrize = MAX_PRIZE;

        const nextDraw = await db.getLotteryDrawTime();
        
        // Se não houver data definida (primeira vez), define para 72h a partir de agora
        if (!nextDraw) {
            await db.setLotteryDrawTime(Date.now() + 72 * 60 * 60 * 1000);
        }

        const totalTickets = updatedParticipants.length;
        let winChance = 0;
        if (totalTickets > 0) {
            winChance = (userTickets / totalTickets) * 100;
        }
        const chanceString = winChance === 0 ? "0%" : (winChance < 0.1 ? "<0.1%" : `${winChance.toFixed(1)}%`);

        const embed = new EmbedBuilder()
            .setTitle('🎟️ Bilhete Comprado!')
            .setDescription(`Boa sorte, soldado! Você está concorrendo a uma parte do Cofre Global.\n\n` +
                `💰 **Preço:** ${TICKET_PRICE}\n` +
                `🎫 **Seus Bilhetes:** ${userTickets}\n` +
                `📊 **Sua Chance:** ${chanceString}\n` +
                `🏆 **Prêmio Estimado:** ${potentialPrize} (${potentialPrize >= MAX_PRIZE ? 'LIMITE MÁXIMO' : '10% do Cofre'})\n` +
                `👥 **Total de Bilhetes:** ${updatedParticipants.length}`)
            .setColor(colors.success || '#00FF00')
            .setTimestamp();

        await this.reply(context, { embeds: [embed] });
    },

    async showPrize(context) {
        const vaultAmount = await db.getVault();
        const participants = await db.getLotteryParticipants();
        const nextDraw = await db.getLotteryDrawTime();
        
        // Identificar usuário para cálculo de chance
        const user = context.user || context.author;
        
        // Normalizar participantes e contar
        const normalizedParticipants = participants.map(p => (typeof p === 'object' && p.userId) ? p.userId : p);
        const uniqueParticipants = [...new Set(normalizedParticipants)].length;
        const totalTickets = participants.length;
        const userTickets = normalizedParticipants.filter(id => id === user.id).length;
        
        // Cálculo de Chance
        let winChance = 0;
        if (totalTickets > 0) {
            winChance = (userTickets / totalTickets) * 100;
        }
        
        // Formatar chance (ex: 0.5% ou <0.1%)
        let chanceString = winChance === 0 ? "0%" : (winChance < 0.1 ? "<0.1%" : `${winChance.toFixed(1)}%`);

        let potentialPrize = Math.floor(vaultAmount * PRIZE_PERCENTAGE);
        if (potentialPrize > MAX_PRIZE) potentialPrize = MAX_PRIZE;
        
        const timeLeft = nextDraw ? nextDraw - Date.now() : 0;
        let timeString = "Em breve";
        
        if (timeLeft > 0) {
            const hours = Math.floor(timeLeft / (1000 * 60 * 60));
            const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
            timeString = `${hours}h ${minutes}m`;
        } else if (nextDraw && timeLeft <= 0) {
            timeString = "Sorteio em andamento...";
        }

        const embed = new EmbedBuilder()
            .setTitle('🎰 Loteria Global FOXHOUND')
            .setDescription(`O cofre global acumula taxas de todas as transações e vendas de bilhetes.\n\n` +
                `💰 **Cofre Total:** ${vaultAmount}\n` +
                `🏆 **Prêmio do Vencedor:** ${potentialPrize} (${potentialPrize >= MAX_PRIZE ? 'LIMITE MÁXIMO' : '10%'})\n` +
                `🎟️ **Bilhetes Vendidos:** ${totalTickets}\n` +
                `👥 **Participantes Únicos:** ${uniqueParticipants}\n` +
                `📊 **Sua Chance:** ${chanceString} (${userTickets} bilhetes)\n` +
                `⏳ **Sorteio:** ${timeString}`)
            .setColor('#FFD700')
            .setFooter({ text: `Use /loteria comprar para participar por ${TICKET_PRICE} Foxies` });

        await this.reply(context, { embeds: [embed] });
    },

    async handleButton(interaction) {
        if (interaction.customId === 'lottery_shout_btn') {
            const userData = await db.getUser(interaction.user.id);
            
            if (!userData.pendingLotteryShout) {
                return interaction.reply({ 
                    content: '❌ Apenas o vencedor atual da loteria pode enviar uma mensagem global.', 
                    ephemeral: true 
                });
            }

            const modal = new ModalBuilder()
                .setCustomId('lottery_shout_modal')
                .setTitle('Mensagem Global do Vencedor');

            const messageInput = new TextInputBuilder()
                .setCustomId('lottery_message_text')
                .setLabel("Sua mensagem para o mundo")
                .setPlaceholder("Escreva algo legal (Max 400 caracteres)...")
                .setStyle(TextInputStyle.Paragraph)
                .setMaxLength(400)
                .setRequired(true);

            const firstActionRow = new ActionRowBuilder().addComponents(messageInput);
            modal.addComponents(firstActionRow);

            await interaction.showModal(modal);
        }
    },

    async handleModal(interaction) {
        if (interaction.customId === 'lottery_shout_modal') {
            const text = interaction.fields.getTextInputValue('lottery_message_text');
            await this.sendGlobalMessage(interaction, text);
        }
    },

    async sendGlobalMessage(context, text) {
        // Identificar usuário
        const user = context.user || context.author;
        
        if (!text) {
            return this.reply(context, '❌ Você precisa escrever uma mensagem.');
        }

        // Validação de Tamanho (Redundante com Modal, mas boa prática)
        if (text.length > 400) {
            return this.reply(context, '❌ Sua mensagem não pode ter mais de **400 caracteres**.');
        }

        // Verificar Permissão no Banco
        const userData = await db.getUser(user.id);
        if (!userData.pendingLotteryShout) {
            return this.reply(context, '❌ Você não tem permissão ou já enviou sua mensagem.');
        }

        // Filtro de Palavras Ofensivas (Básico)
        const badWords = ['pinto', 'buceta', 'caralho', 'filha da puta', 'arrombado', 'foder', 'transar', 'gozar', 'corno', 'vadia', 'puta', 'vagabunda', 'hitler', 'nazista', 'suicidio', 'estupro', 'pedofilia', 'macaco', 'preto encardido', 'viado', 'boiola', 'bicha', 'traveco'];
        const lowerText = text.toLowerCase();
        
        if (badWords.some(word => lowerText.includes(word))) {
             return this.reply(context, '🚫 **Mensagem Bloqueada:** Conteúdo ofensivo detectado. Mantenha o respeito.');
        }

        // Consumir o direito
        userData.pendingLotteryShout = false;
        await userData.save();

        // Enviar Anúncio Global
        const embed = new EmbedBuilder()
            .setTitle('📢 Mensagem do Vencedor da Loteria')
            .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
            .setDescription(`"${text}"`)
            .setColor('#FFD700') // Gold
            .setFooter({ text: 'Enviado pelo Vencedor da Loteria' })
            .setTimestamp();

        // Se for modal, responde a interação e envia global
        if (context.isModalSubmit && context.isModalSubmit()) {
            await context.reply({ content: '✅ **Sucesso!** Sua mensagem está sendo enviada para todos os servidores.', ephemeral: true });
        } else {
            await this.reply(context, '✅ **Sucesso!** Sua mensagem está sendo enviada para todos os servidores.');
        }

        // Usar o client do context
        const client = context.client;
        
        // Iterar Guildas (Copiado lógica de broadcast do scheduler, mas simplificada)
        client.guilds.cache.forEach(async guild => {
            try {
                const config = await db.GuildConfig.findOne({ guildId: guild.id });
                // Prioridade: Canal do último comando > Canal de Logs > Canal de Sistema > Primeiro canal de texto
                let channelId = config?.lastCommandChannelId || config?.logsChannel; 
                let channel = null;

                if (channelId) {
                    channel = guild.channels.cache.get(channelId);
                }

                if (!channel && config?.lastCommandChannelId) {
                     // Se o canal do último comando não foi encontrado, tenta logsChannel
                     channelId = config?.logsChannel;
                     if (channelId) channel = guild.channels.cache.get(channelId);
                }

                if (!channel) {
                     // Tenta systemChannel
                     channel = guild.systemChannel;
                }
                
                if (!channel) {
                     // Tenta achar um canal de texto onde o bot fala
                     channel = guild.channels.cache.find(c => c.type === 0 && c.permissionsFor(guild.members.me).has('SendMessages'));
                }

                if (channel) {
                    await channel.send({ embeds: [embed] }).catch(() => {});
                }
            } catch (err) {
                // Silently fail per guild
            }
        });
    },

    reply(context, content) {
        if (context.reply) {
            return context.reply(typeof content === 'string' ? { content, ephemeral: false } : content);
        }
        return context.channel.send(content);
    }
};
