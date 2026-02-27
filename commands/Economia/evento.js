const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const eventSystem = require('../../systems/eventSystem');
const colors = require('../../colors.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('evento')
        .setDescription('📅 Exibe o Evento Global ativo no momento e seus efeitos.'),

    async execute(interaction) {
        await this.showEventInfo(interaction);
    },

    async executePrefix(message, args) {
        await this.showEventInfo(message);
    },

    async showEventInfo(context) {
        const activeEvent = await eventSystem.getWeeklyEvent();
        const replyMethod = context.reply ? context.reply.bind(context) : context.channel.send.bind(context.channel);

        if (!activeEvent) {
            const embed = new EmbedBuilder()
                .setTitle('🌍 Evento Global')
                .setDescription('Não há nenhum evento global ativo no momento. A calmaria reina... por enquanto.')
                .setColor(colors.default)
                .setFooter({ text: 'Novos eventos são sorteados semanalmente!' });
            return replyMethod({ embeds: [embed] });
        }

        // Definir cor e ícone baseados no tipo
        let color = colors.default;
        let icon = '🌍';
        let typeName = 'Normal';

        switch (activeEvent.type) {
            case 'good':
                color = '#00FF00'; // Verde
                icon = '🟢';
                typeName = 'Benéfico';
                break;
            case 'bad':
                color = '#FF0000'; // Vermelho
                icon = '🔴';
                typeName = 'Prejudicial';
                break;
            case 'rare':
                color = '#FFD700'; // Dourado
                icon = '🟣';
                typeName = 'LENDÁRIO';
                break;
        }

        // Formatar tempo restante
        const now = Date.now();
        const timeLeft = activeEvent.expiresAt - now;
        let timeString = 'Expirado';

        if (timeLeft > 0) {
            const days = Math.floor(timeLeft / (24 * 60 * 60 * 1000));
            const hours = Math.floor((timeLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
            const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
            timeString = `${days}d ${hours}h ${minutes}m`;
        }

        // Traduzir efeitos
        const effectsList = [];
        const effects = activeEvent.effects || {};

        const formatEffect = (key, value) => {
            const isPercentage = (val) => `${Math.abs(Math.round((val - 1) * 100))}%`;
            const isBoost = (val) => `${Math.round(val * 100)}%`;
            
            switch (key) {
                case 'work_money_mult':
                    return value > 1 
                        ? `💰 **Salários:** +${isPercentage(value)}` 
                        : `📉 **Salários:** -${isPercentage(value)}`;
                case 'global_xp_mult':
                    return `🎓 **XP Global:** ${value}x`;
                case 'shop_discount':
                    return `🏷️ **Loja:** ${value * 100}% de Desconto`;
                case 'crime_success_boost':
                    return value > 0 
                        ? `🔫 **Crimes:** +${isBoost(value)} Chance` 
                        : `🚓 **Crimes:** ${isBoost(value)} Chance`;
                case 'pet_decay_immunity':
                    return `🛡️ **Pets:** Imunidade a Fome/Tristeza`;
                case 'bank_interest_mult':
                    return `🏦 **Juros Banco:** ${value}x`;
                case 'work_item_drop_chance':
                    return `🎁 **Trabalho:** Chance de Drop de Itens`;
                case 'work_cooldown_mult':
                    return `⚡ **Trabalho:** Cooldown ${value < 1 ? 'Reduzido' : 'Aumentado'} (${isPercentage(value)})`;
                case 'pet_interaction_mult':
                    return `💕 **Pets:** Interação ${value}x mais efetiva`;
                case 'crime_fine_mult':
                    return `👮 **Multas:** ${value < 1 ? 'Reduzidas' : 'Aumentadas'} (${isPercentage(value)})`;
                case 'shop_price_mult':
                    return `💸 **Loja:** Preços ${value > 1 ? 'Aumentados' : 'Reduzidos'} (${isPercentage(value)})`;
                case 'pet_decay_mult':
                    return `🥀 **Pets:** Perdem status ${value}x mais rápido`;
                default:
                    return `❓ **${key}:** ${value}`;
            }
        };

        for (const [key, value] of Object.entries(effects)) {
            effectsList.push(formatEffect(key, value));
        }

        const embed = new EmbedBuilder()
            .setTitle(`${icon} Evento Global: ${activeEvent.name}`)
            .setDescription(`**${activeEvent.description}**\n\nEste evento afeta todos os jogadores do servidor! Aproveite (ou se proteja) enquanto durar.`)
            .setColor(color)
            .addFields(
                { name: '📊 Tipo', value: typeName, inline: true },
                { name: '⏳ Expira em', value: timeString, inline: true },
                { name: '✨ Efeitos Ativos', value: effectsList.length > 0 ? effectsList.join('\n') : 'Nenhum efeito visível.' }
            )
            .setFooter({ text: 'Eventos mudam semanalmente. Fique atento ao comando /evento!' })
            .setTimestamp();

        // Se for raro, adicionar thumbnail ou imagem especial se quiser
        if (activeEvent.type === 'rare') {
            embed.setThumbnail('https://cdn-icons-png.flaticon.com/512/616/616490.png'); // Exemplo de ícone de estrela/troféu
        }

        return replyMethod({ embeds: [embed] });
    }
};
